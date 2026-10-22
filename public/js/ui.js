const NS = 'http://www.w3.org/2000/svg';
export const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('aria-') && v != null) { e.setAttribute(k, String(v)); continue; }
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') for (const [a, b] of Object.entries(v)) e.style.setProperty(a, b); // CSSOM: allowed by strict CSP
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (['href', 'src', 'value', 'type', 'disabled', 'checked', 'hidden', 'id', 'title', 'alt', 'min', 'max', 'name', 'selected', 'multiple', 'accept', 'rows', 'maxLength', 'required', 'readOnly'].includes(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};

const P = {
  cart: '<path d="M3 4h3l2.2 11h10.3L20.5 7H7"/><path d="M9 20h2M16 20h2"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  sun: '<path d="M9 9h6v6H9z"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  moon: '<path d="M16 3H9L5 8v8l4 5h7l-5-5V8z"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
};
export function icon(name) { // constant strings only
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linejoin': 'miter', 'stroke-linecap': 'butt', 'aria-hidden': 'true' })) s.setAttribute(k, v);
  s.innerHTML = P[name];
  return s;
}
export const hydrateIcons = (root = document) => root.querySelectorAll('[data-icon]:not(:has(svg))').forEach(n => n.append(icon(n.dataset.icon)));

// Sharp tee silhouette, tinted with the variant colour. Used when a product has no photo yet.
export function tee(hex) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'tee');
  s.innerHTML = '<polygon points="30,10 42,10 50,19 58,10 70,10 94,27 83,43 72,36 72,92 28,92 28,36 17,43 6,27"/><polyline points="42,10 50,19 58,10"/>';
  s.style.setProperty('--c', /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#5F7F92');
  return s;
}
export const mediaUrl = (key) => '/api/media/' + encodeURIComponent(key);

let cur = 'USD';
export const setCurrency = (c) => { cur = c || 'USD'; };
export const money = (cents) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(cents / 100);

export function toast(text, err = false) {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, text);
  box.append(t); setTimeout(() => t.remove(), 4000);
}
hydrateIcons();
