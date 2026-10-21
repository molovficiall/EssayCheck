import { h, icon, money, setCurrency, tee, mediaUrl, hydrateIcons, toast } from './ui.js';

const KEY = 'idek-cart';
let items = [];                       // [{ vid, qty }] - no prices are ever stored client-side
let cat = { products: [], byVid: new Map() };
const subs = new Set();

try {
  const a = JSON.parse(localStorage.getItem(KEY) || '[]');
  if (Array.isArray(a)) items = a.filter(x => x && typeof x.vid === 'string' && Number.isInteger(x.qty) && x.qty > 0 && x.qty <= 10).slice(0, 25);
} catch { items = []; }

const emit = () => subs.forEach(f => f());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} emit(); };
addEventListener('storage', (e) => { if (e.key === KEY) { try { items = JSON.parse(e.newValue || '[]'); } catch { items = []; } emit(); } });

export async function loadCatalog() {
  const r = await fetch('/api/products');
  if (!r.ok) throw new Error('Could not load products');
  const d = await r.json();
  setCurrency(d.currency);
  cat = { products: d.products, byVid: new Map() };
  for (const p of d.products) for (const v of p.variants) cat.byVid.set(v.id, { p, v });
  emit();
  return cat;
}
const cap = (vid) => Math.min(10, cat.byVid.get(vid)?.v.stock ?? 0);
export const cartCount = () => items.reduce((n, i) => n + i.qty, 0);

export function add(vid, qty = 1) {
  const i = items.find(x => x.vid === vid), max = cap(vid);
  if (max < 1) return toast('Sold out', true);
  if (i) i.qty = Math.min(max, i.qty + qty); else items.push({ vid, qty: Math.min(max, qty) });
  save();
}
const setQty = (vid, q) => { const i = items.find(x => x.vid === vid); if (i) i.qty = Math.max(1, Math.min(cap(vid), q)); save(); };
const remove = (vid) => { items = items.filter(x => x.vid !== vid); save(); };
function swap(oldVid, newVid) {          // change colour/size of a cart line; merge if the target line already exists
  if (oldVid === newVid || cap(newVid) < 1) return;
  const i = items.findIndex(x => x.vid === oldVid), j = items.findIndex(x => x.vid === newVid);
  if (i < 0) return;
  if (j >= 0) { items[j].qty = Math.min(cap(newVid), items[j].qty + items[i].qty); items.splice(i, 1); }
  else items[i] = { vid: newVid, qty: Math.min(items[i].qty, cap(newVid)) };
  save();
}

// ---------- drawer ----------
let drawer, scrim, list, subtotal, checkoutBtn, msg, opener;
const lastColors = (p) => [...new Map(p.variants.map(v => [v.color, v.hex]))];

function thumb(p, v) {
  const t = h('div', { class: 'th' });
  t.append(p.images[0] ? h('img', { src: mediaUrl(p.images[0].key), alt: '', loading: 'lazy' }) : tee(v.hex));
  return t;
}
function stepper(it, max) {
  return h('div', { class: 'qty', role: 'group', 'aria-label': 'Quantity' },
    h('button', { type: 'button', 'aria-label': 'Decrease quantity', disabled: it.qty <= 1, onclick: () => setQty(it.vid, it.qty - 1) }, icon('minus')),
    h('output', { 'aria-live': 'polite' }, it.qty),
    h('button', { type: 'button', 'aria-label': 'Increase quantity', disabled: it.qty >= max, onclick: () => setQty(it.vid, it.qty + 1) }, icon('plus')));
}
function lineEl(it) {
  const x = cat.byVid.get(it.vid);
  if (!x) return h('li', { class: 'line gone' }, h('div', { class: 'info' }, h('p', {}, 'This item is no longer available.'), h('button', { class: 'link rm', type: 'button', onclick: () => remove(it.vid) }, 'Remove')));
  const { p, v } = x;
  const swatches = lastColors(p).map(([color, hex]) => {
    const pick = p.variants.find(c => c.color === color && c.size === v.size && c.stock > 0) || p.variants.find(c => c.color === color && c.stock > 0);
    return h('button', { class: 'sw', type: 'button', style: { '--c': hex }, 'aria-label': color, 'aria-pressed': color === v.color, disabled: !pick, onclick: () => pick && swap(it.vid, pick.id) });
  });
  const sizes = p.variants.filter(c => c.color === v.color);
  const sel = h('select', { 'aria-label': 'Size', onchange: (e) => swap(it.vid, e.target.value) },
    sizes.map(s => h('option', { value: s.id, selected: s.id === v.id, disabled: s.stock < 1 && s.id !== v.id }, s.size + (s.stock < 1 ? ' (sold out)' : ''))));
  return h('li', { class: 'line' }, thumb(p, v),
    h('div', { class: 'info' }, h('a', { href: '/product?slug=' + encodeURIComponent(p.slug) }, p.name),
      h('div', { class: 'row' }, swatches, sel), h('div', { class: 'row' }, stepper(it, cap(it.vid))),
      h('button', { class: 'link rm', type: 'button', onclick: () => remove(it.vid) }, 'Remove')),
    h('div', { class: 'ltotal' }, money(p.price_cents * it.qty)));
}
function render() {
  document.querySelectorAll('[data-cart-count]').forEach(n => { const c = cartCount(); n.textContent = c; n.hidden = !c; });
  if (!drawer) return;
  list.replaceChildren(...(items.length ? items.map(lineEl) : [h('li', { class: 'cart-empty' }, 'Your cart is empty.')]));
  const valid = items.filter(i => cat.byVid.has(i.vid));
  subtotal.textContent = money(valid.reduce((s, i) => s + cat.byVid.get(i.vid).p.price_cents * i.qty, 0));
  checkoutBtn.disabled = !valid.length || valid.length !== items.length;
}
async function checkout() {
  checkoutBtn.disabled = true; msg.textContent = '';
  try {
    const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: items.map(i => ({ vid: i.vid, qty: i.qty })) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Checkout failed. Try again.');
    if (!/^https:\/\/checkout\.stripe\.com\//.test(d.url)) throw new Error('Unexpected response from checkout.');
    location.assign(d.url);
  } catch (e) { msg.textContent = e.message; checkoutBtn.disabled = false; loadCatalog().catch(() => {}); }
}
const others = () => [...document.body.children].filter(n => n !== drawer && n !== scrim && !n.classList.contains('toasts'));
export function openCart() {
  opener = document.activeElement; drawer.classList.add('on'); scrim.classList.add('on');
  others().forEach(n => n.setAttribute('inert', '')); // native focus containment
  document.body.style.overflow = 'hidden'; drawer.querySelector('button').focus(); render();
}
export function closeCart() {
  drawer.classList.remove('on'); scrim.classList.remove('on');
  others().forEach(n => n.removeAttribute('inert')); document.body.style.overflow = '';
  opener?.focus?.();
}
export function mountCart() {
  scrim = h('div', { class: 'scrim', onclick: closeCart });
  list = h('ul', { class: 'lines' });
  subtotal = h('span', {}, '');
  msg = h('p', { class: 'msg', role: 'alert' });
  checkoutBtn = h('button', { class: 'btn primary block', type: 'button', onclick: checkout }, 'Checkout');
  drawer = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Cart' },
    h('header', {}, h('h2', {}, 'Cart'), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close cart', onclick: closeCart }, icon('close'))),
    list, h('footer', {}, h('div', { class: 'sub' }, h('span', {}, 'Subtotal'), subtotal),
      h('p', { class: 'note' }, 'Shipping and tax are calculated at checkout.'), checkoutBtn, msg));
  document.body.append(scrim, drawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('on')) closeCart(); });
  document.addEventListener('click', e => { if (e.target.closest('[data-cart-open]')) openCart(); });
  subs.add(render); hydrateIcons(); render();
}
