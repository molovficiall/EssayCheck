import { h, icon, tee, money, mediaUrl, toast } from './ui.js';
import { loadCatalog, mountCart, add, openCart } from './cart.js';

mountCart();
const root = document.getElementById('pdp');
const slug = new URLSearchParams(location.search).get('slug') || '';
const { products } = await loadCatalog().catch(() => ({ products: [] }));
const p = products.find(x => x.slug === slug);
if (!p) root.replaceWith(h('div', { class: 'center' }, h('h1', {}, 'Not found'), h('p', {}, "That shirt isn't available."), h('a', { class: 'btn', href: '/' }, 'Back to shop')));
else {
  document.title = `${p.name} | Idek Shirts`;
  const colors = [...new Map(p.variants.map(v => [v.color, v.hex]))];
  const sizesAll = [...new Set(p.variants.map(v => v.size))];
  let color = (p.variants.find(v => v.stock > 0) || p.variants[0]).color, size = '', qty = 1, img = 0;
  const gallery = h('div', { class: 'gallery' }), panel = h('div', { class: 'panel' });
  root.replaceChildren(gallery, panel);

  const variant = () => p.variants.find(v => v.color === color && v.size === size);
  const draw = () => {
    const hex = colors.find(c => c[0] === color)[1];
    const main = h('div', { class: 'pic' }, p.images.length ? h('img', { src: mediaUrl(p.images[img].key), alt: p.images[img].alt }) : tee(hex));
    gallery.replaceChildren(main, p.images.length > 1 ? h('div', { class: 'thumbs' }, p.images.map((im, i) =>
      h('button', { type: 'button', 'aria-label': `Photo ${i + 1}`, 'aria-current': i === img, onclick: () => { img = i; draw(); } }, h('img', { src: mediaUrl(im.key), alt: '' })))) : null);

    const sw = colors.map(([name, hx]) => h('button', { class: 'sw', type: 'button', style: { '--c': hx }, 'aria-label': name, 'aria-pressed': name === color,
      disabled: !p.variants.some(v => v.color === name && v.stock > 0), onclick: () => { color = name; if (size && !variant()?.stock) size = ''; qty = 1; draw(); } }));
    const sz = sizesAll.map(s => { const v = p.variants.find(x => x.color === color && x.size === s);
      return h('button', { class: 'sz', type: 'button', 'aria-pressed': s === size, disabled: !v || v.stock < 1, onclick: () => { size = s; qty = Math.min(qty, v.stock); draw(); } }, s); });
    const v = variant(), max = v ? Math.min(10, v.stock) : 10;
    panel.replaceChildren(
      h('h1', {}, p.name), h('span', { class: 'price' }, money(p.price_cents)),
      h('fieldset', { class: 'field' }, h('legend', {}, 'Color ', h('span', {}, color)), h('div', { class: 'swatches' }, sw)),
      h('fieldset', { class: 'field' }, h('legend', {}, 'Size'), h('div', { class: 'sizes' }, sz)),
      h('div', { class: 'field' }, h('label', {}, 'Quantity'), h('div', { class: 'qty' },
        h('button', { type: 'button', 'aria-label': 'Decrease quantity', disabled: qty <= 1, onclick: () => { qty--; draw(); } }, icon('minus')),
        h('output', { 'aria-live': 'polite' }, qty),
        h('button', { type: 'button', 'aria-label': 'Increase quantity', disabled: qty >= max, onclick: () => { qty++; draw(); } }, icon('plus')))),
      h('button', { class: 'btn primary block', type: 'button', disabled: !size, onclick: () => { add(variant().id, qty); toast('Added to cart'); openCart(); } }, size ? 'Add to cart' : 'Choose a size'),
      v && v.stock > 0 && v.stock <= 3 ? h('p', { class: 'note' }, `Only ${v.stock} left in this size.`) : null,
      h('p', { class: 'desc' }, p.description));
  };
  draw();
}
