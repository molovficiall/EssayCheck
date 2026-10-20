import { h } from './dom.js';
import { request } from './api.js';

const rows = document.querySelector('[data-product-rows]');
const notice = document.querySelector('[data-admin-notice]');
const list = document.querySelector('[data-product-list]');
const editor = document.querySelector('[data-editor]');
const form = document.querySelector('[data-product-form]');
const colorRows = document.querySelector('[data-colors]');
const sizeBox = document.querySelector('[data-sizes]');
const stockMatrix = document.querySelector('[data-stock-matrix]');
const imageList = document.querySelector('[data-image-list]');
const archiveDialog = document.querySelector('[data-archive-dialog]');
let csrf = '';
let editingId = '';
let initialState = '';
let pendingImages = [];
let existingVariants = [];
const sizeOptions = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

async function api(url, options = {}) {
  try {
    return await request(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(options.method && options.method !== 'GET'
          ? { 'X-CSRF-Token': csrf }
          : {}),
      },
    });
  } catch (error) {
    if (error.status === 401 || error.status === 404) {
      notice.textContent = 'Session expired — reload this page.';
      throw error;
    }
    throw error;
  }
}

function toast(text, isError = false) {
  notice.textContent = text;
  notice.classList.toggle('error', isError);
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function addColor(
  color = { id: crypto.randomUUID(), name: '', hex: '#26394a' },
) {
  const row = h(
    'div',
    { className: 'admin-form-grid admin-card', 'data-color-row': '' },
    h(
      'label',
      {},
      'Color name',
      h('input', {
        name: 'color-name',
        required: true,
        maxlength: 40,
        value: color.name,
      }),
    ),
    h(
      'label',
      {},
      'Hex',
      h('input', { name: 'color-hex', type: 'color', value: color.hex }),
    ),
    h('input', { type: 'hidden', name: 'color-id', value: color.id }),
    h(
      'button',
      {
        className: 'button',
        type: 'button',
        onclick: () => {
          row.remove();
          paintStock();
        },
      },
      'Remove',
    ),
  );
  colorRows.append(row);
  row
    .querySelectorAll('input')
    .forEach((input) => input.addEventListener('input', paintStock));
  paintStock();
}

function selectedSizes() {
  const standard = [
    ...sizeBox.querySelectorAll('input[type="checkbox"]:checked'),
  ].map((input) => input.value);
  const custom = sizeBox
    .querySelector('[data-custom-size]')
    .value.split(',')
    .map((size) => size.trim().toUpperCase())
    .filter(Boolean);
  if (custom.some((size) => !/^[A-Z0-9-]{1,20}$/.test(size)))
    throw new Error(
      'Custom sizes may contain letters, numbers, and hyphens only.',
    );
  return [...new Set([...standard, ...custom])];
}

function readColors() {
  return [...colorRows.querySelectorAll('[data-color-row]')].map(
    (row, sort) => ({
      id: row.querySelector('[name="color-id"]').value,
      name: row.querySelector('[name="color-name"]').value.trim(),
      hex: row.querySelector('[name="color-hex"]').value,
      sort,
    }),
  );
}

function paintStock(previous) {
  const prior =
    previous ||
    Object.fromEntries(
      [...stockMatrix.querySelectorAll('[data-stock-key]')].map((input) => [
        input.dataset.stockKey,
        {
          stock: input.value,
          price: input.parentElement.parentElement.querySelector(
            '[data-price-override]',
          ).value,
        },
      ]),
    );
  const colors = readColors();
  const sizes = selectedSizes();
  stockMatrix.replaceChildren(
    ...colors.flatMap((color) =>
      sizes.map((size) => {
        const key = `${color.id}:${size}`;
        const priorValue = prior[key];
        return h(
          'div',
          { className: 'admin-stock-field' },
          h('span', {}, `${color.name || 'Color'} / ${size}`),
          h(
            'label',
            {},
            'Stock',
            h('input', {
              type: 'number',
              min: 0,
              max: 10000,
              value:
                typeof priorValue === 'object'
                  ? priorValue.stock
                  : (priorValue ?? '0'),
              'data-stock-key': key,
            }),
          ),
          h(
            'label',
            {},
            'Price override (optional)',
            h('input', {
              inputmode: 'decimal',
              value: typeof priorValue === 'object' ? priorValue.price : '',
              'data-price-override': '',
            }),
          ),
        );
      }),
    ),
  );
}

function imageRow(image, index) {
  const colorOptions = readColors();
  return h(
    'div',
    { className: 'admin-image-row' },
    h('img', {
      src: image.preview || `/api/media/${image.key}`,
      alt: image.alt || '',
      width: 80,
      height: 80,
    }),
    h(
      'div',
      {},
      h(
        'label',
        {},
        'Alt text',
        h('input', {
          value: image.alt || '',
          required: true,
          maxlength: 200,
          'data-image-alt': String(index),
          oninput: (event) => {
            image.alt = event.target.value;
          },
        }),
      ),
      h(
        'label',
        {},
        'Associated color',
        h(
          'select',
          {
            'data-image-color': String(index),
            onchange: (event) => {
              image.colorId = event.target.value || null;
            },
          },
          h('option', { value: '' }, 'All colors'),
          ...colorOptions.map((color) =>
            h(
              'option',
              { value: color.id, selected: image.colorId === color.id },
              color.name,
            ),
          ),
        ),
      ),
    ),
    h(
      'div',
      { className: 'admin-actions' },
      h(
        'button',
        {
          className: 'button',
          type: 'button',
          'aria-label': `Move image ${index + 1} up`,
          disabled: index === 0,
          onclick: () => moveImage(index, -1),
        },
        'Up',
      ),
      h(
        'button',
        {
          className: 'button',
          type: 'button',
          'aria-label': `Move image ${index + 1} down`,
          disabled: index === pendingImages.length - 1,
          onclick: () => moveImage(index, 1),
        },
        'Down',
      ),
      h(
        'button',
        {
          className: 'button',
          type: 'button',
          onclick: () => {
            const removed = pendingImages.splice(index, 1)[0];
            if (removed.preview) URL.revokeObjectURL(removed.preview);
            paintImages();
          },
        },
        'Remove',
      ),
    ),
  );
}

function moveImage(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= pendingImages.length) return;
  [pendingImages[index], pendingImages[target]] = [
    pendingImages[target],
    pendingImages[index],
  ];
  paintImages();
}

function paintImages() {
  imageList.replaceChildren(...pendingImages.map(imageRow));
}

async function uploadPendingImages() {
  for (let index = 0; index < pendingImages.length; index++) {
    const image = pendingImages[index];
    image.alt = imageList
      .querySelector(`[data-image-alt="${index}"]`)
      .value.trim();
    image.colorId =
      imageList.querySelector(`[data-image-color="${index}"]`).value || null;
    if (!image.alt) throw new Error('Every image needs alt text.');
    if (image.file && !image.key) {
      document.querySelector('[data-upload-progress]').textContent =
        `Uploading image ${index + 1} of ${pendingImages.length}…`;
      const body = new FormData();
      body.set('file', image.file);
      const result = await api('/api/internal/upload', {
        method: 'POST',
        body,
      });
      image.key = result.key;
      image.contentType = result.contentType;
    }
  }
  document.querySelector('[data-upload-progress]').textContent = '';
}

function snapshot() {
  return JSON.stringify({
    name: form.elements.name.value,
    slug: form.elements.slug.value,
    price: form.elements.price.value,
    description: form.elements.description.value,
    status: form.elements.status.value,
    colors: readColors(),
    sizes: selectedSizes(),
    stock: [...stockMatrix.querySelectorAll('[data-stock-key]')].map(
      (input) => [input.dataset.stockKey, input.value],
    ),
    images: pendingImages.map(({ key, alt, file }) => ({
      key,
      alt,
      file: Boolean(file),
    })),
  });
}

function openEditor(product = null) {
  form.reset();
  delete form.elements.slug.dataset.touched;
  colorRows.replaceChildren();
  imageList.replaceChildren();
  stockMatrix.replaceChildren();
  pendingImages = [];
  editingId = product?.id || '';
  form.elements.name.value = product?.name || '';
  form.elements.slug.value = product?.slug || '';
  form.elements.price.value = product
    ? `${(product.base_price_cents / 100).toFixed(2)}`
    : '';
  form.elements.description.value = product?.description || '';
  form.elements.currency.value = product?.currency || 'usd';
  form.elements.status.value =
    product?.status === 'published' ? 'published' : 'draft';
  const productSizes = [
    ...new Set((product?.variants || []).map((variant) => variant.size)),
  ];
  const standardSizes = product
    ? productSizes.filter((size) => sizeOptions.includes(size))
    : ['S', 'M', 'L', 'XL'];
  sizeBox.replaceChildren(
    ...sizeOptions.map((size) =>
      h(
        'label',
        {},
        h('input', {
          type: 'checkbox',
          value: size,
          checked: standardSizes.includes(size),
          onchange: () => paintStock(),
        }),
        size,
      ),
    ),
    h(
      'label',
      {},
      'Custom sizes (comma-separated)',
      h('input', {
        maxlength: 80,
        value: productSizes
          .filter((size) => !sizeOptions.includes(size))
          .join(', '),
        'data-custom-size': '',
        oninput: () => paintStock(),
      }),
    ),
  );
  for (const color of product?.colors || []) addColor(color);
  if (!product) addColor();
  const stocks = {};
  existingVariants = product?.variants || [];
  for (const variant of existingVariants)
    stocks[`${variant.colorId}:${variant.size}`] = {
      stock: variant.stock,
      price: variant.priceOverrideCents
        ? (variant.priceOverrideCents / 100).toFixed(2)
        : '',
    };
  paintStock(stocks);
  pendingImages = (product?.images || []).map((image) => ({
    key: image.key,
    alt: image.alt,
    contentType: image.contentType,
    colorId: image.colorId,
    id: image.id,
  }));
  paintImages();
  document.querySelector('[data-editor] [data-archive]').hidden = !product;
  document.querySelector('[data-editor] [data-publish]').hidden =
    product?.status === 'published';
  document.querySelector('[data-editor] h2').textContent = product
    ? 'Edit product'
    : 'New product';
  list.hidden = true;
  editor.hidden = false;
  initialState = snapshot();
}

async function loadProducts() {
  const { products } = await api('/api/internal/products');
  const query = document.querySelector('#search-products').value.toLowerCase();
  const status = document.querySelector('#filter-status').value;
  const filtered = products.filter(
    (product) =>
      (!status || product.status === status) &&
      `${product.name} ${product.slug}`.toLowerCase().includes(query),
  );
  rows.replaceChildren(
    ...filtered.map((product) => {
      const updated = new Date(product.updatedAt * 1000).toLocaleDateString();
      return h(
        'tr',
        {},
        h(
          'td',
          {},
          product.image
            ? h('img', {
                className: 'admin-thumb',
                src: product.image,
                alt: '',
                width: 52,
                height: 52,
              })
            : '—',
        ),
        h(
          'td',
          {},
          h('strong', {}, product.name),
          h('br'),
          h('span', { className: 'mono' }, product.slug),
        ),
        h(
          'td',
          { className: 'mono' },
          `${product.currency.toUpperCase()} ${(product.basePriceCents / 100).toFixed(2)}`,
        ),
        h(
          'td',
          {},
          h(
            'span',
            { className: `status status-${product.status}` },
            product.status,
          ),
        ),
        h('td', { className: 'mono' }, product.stock),
        h('td', { className: 'mono' }, updated),
        h(
          'td',
          {},
          h(
            'div',
            { className: 'admin-actions' },
            h(
              'button',
              {
                type: 'button',
                onclick: async () => {
                  try {
                    const result = await api(
                      `/api/internal/products/${product.id}`,
                    );
                    openEditor(result.product);
                  } catch (error) {
                    toast(error.message, true);
                  }
                },
              },
              'Edit',
            ),
            h(
              'button',
              {
                type: 'button',
                onclick: async () => {
                  try {
                    await api(`/api/internal/products/${product.id}/publish`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        status:
                          product.status === 'published'
                            ? 'draft'
                            : 'published',
                      }),
                    });
                    await loadProducts();
                  } catch (error) {
                    toast(error.message, true);
                  }
                },
              },
              product.status === 'published' ? 'Unpublish' : 'Publish',
            ),
            h(
              'button',
              {
                type: 'button',
                onclick: () => {
                  editingId = product.id;
                  archiveDialog.showModal();
                },
              },
              'Archive',
            ),
          ),
        ),
      );
    }),
  );
}

async function start() {
  const session = await request('/api/internal/session');
  csrf = session.csrfToken;
  document.querySelector('[data-admin-email]').textContent = session.email;
  await loadProducts();
}

form.elements.name.addEventListener('input', () => {
  if (!form.elements.slug.dataset.touched)
    form.elements.slug.value = slugify(form.elements.name.value);
});
form.elements.slug.addEventListener('input', () => {
  form.elements.slug.dataset.touched = 'true';
});
document
  .querySelector('[data-add-color]')
  .addEventListener('click', () => addColor());
document
  .querySelector('[data-new-product]')
  .addEventListener('click', () => openEditor());
document.querySelector('[data-cancel-edit]').addEventListener('click', () => {
  if (snapshot() !== initialState && !confirm('Discard unsaved changes?'))
    return;
  pendingImages.forEach((image) => {
    if (image.preview) URL.revokeObjectURL(image.preview);
  });
  editor.hidden = true;
  list.hidden = false;
});
document.querySelector('#search-products').addEventListener('input', () => {
  void loadProducts().catch((error) => toast(error.message, true));
});
document.querySelector('#filter-status').addEventListener('change', () => {
  void loadProducts().catch((error) => toast(error.message, true));
});
function addImageFiles(files) {
  for (const file of files) {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024 ||
      pendingImages.length >= 8
    ) {
      toast(
        'Images must be JPEG, PNG, or WebP; maximum 5 MB each and 8 total.',
        true,
      );
      continue;
    }
    pendingImages.push({ file, preview: URL.createObjectURL(file), alt: '' });
  }
  paintImages();
}
form.elements.images.addEventListener('change', (event) =>
  addImageFiles(event.target.files),
);
const imagePicker = document.querySelector('[data-image-picker]');
imagePicker.addEventListener('dragover', (event) => {
  event.preventDefault();
});
imagePicker.addEventListener('drop', (event) => {
  event.preventDefault();
  addImageFiles(event.dataTransfer.files);
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = event.submitter?.matches('[data-publish]')
    ? 'published'
    : 'draft';
  const submitButtons = [...form.querySelectorAll('button[type="submit"]')];
  submitButtons.forEach((button) => {
    button.disabled = true;
  });
  try {
    const colors = readColors();
    if (!colors.length || !colors.every((color) => color.name))
      throw new Error('Add at least one named color.');
    const sizes = selectedSizes();
    if (!sizes.length) throw new Error('Choose at least one size.');
    const priceText = form.elements.price.value.trim();
    if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(priceText))
      throw new Error('Enter a valid price.');
    const cents = Math.round(Number(priceText) * 100);
    if (cents < 50) throw new Error('Price must be at least 0.50.');
    await uploadPendingImages();
    const variants = [...stockMatrix.querySelectorAll('[data-stock-key]')].map(
      (input) => {
        const [colorId, size] = input.dataset.stockKey.split(':');
        const old = existingVariants.find(
          (variant) => variant.colorId === colorId && variant.size === size,
        );
        const override = input.parentElement.parentElement
          .querySelector('[data-price-override]')
          .value.trim();
        if (override && !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(override))
          throw new Error('Enter a valid variant price override.');
        return {
          id: old?.id || crypto.randomUUID(),
          colorId,
          size,
          sku: old?.sku || null,
          priceOverrideCents: override
            ? Math.round(Number(override) * 100)
            : null,
          stock: Number(input.value),
        };
      },
    );
    const payload = {
      name: form.elements.name.value.trim(),
      slug: form.elements.slug.value.trim(),
      description: form.elements.description.value,
      basePriceCents: cents,
      currency: form.elements.currency.value,
      status,
      colors,
      variants,
      images: pendingImages.map((image, sort) => ({
        id: image.id || crypto.randomUUID(),
        key: image.key,
        alt: image.alt,
        colorId: image.colorId || null,
        sort,
        contentType: image.contentType,
      })),
    };
    await api(
      editingId
        ? `/api/internal/products/${editingId}`
        : '/api/internal/products',
      {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    toast('Product saved.');
    editor.hidden = true;
    list.hidden = false;
    pendingImages.forEach((image) => {
      if (image.preview) URL.revokeObjectURL(image.preview);
    });
    await loadProducts();
  } catch (error) {
    toast(error.message, true);
  } finally {
    submitButtons.forEach((button) => {
      button.disabled = false;
    });
  }
});
window.addEventListener('beforeunload', (event) => {
  if (!editor.hidden && snapshot() !== initialState) {
    event.preventDefault();
    event.returnValue = '';
  }
});
document
  .querySelector('[data-archive]')
  .addEventListener('click', () => archiveDialog.showModal());
document
  .querySelector('[data-dismiss-dialog]')
  .addEventListener('click', () => archiveDialog.close());
document
  .querySelector('[data-confirm-archive]')
  .addEventListener('click', async () => {
    try {
      await api(`/api/internal/products/${editingId}`, { method: 'DELETE' });
      archiveDialog.close();
      editor.hidden = true;
      list.hidden = false;
      await loadProducts();
      toast('Product archived.');
    } catch (error) {
      toast(error.message, true);
    }
  });

start().catch((error) =>
  toast(error.message || 'Session expired — reload this page.', true),
);
