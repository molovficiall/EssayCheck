import { h, tee, money, mediaUrl } from './ui.js';
import { loadCatalog, mountCart } from './cart.js';

mountCart();
const grid = document.getElementById('grid');
try {
  const { products } = await loadCatalog();
  if (!products.length) grid.replaceWith(h('p', { class: 'empty' }, "Nothing's out yet. New shirts show up here the moment they're released."));
  for (const p of products) {
    const colors = [...new Map(p.variants.map(v => [v.color, v.hex]))];
    const out = p.variants.every(v => v.stock < 1);
    const pic = h('div', { class: 'pic' }, p.images[0] ? h('img', { src: mediaUrl(p.images[0].key), alt: p.images[0].alt, loading: 'lazy' }) : tee(colors[0][1]));
    grid.append(h('a', { class: 'tile', href: '/product?slug=' + encodeURIComponent(p.slug) }, pic,
      h('div', { class: 'meta' }, h('strong', {}, p.name), h('span', { class: 'price' }, out ? h('span', { class: 'soldout' }, 'Sold out') : money(p.price_cents))),
      h('div', { class: 'dots', 'aria-label': 'Colors: ' + colors.map(c => c[0]).join(', ') }, colors.map(([, hex]) => h('i', { style: { '--c': hex } })))));
  }
} catch { grid.replaceWith(h('p', { class: 'empty' }, "Couldn't load the shop. Refresh to try again.")); }
