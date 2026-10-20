import { h } from './dom.js';
import { request } from './api.js';
import { cartStore } from './store.js';

const countTargets = [...document.querySelectorAll('[data-cart-count]')];
const live = document.querySelector('[data-cart-live]');
const cartRoots = [...document.querySelectorAll('[data-cart-lines]')];
const subtotalTargets = [...document.querySelectorAll('[data-cart-subtotal]')];
const messages = [...document.querySelectorAll('[data-cart-message]')];
const drawer = document.querySelector('[data-cart-drawer]');
let validationTimer;
let previousSubtotal;

function updateCount(lines) {
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  countTargets.forEach((target) => {
    target.textContent = String(count);
  });
  if (live) live.textContent = `${count} item${count === 1 ? '' : 's'} in cart`;
  document.querySelectorAll('[data-checkout]').forEach((button) => {
    button.disabled = count === 0;
  });
}

async function validate() {
  const lines = cartStore.get();
  if (!lines.length || !cartRoots.length) {
    cartRoots.forEach((root) =>
      root.replaceChildren(h('p', {}, 'Your cart is empty.')),
    );
    subtotalTargets.forEach((target) => {
      target.textContent = '—';
    });
    return;
  }
  try {
    const result = await request('/api/cart/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lines: lines.map(({ productId, colorId, sizeId, qty }) => ({
          productId,
          colorId,
          sizeId,
          qty,
        })),
      }),
    });
    render(result.lines);
    messages.forEach((message) => {
      message.textContent =
        previousSubtotal !== undefined && previousSubtotal !== result.subtotal
          ? 'Price updated from current catalog.'
          : '';
      message.classList.remove('error');
    });
    previousSubtotal = result.subtotal;
    subtotalTargets.forEach((target) => {
      target.textContent = format(result.subtotal, result.currency);
    });
  } catch (error) {
    messages.forEach((message) => {
      message.textContent = error.message;
      message.classList.add('error');
    });
    if (error.details?.lines) renderInvalid(error.details.lines, lines);
  }
}

function format(cents, currency) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function renderInvalid(invalid, localLines) {
  cartRoots.forEach((root) =>
    root.replaceChildren(
      ...invalid.map((item) => {
        const line = localLines[item.index];
        if (item.valid && line) {
          return h(
            'article',
            { className: 'cart-line' },
            item.image
              ? h('img', {
                  src: item.image,
                  alt: item.name,
                  width: 112,
                  height: 112,
                  loading: 'lazy',
                })
              : h('div', { className: 'product-image' }),
            h(
              'div',
              {},
              h('h2', {}, item.name),
              h('p', { className: 'mono' }, `${item.color} / ${item.sizeId}`),
              h(
                'p',
                { className: 'mono' },
                format(Number(item.priceCents) * item.qty, item.currency),
              ),
            ),
            h(
              'button',
              {
                className: 'button-ghost',
                type: 'button',
                onclick: () => cartStore.remove(line.lineId),
              },
              'Remove',
            ),
          );
        }
        return h(
          'article',
          { className: 'cart-line' },
          h('div', { className: 'product-image' }),
          h(
            'div',
            {},
            h(
              'h2',
              {},
              item.reason === 'sold_out' ? 'Sold out' : 'Unavailable item',
            ),
            h('p', {}, line?.slug || 'Item removed from catalog'),
          ),
          h(
            'button',
            {
              className: 'button',
              type: 'button',
              onclick: () => line && cartStore.remove(line.lineId),
            },
            'Remove',
          ),
        );
      }),
    ),
  );
}

function render(lines) {
  cartRoots.forEach((root) =>
    root.replaceChildren(
      ...lines.map((line) => {
        const image = line.image
          ? h('img', {
              src: line.image,
              alt: line.name,
              width: 112,
              height: 112,
              loading: 'lazy',
            })
          : h('div', { className: 'product-image' });
        const localLine = cartStore
          .get()
          .find(
            (item) =>
              item.productId === line.productId &&
              item.colorId === line.colorId &&
              item.sizeId === line.sizeId,
          );
        const lineId = localLine?.lineId;
        const qty = h(
          'div',
          { className: 'quantity', 'aria-label': 'Quantity' },
          h(
            'button',
            {
              type: 'button',
              'aria-label': 'Decrease quantity',
              onclick: () =>
                lineId &&
                cartStore.update(lineId, { qty: Math.max(1, line.qty - 1) }),
            },
            '−',
          ),
          h('output', {}, line.qty),
          h(
            'button',
            {
              type: 'button',
              'aria-label': 'Increase quantity',
              onclick: () =>
                lineId &&
                cartStore.update(lineId, {
                  qty: Math.min(Number(line.stock), line.qty + 1),
                }),
            },
            '+',
          ),
        );
        const colors = [
          ...new Map(
            (line.options || []).map((option) => [option.colorId, option]),
          ).values(),
        ];
        const sizes = [
          ...new Set(
            (line.options || [])
              .filter((option) => option.colorId === line.colorId)
              .map((option) => option.sizeId),
          ),
        ];
        const colorSelect = h(
          'label',
          {},
          'Color ',
          h(
            'select',
            {
              'aria-label': 'Change color',
              onchange: (event) =>
                changeVariant(
                  lineId,
                  event.target.value,
                  line.sizeId,
                  line.qty,
                  line.options,
                ),
            },
            ...colors.map((option) =>
              h(
                'option',
                {
                  value: option.colorId,
                  selected: option.colorId === line.colorId,
                },
                option.color,
              ),
            ),
          ),
        );
        const sizeSelect = h(
          'label',
          {},
          'Size ',
          h(
            'select',
            {
              'aria-label': 'Change size',
              onchange: (event) =>
                changeVariant(
                  lineId,
                  line.colorId,
                  event.target.value,
                  line.qty,
                  line.options,
                ),
            },
            ...sizes.map((option) =>
              h(
                'option',
                { value: option, selected: option === line.sizeId },
                option,
              ),
            ),
          ),
        );
        return h(
          'article',
          { className: 'cart-line' },
          image,
          h(
            'div',
            {},
            h('h2', {}, line.name),
            h('p', { className: 'mono' }, `${line.color} / ${line.sizeId}`),
            h(
              'p',
              { className: 'mono' },
              format(Number(line.priceCents) * line.qty, line.currency),
            ),
            colorSelect,
            sizeSelect,
            qty,
          ),
          h(
            'button',
            {
              className: 'button-ghost',
              type: 'button',
              onclick: () => lineId && cartStore.remove(lineId),
            },
            'Remove',
          ),
        );
      }),
    ),
  );
}

function changeVariant(lineId, colorId, sizeId, qty, options) {
  const selected = options.find(
    (option) => option.colorId === colorId && option.sizeId === sizeId,
  );
  const current = cartStore.get().find((line) => line.lineId === lineId);
  if (!current) return;
  const duplicate = cartStore
    .get()
    .find(
      (line) =>
        line.lineId !== lineId &&
        line.productId === current.productId &&
        line.colorId === colorId &&
        line.sizeId === sizeId,
    );
  const requested = qty + (duplicate?.qty ?? 0);
  if (!selected || selected.stock < requested) {
    messages.forEach((message) => {
      message.textContent = selected
        ? `Only ${selected.stock} left in this variant.`
        : 'That color and size combination is unavailable.';
      message.classList.add('error');
    });
    void validate();
    return;
  }
  if (duplicate) {
    cartStore.update(duplicate.lineId, {
      qty: Math.min(10, duplicate.qty + qty),
    });
    cartStore.remove(lineId);
  } else {
    cartStore.update(lineId, { colorId, sizeId });
  }
}
cartStore.subscribe((lines) => {
  updateCount(lines);
  clearTimeout(validationTimer);
  validationTimer = setTimeout(() => void validate(), 250);
});
updateCount(cartStore.get());
void validate();

document.querySelectorAll('[data-checkout]').forEach((button) => {
  button.addEventListener('click', async () => {
    button.disabled = true;
    messages.forEach((message) => {
      message.textContent = 'Checking your cart…';
    });
    try {
      const result = await request('/api/checkout/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          lines: cartStore.get().map(({ productId, colorId, sizeId, qty }) => ({
            productId,
            colorId,
            sizeId,
            qty,
          })),
        }),
      });
      location.assign(result.url);
    } catch (error) {
      messages.forEach((message) => {
        message.textContent = error.message;
        message.classList.add('error');
      });
      button.disabled = false;
      void validate();
    }
  });
});

document
  .querySelectorAll('[data-cart-open]')
  .forEach((button) =>
    button.addEventListener('click', () => drawer?.showModal()),
  );
document
  .querySelectorAll('[data-cart-close]')
  .forEach((button) => button.addEventListener('click', () => drawer?.close()));
drawer?.addEventListener('click', (event) => {
  if (event.target === drawer) drawer.close();
});
