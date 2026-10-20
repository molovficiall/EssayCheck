import { h } from './dom.js';
import { request } from './api.js';
import { cartStore } from './store.js';

const slug = new URLSearchParams(location.search).get('slug');
const panel = document.querySelector('[data-product-panel]');
const mainImage = document.querySelector('[data-main-image]');
const thumbs = document.querySelector('[data-thumbnails]');
const error = document.querySelector('[data-product-error]');
let product;
let color;
let size;
let qty = 1;

function displayPrice() {
  const variant = product?.variants.find(
    (entry) => entry.colorId === color?.id && entry.size === size,
  );
  const cents = variant?.priceCents ?? product?.priceCents ?? 0;
  panel.querySelector('[data-price]').textContent = new Intl.NumberFormat(
    undefined,
    { style: 'currency', currency: product.currency.toUpperCase() },
  ).format(cents / 100);
}

function paint() {
  const colors = product.colors || [];
  const sizes = [...new Set(product.variants.map((variant) => variant.size))];
  const colorRow = h(
    'div',
    { className: 'option-row', role: 'group', 'aria-label': 'Color' },
    ...colors.map((entry) =>
      h(
        'button',
        {
          className: 'option-button',
          type: 'button',
          'aria-pressed': String(color?.id === entry.id),
          'aria-label': entry.name,
          title: entry.name,
          style: `background-color:${entry.hex}`,
          onclick: () => {
            color = entry;
            paint();
          },
        },
        color?.id === entry.id ? '✓' : '',
      ),
    ),
  );
  const sizeRow = h(
    'div',
    { className: 'option-row', role: 'group', 'aria-label': 'Size' },
    ...sizes.map((entry) =>
      h(
        'button',
        {
          className: 'option-button',
          type: 'button',
          'aria-pressed': String(size === entry),
          onclick: () => {
            size = entry;
            paint();
          },
        },
        entry,
      ),
    ),
  );
  const quantity = h(
    'div',
    { className: 'quantity' },
    h(
      'button',
      {
        type: 'button',
        'aria-label': 'Decrease quantity',
        onclick: () => {
          qty = Math.max(1, qty - 1);
          paint();
        },
      },
      '−',
    ),
    h('output', {}, qty),
    h(
      'button',
      {
        type: 'button',
        'aria-label': 'Increase quantity',
        onclick: () => {
          qty = Math.min(10, qty + 1);
          paint();
        },
      },
      '+',
    ),
  );
  const variant = product.variants.find(
    (entry) => entry.colorId === color?.id && entry.size === size,
  );
  const soldOut = !variant || variant.stock < 1;
  const add = h(
    'button',
    {
      className: 'button button-primary',
      type: 'button',
      disabled: soldOut,
      onclick: () => {
        const notice = panel.querySelector('[data-notice]');
        notice.textContent = cartStore.add({
          productId: product.id,
          slug: product.slug,
          colorId: color.id,
          sizeId: size,
          qty,
        })
          ? 'Added to cart.'
          : 'Cart limit reached. Review your cart before adding more.';
        notice.classList.toggle(
          'error',
          notice.textContent.startsWith('Cart limit'),
        );
      },
    },
    'Add to cart',
  );
  panel.replaceChildren(
    h('p', { className: 'eyebrow' }, product.slug),
    h('h1', {}, product.name),
    h('p', { className: 'tile-price', 'data-price': '' }),
    h('p', {}, product.description),
    h(
      'section',
      { className: 'field-group' },
      h('p', { className: 'field-label' }, `Color — ${color?.name || ''}`),
      colorRow,
    ),
    h(
      'section',
      { className: 'field-group' },
      h('p', { className: 'field-label' }, 'Size'),
      sizeRow,
    ),
    h(
      'section',
      { className: 'field-group' },
      h('p', { className: 'field-label' }, 'Quantity'),
      quantity,
    ),
    h(
      'p',
      { className: 'notice' },
      soldOut
        ? 'Sold out'
        : variant.stock <= 3
          ? 'Low stock'
          : `${variant.stock} in stock`,
    ),
    add,
    h('p', { className: 'notice', 'data-notice': '', 'aria-live': 'polite' }),
    h(
      'details',
      { className: 'field-group' },
      h('summary', {}, 'Size guide'),
      h('p', {}, 'Choose your usual fit. For a relaxed fit, size up.'),
    ),
  );
  displayPrice();
}

if (slug) {
  try {
    const result = await request(`/api/products/${encodeURIComponent(slug)}`);
    product = result.product;
    color = product.colors?.[0];
    size = product.variants?.find(
      (variant) => variant.colorId === color?.id,
    )?.size;
    const images = product.images || [];
    if (images[0] && mainImage) {
      mainImage.src = images[0].url;
      mainImage.alt = images[0].alt || product.name;
      if (thumbs)
        thumbs.replaceChildren(
          ...images.map((image) =>
            h(
              'button',
              {
                type: 'button',
                'aria-label': `Show ${image.alt}`,
                onclick: () => {
                  mainImage.src = image.url;
                  mainImage.alt = image.alt;
                },
              },
              h('img', {
                src: image.url,
                alt: '',
                width: 72,
                height: 72,
                loading: 'lazy',
              }),
            ),
          ),
        );
    }
    paint();
    document.title = `${product.name} — Idek Shirts`;
  } catch (requestError) {
    if (error) error.textContent = requestError.message;
  }
} else if (error) error.textContent = 'A product slug is required.';
