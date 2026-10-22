import { h, icon, money, tee, mediaUrl, toast, setCurrency } from './ui.js';

const app = document.getElementById('app');
const api = async (path, { method = 'GET', body, raw } = {}) => {
  const r = await fetch('/api/internal/' + path, {
    method, headers: { 'X-Atelier': '1', ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...(raw ? { 'Content-Type': raw.type } : {}) },
    body: raw ? raw : body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 404) throw new Error('Session expired. Reload the page.');
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
};
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

api('me').then(d => { document.getElementById('who').textContent = d.email; }).catch(e => toast(e.message, true));

// ---------------- list ----------------
async function list() {
  app.replaceChildren(h('p', {}, 'Loading...'));
  let ps;
  try { ps = await api('products'); } catch (e) { return app.replaceChildren(h('p', { class: 'msg' }, e.message)); }
  const toPayload = (p, status) => ({ name: p.name, slug: p.slug, description: p.description, price_cents: p.price_cents, status, images: p.images,
    variants: p.variants.map(v => ({ color: v.color, hex: v.hex, size: v.size, stock: v.stock })) });
  const setStatus = async (p, status) => { try { await api('products?id=' + p.id, { method: 'PUT', body: toPayload(p, status) }); toast(status === 'published' ? 'Published' : status === 'draft' ? 'Unpublished' : 'Saved'); list(); } catch (e) { toast(e.message, true); } };
  const dlg = h('dialog', {}, h('p', {}, ''), h('div', { class: 'acts crow' }));
  const confirmArchive = (p) => {
    dlg.querySelector('p').textContent = `Archive "${p.name}"? It disappears from the shop. You can republish it later.`;
    dlg.querySelector('.acts').replaceChildren(
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'),
      h('button', { class: 'btn danger', type: 'button', onclick: async () => { dlg.close(); try { await api('products?id=' + p.id, { method: 'DELETE' }); toast('Archived'); list(); } catch (e) { toast(e.message, true); } } }, 'Archive'));
    dlg.showModal();
  };
  const q = h('input', { type: 'text', 'aria-label': 'Search products', placeholder: 'Search', oninput: () => draw() });
  const filter = h('select', { 'aria-label': 'Filter by status', onchange: () => draw() }, ['all', 'draft', 'published', 'archived'].map(s => h('option', { value: s }, s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1))));
  const tbody = h('tbody');
  const draw = () => {
    const rows = ps.filter(p => (filter.value === 'all' || p.status === filter.value) && (p.name + p.slug).toLowerCase().includes(q.value.toLowerCase()));
    tbody.replaceChildren(...rows.map(p => h('tr', {},
      h('td', {}, h('strong', {}, p.name), h('br'), h('span', { class: 'note' }, p.slug)),
      h('td', {}, money(p.price_cents)),
      h('td', {}, h('span', { class: 'badge ' + p.status }, p.status)),
      h('td', {}, p.variants.reduce((n, v) => n + v.stock, 0)),
      h('td', {}, h('div', { class: 'acts' },
        h('button', { class: 'link', type: 'button', onclick: () => form(p) }, 'Edit'),
        p.status === 'published' ? h('button', { class: 'link', type: 'button', onclick: () => setStatus(p, 'draft') }, 'Unpublish')
          : h('button', { class: 'link', type: 'button', onclick: () => setStatus(p, 'published') }, 'Publish'),
        p.status !== 'archived' ? h('button', { class: 'link', type: 'button', onclick: () => confirmArchive(p) }, 'Archive') : null)))));
    if (!rows.length) tbody.replaceChildren(h('tr', {}, h('td', { colSpan: 5, class: 'note' }, 'No products yet. Add your first one.')));
  };
  app.replaceChildren(h('div', { class: 'crow' }, h('button', { class: 'btn primary', type: 'button', onclick: () => form(null) }, 'New product'), q, filter),
    h('div', { class: 'tblwrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Product', 'Price', 'Status', 'Stock', ''].map(t => h('th', {}, t)))), tbody)), dlg);
  draw();
}

// ---------------- form ----------------
function form(p) {
  const s = {
    id: p?.id || null, name: p?.name || '', slug: p?.slug || '', slugTouched: !!p, description: p?.description || '',
    price: p ? (p.price_cents / 100).toFixed(2) : '', status: p?.status || 'draft', images: p ? p.images.map(i => ({ ...i })) : [],
    colors: p ? [...new Map(p.variants.map(v => [v.color, v.hex]))].map(([name, hex]) => ({ name, hex })) : [{ name: 'Cyan', hex: '#00bcd8' }],
    sizes: p ? [...new Set(p.variants.map(v => v.size))] : ['S', 'M', 'L', 'XL'],
    stock: new Map(p ? p.variants.map(v => [v.color + '|' + v.size, v.stock]) : []),
  };
  let dirty = false;
  const mark = () => { dirty = true; };
  const root = h('div');
  const err = h('p', { class: 'msg', role: 'alert' });

  const draw = () => {
    const name = h('input', { type: 'text', id: 'f-name', maxLength: 80, value: s.name, oninput: (e) => { s.name = e.target.value; mark(); if (!s.slugTouched) { s.slug = slugify(s.name); slug.value = s.slug; } } });
    const slug = h('input', { type: 'text', id: 'f-slug', maxLength: 80, value: s.slug, oninput: (e) => { s.slug = e.target.value; s.slugTouched = true; mark(); } });
    const price = h('input', { type: 'number', id: 'f-price', min: '0.5', step: '0.01', value: s.price, oninput: (e) => { s.price = e.target.value; mark(); } });
    const status = h('select', { id: 'f-status', onchange: (e) => { s.status = e.target.value; mark(); } }, ['draft', 'published', 'archived'].map(v => h('option', { value: v, selected: v === s.status }, v[0].toUpperCase() + v.slice(1))));
    const desc = h('textarea', { id: 'f-desc', maxLength: 2000, value: s.description, oninput: (e) => { s.description = e.target.value; mark(); } });

    const colors = s.colors.map((c, i) => h('div', { class: 'crow' },
      h('input', { type: 'color', 'aria-label': 'Color value', value: c.hex, oninput: (e) => { c.hex = e.target.value; mark(); } }),
      h('input', { type: 'text', 'aria-label': 'Color name', maxLength: 30, value: c.name, placeholder: 'Color name', oninput: (e) => { const old = c.name; c.name = e.target.value; for (const z of s.sizes) { const v = s.stock.get(old + '|' + z); if (v != null) { s.stock.delete(old + '|' + z); s.stock.set(c.name + '|' + z, v); } } mark(); } }),
      s.colors.length > 1 ? h('button', { class: 'link', type: 'button', onclick: () => { s.colors.splice(i, 1); mark(); draw(); } }, 'Remove') : null));
    const sizes = [...new Set([...SIZES, ...s.sizes])].map(z => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: s.sizes.includes(z), onchange: (e) => { s.sizes = e.target.checked ? [...s.sizes, z] : s.sizes.filter(x => x !== z); mark(); draw(); } }), z));
    const custom = h('input', { type: 'text', 'aria-label': 'Custom size', maxLength: 10, placeholder: 'Custom size' });
    const stock = h('div', { class: 'stock' }, h('table', {}, h('thead', {}, h('tr', {}, h('th'), s.sizes.map(z => h('th', {}, z)))),
      h('tbody', {}, s.colors.filter(c => c.name.trim()).map(c => h('tr', {}, h('th', {}, h('span', { class: 'chk' }, h('i', { class: 'dots', style: { '--c': c.hex } }), c.name)),
        s.sizes.map(z => h('td', {}, h('input', { type: 'number', min: '0', max: '100000', step: '1', 'aria-label': `${c.name} ${z} stock`, value: s.stock.get(c.name + '|' + z) ?? 0, oninput: (e) => { s.stock.set(c.name + '|' + z, Number(e.target.value)); mark(); } }))))))));

    const move = (i, d) => { const j = i + d; if (j < 0 || j >= s.images.length) return; [s.images[i], s.images[j]] = [s.images[j], s.images[i]]; mark(); draw(); };
    const imgs = h('div', { class: 'imgs' }, s.images.map((im, i) => h('figure', {}, h('img', { src: mediaUrl(im.key), alt: '' }),
      h('input', { type: 'text', 'aria-label': `Alt text for photo ${i + 1}`, placeholder: 'Describe the photo', maxLength: 140, value: im.alt, oninput: (e) => { im.alt = e.target.value; mark(); } }),
      h('div', { class: 'acts' },
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move earlier', disabled: i === 0, onclick: () => move(i, -1) }, icon('up')),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Move later', disabled: i === s.images.length - 1, onclick: () => move(i, 1) }, icon('down')),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove photo', onclick: () => { s.images.splice(i, 1); mark(); draw(); } }, icon('close'))))));
    const upload = async (files) => {
      for (const f of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024) { toast(`${f.name}: use JPEG, PNG or WebP under 5 MB`, true); continue; }
        if (s.images.length >= 8) { toast('Up to 8 photos', true); break; }
        try { const d = await api('upload', { method: 'POST', raw: f }); s.images.push({ key: d.key, alt: '' }); mark(); draw(); } catch (e) { toast(e.message, true); }
      }
    };
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, class: 'sr', id: 'f-file', onchange: (e) => upload([...e.target.files]) });
    const drop = h('label', { class: 'drop', for: 'f-file', ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
      ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files]); } }, 'Drop photos here or choose files (JPEG, PNG, WebP, 5 MB max)');

    root.replaceChildren(
      h('div', { class: 'fgrid' }, f('Name', 'f-name', name), f('Slug (web address)', 'f-slug', slug), f('Price', 'f-price', price), f('Status', 'f-status', status)),
      f('Description', 'f-desc', desc),
      h('div', { class: 'sect' }, h('h2', {}, 'Colors'), colors, h('button', { class: 'btn', type: 'button', onclick: () => { s.colors.push({ name: '', hex: '#5f7f92' }); mark(); draw(); } }, 'Add color')),
      h('div', { class: 'sect' }, h('h2', {}, 'Sizes'), h('div', {}, sizes), h('div', { class: 'crow' }, custom, h('button', { class: 'btn', type: 'button', onclick: () => { const v = custom.value.trim(); if (/^[A-Za-z0-9 .\-]{1,10}$/.test(v) && !s.sizes.includes(v)) { s.sizes.push(v); mark(); draw(); } } }, 'Add size'))),
      h('div', { class: 'sect' }, h('h2', {}, 'Stock'), stock),
      h('div', { class: 'sect' }, h('h2', {}, 'Photos'), file, drop, imgs),
      err,
      h('div', { class: 'crow sect' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => save(s.status === 'archived' ? 'archived' : 'draft') }, 'Save draft'),
        h('button', { class: 'btn', type: 'button', onclick: () => save('published') }, 'Publish'),
        h('button', { class: 'link', type: 'button', onclick: leave }, 'Back to products')));
  };
  const f = (label, id, el) => h('div', { class: 'fld' }, h('label', { for: id }, label), el);
  const leave = () => { if (!dirty || confirm('Discard unsaved changes?')) list(); };
  const save = async (status) => {
    err.textContent = '';
    const cents = Math.round(parseFloat(s.price) * 100);
    const variants = [];
    for (const c of s.colors.filter(c => c.name.trim())) for (const z of s.sizes) variants.push({ color: c.name.trim(), hex: c.hex, size: z, stock: Math.max(0, Math.floor(Number(s.stock.get(c.name + '|' + z) || 0))) });
    if (!Number.isFinite(cents)) { err.textContent = 'Enter a price.'; return; }
    if (new Set(s.colors.map(c => c.name.trim().toLowerCase())).size !== s.colors.length) { err.textContent = 'Each color needs a unique name.'; return; }
    try {
      const body = { name: s.name.trim(), slug: s.slug, description: s.description, price_cents: cents, status, images: s.images.map(i => ({ key: i.key, alt: i.alt.trim() })), variants };
      const d = await api('products' + (s.id ? '?id=' + s.id : ''), { method: s.id ? 'PUT' : 'POST', body });
      s.id = d.id; s.status = status; dirty = false;
      toast(status === 'published' ? 'Published' : 'Saved'); list();
    } catch (e) { err.textContent = e.message; }
  };
  app.replaceChildren(h('h2', {}, p ? 'Edit product' : 'New product'), root);
  draw();
  addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
}
list();
