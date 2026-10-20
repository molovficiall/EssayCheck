import { h } from './dom.js';
import { request } from './api.js';
import { cartStore } from './store.js';

const target = document.querySelector('[data-products]');
const error = document.querySelector('[data-product-error]');
const money = (cents, currency) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(Number(cents) / 100);

try {
  const { products } = await request('/api/products');
  if (target)
    target.replaceChildren(
      ...products.map((product, index) => {
        const image = product.images?.[0];
        const alternate = product.images?.[1];
        const tile = h(
          'a',
          {
            className: 'product-tile',
            href: `/product.html?slug=${encodeURIComponent(product.slug)}`,
          },
          h(
            'div',
            { className: 'product-image' },
            h(
              'span',
              { className: 'tile-index' },
              String(index + 1).padStart(2, '0'),
            ),
            ...(image
              ? [
                  h('img', {
                    src: image.url,
                    alt: image.alt || product.name,
                    width: 640,
                    height: 640,
                    loading: 'lazy',
                  }),
                ]
              : []),
            ...(alternate
              ? [
                  h('img', {
                    className: 'product-image-secondary',
                    src: alternate.url,
                    alt: alternate.alt || product.name,
                    width: 640,
                    height: 640,
                    loading: 'lazy',
                  }),
                ]
              : []),
          ),
          h(
            'div',
            { className: 'tile-info' },
            h('h3', {}, product.name),
            h(
              'span',
              { className: 'tile-price' },
              money(product.priceCents, product.currency),
            ),
          ),
          h(
            'div',
            {
              className: 'swatches tile-swatches',
              'aria-label': 'Available colors',
            },
            ...(product.colors || []).map((color) =>
              h('span', {
                className: 'swatch',
                title: color.name,
                'aria-label': color.name,
                style: `background-color:${color.hex}`,
              }),
            ),
          ),
        );
        return tile;
      }),
    );
} catch (requestError) {
  if (error) error.textContent = requestError.message;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-product]');
  if (!button) return;
  const line = {
    productId: button.dataset.productId,
    slug: button.dataset.slug,
    colorId: button.dataset.colorId,
    sizeId: button.dataset.sizeId,
    qty: Number(button.dataset.qty || 1),
  };
  cartStore.add(line);
});
