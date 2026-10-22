const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const getCart = () => {
  try {
    const cart = JSON.parse(localStorage.getItem('atelier-cart') || '[]');
    return Array.isArray(cart) ? cart.filter((item) => typeof item.id === 'string' && typeof item.size === 'string' && Number.isInteger(item.quantity) && item.quantity > 0) : [];
  } catch {
    return [];
  }
};
const saveCart = (cart) => {
  localStorage.setItem('atelier-cart', JSON.stringify(cart));
  updateCartCount();
};
const updateCartCount = () => {
  const count = getCart().reduce((total, item) => total + item.quantity, 0);
  document.querySelectorAll('[data-cart-count]').forEach((element) => { element.textContent = String(count); });
};
const showToast = (message) => {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
};
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
async function loadCatalog() {
  const [products, settings] = await Promise.all([api('/api/products'), api('/api/settings')]);
  window.shopProducts = products;
  window.shopSettings = settings;
  updateCartCount();
  document.querySelectorAll('[data-featured-title]').forEach((element) => { element.textContent = settings.featuredTitle; });
  document.querySelectorAll('[data-featured-section]').forEach((element) => {
    element.style.backgroundColor = settings.featuredColor;
    element.hidden = !products.some((product) => product.featured);
  });
  document.querySelectorAll('[data-featured-grid]').forEach((element) => {
    element.innerHTML = products.filter((product) => product.featured).slice(0, 4).map(productCard).join('');
  });
  document.querySelectorAll('[data-product-grid]').forEach((element) => renderGallery(element, products));
  document.querySelectorAll('[data-product-grid], [data-featured-grid]').forEach((element) => element.addEventListener('click', handleAddClick));
  const itemRoot = document.querySelector('[data-item-root]');
  if (itemRoot) renderItemDetail(itemRoot, products);
  const filters = document.querySelector('[data-filters]');
  if (filters) {
    const category = filters.querySelector('[name="category"]');
    [...new Set(products.map((product) => product.category))].sort().forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      category.append(option);
    });
    filters.addEventListener('input', () => renderGallery(document.querySelector('[data-product-grid]'), products));
    filters.addEventListener('change', () => renderGallery(document.querySelector('[data-product-grid]'), products));
  }
}
function productCard(product) {
  const sizes = product.sizes.map((size) => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`).join('');
  return `<article class="product-card">
    <a class="product-image" href="item.html?id=${encodeURIComponent(product.id)}" aria-label="View ${escapeHtml(product.name)} details">
      <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
      ${product.featured ? '<span class="product-tag">Featured</span>' : ''}
    </a>
    <div class="product-info">
      <div class="product-meta"><h3><a href="item.html?id=${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a></h3><span class="product-price">${money(product.price)}</span></div>
      <p class="product-description">${escapeHtml(product.description)}</p>
      <label class="sr-only" for="size-${escapeHtml(product.id)}">Choose a size for ${escapeHtml(product.name)}</label>
      <select class="size-select" id="size-${escapeHtml(product.id)}" data-size-select aria-label="Choose size for ${escapeHtml(product.name)}">
        <option value="">Choose size</option>${sizes}
      </select>
      <button class="small-button" type="button" data-add="${escapeHtml(product.id)}">Add to bag</button>
    </div>
  </article>`;
}
function renderItemDetail(root, products) {
  const product = products.find((item) => item.id === new URLSearchParams(window.location.search).get('id'));
  if (!product) {
    root.innerHTML = '<div class="empty-state">That item could not be found. <a class="text-link" href="gallery.html">Browse the collection</a></div>';
    return;
  }
  root.innerHTML = `<div class="item-detail">
    <div class="item-detail-image"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"></div>
    <section class="item-detail-copy">
      <span class="eyebrow">${escapeHtml(product.category)}</span>
      <h1 class="page-title">${escapeHtml(product.name)}</h1>
      <p class="item-detail-price">${money(product.price)}</p>
      <p class="item-detail-description">${escapeHtml(product.description)}</p>
      <p class="item-number">Item number: <span>${escapeHtml(product.id)}</span></p>
      <div class="field"><label for="item-size">Size</label><select id="item-size" data-item-size required><option value="">Choose a size</option>${product.sizes.map((size) => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`).join('')}</select></div>
      <button class="button" type="button" data-add="${escapeHtml(product.id)}">Add to bag</button>
      <p class="item-size-note">Available sizes: ${product.sizes.map(escapeHtml).join(', ')}</p>
    </section>
  </div>`;
  root.addEventListener('click', handleAddClick);
}
function renderGallery(grid, products) {
  if (!grid) return;
  const filters = document.querySelector('[data-filters]');
  const searchInput = filters ? filters.querySelector('[name="search"]') : null;
  const categoryInput = filters ? filters.querySelector('[name="category"]') : null;
  const sortInput = filters ? filters.querySelector('[name="sort"]') : null;
  const search = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const category = categoryInput ? categoryInput.value : '';
  const sort = sortInput ? sortInput.value : 'featured';
  let filtered = products.filter((product) => (!category || product.category === category) && (!search || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(search)));
  if (sort === 'price-asc') filtered.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') filtered.sort((a, b) => b.price - a.price);
  else if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
  else filtered.sort((a, b) => Number(b.featured) - Number(a.featured));
  grid.innerHTML = filtered.length ? filtered.map(productCard).join('') : '<div class="empty-state">No pieces found. Try a different filter.</div>';
  const count = document.querySelector('[data-result-count]');
  if (count) count.textContent = `${filtered.length} ${filtered.length === 1 ? 'piece' : 'pieces'}`;
}
function handleAddClick(event) {
  const button = event.target.closest('[data-add]');
  if (!button) return;
  const product = window.shopProducts.find((item) => item.id === button.dataset.add);
  if (!product) return;
  const sizeSelect = button.closest('.product-card')?.querySelector('[data-size-select]') || document.querySelector('[data-item-size]');
  const size = sizeSelect ? sizeSelect.value : '';
  if (!size || !product.sizes.includes(size)) {
    showToast('Choose an available size first');
    if (sizeSelect) sizeSelect.focus();
    return;
  }
  const cart = getCart();
  const existing = cart.find((item) => item.id === product.id && item.size === size);
  if (existing) existing.quantity = Math.min(existing.quantity + 1, 10);
  else cart.push({ id: product.id, size, quantity: 1 });
  saveCart(cart);
  showToast(`${product.name} (${size}) added to your bag`);
}
function initCart() {
  const list = document.querySelector('[data-cart-list]');
  if (!list) return;
  const notice = document.querySelector('[data-cart-notice]');
  if (new URLSearchParams(window.location.search).has('cancelled') && notice) {
    notice.textContent = 'Your checkout was cancelled. Your bag is still here when you are ready.';
    notice.hidden = false;
  }
  const checkoutLink = document.querySelector('[data-cart-checkout]');
  const render = () => {
    const cart = getCart();
    const products = window.shopProducts;
    const items = cart.map((item) => ({ ...item, product: products.find((product) => product.id === item.id) })).filter((item) => item.product && item.product.sizes.includes(item.size));
    list.innerHTML = items.length ? items.map(({ product, size, quantity }) => `<div class="cart-row">
      <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
      <div><p class="cart-item-name">${escapeHtml(product.name)}</p><span class="cart-item-detail">Size ${escapeHtml(size)} · ${escapeHtml(product.category)} · ${money(product.price)}</span>
        <div class="cart-actions"><span class="quantity"><button type="button" aria-label="Decrease quantity" data-quantity="${escapeHtml(product.id)}" data-size="${escapeHtml(size)}" data-step="-1">−</button><span>${quantity}</span><button type="button" aria-label="Increase quantity" data-quantity="${escapeHtml(product.id)}" data-size="${escapeHtml(size)}" data-step="1">+</button></span><button type="button" class="remove-button" data-remove="${escapeHtml(product.id)}" data-size="${escapeHtml(size)}">Remove</button></div>
      </div><span class="cart-item-price">${money(product.price * quantity)}</span>
    </div>`).join('') : '<div class="empty-state">Your bag is taking a little breathing room. <a class="text-link" href="gallery.html">Explore the collection</a></div>';
    const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    document.querySelectorAll('[data-subtotal]').forEach((element) => { element.textContent = money(subtotal); });
    if (checkoutLink) checkoutLink.disabled = items.length === 0;
    saveCart(items.map(({ id, size, quantity }) => ({ id, size, quantity })));
  };
  if (checkoutLink) {
    checkoutLink.addEventListener('click', () => {
      if (getCart().length) window.location.assign('checkout.html');
    });
  }
  list.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    const quantity = event.target.closest('[data-quantity]');
    if (!remove && !quantity) return;
    let cart = getCart();
    if (remove) cart = cart.filter((item) => item.id !== remove.dataset.remove || item.size !== remove.dataset.size);
    if (quantity) {
      const item = cart.find((entry) => entry.id === quantity.dataset.quantity && entry.size === quantity.dataset.size);
      if (item) {
        item.quantity += Number(quantity.dataset.step);
        if (item.quantity <= 0) cart = cart.filter((entry) => entry !== item);
        else item.quantity = Math.min(item.quantity, 10);
      }
    }
    saveCart(cart);
    render();
  });
  render();
}
async function initCheckout() {
  const button = document.querySelector('[data-checkout]');
  if (!button) return;
  const cart = getCart();
  const products = window.shopProducts;
  const items = cart.map((item) => ({ ...item, product: products.find((product) => product.id === item.id) })).filter((item) => item.product && item.product.sizes.includes(item.size));
  document.querySelector('[data-checkout-items]').innerHTML = items.length ? items.map(({ product, size, quantity }) => `<div class="summary-line"><span>${escapeHtml(product.name)} · ${escapeHtml(size)} × ${quantity}</span><span>${money(product.price * quantity)}</span></div>`).join('') : '<div class="summary-line"><span>Your bag is empty.</span></div>';
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  document.querySelectorAll('[data-subtotal]').forEach((element) => { element.textContent = money(total); });
  button.disabled = !items.length;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Connecting to Stripe…';
    try {
      const result = await api('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items.map(({ id, size, quantity }) => ({ id, size, quantity })) }) });
      window.location.assign(result.url);
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
      button.textContent = 'Continue to secure payment';
    }
  });
  const params = new URLSearchParams(window.location.search);
  if (params.has('success')) {
    try {
      const result = await api(`/api/checkout/verify?session_id=${encodeURIComponent(params.get('session_id') || '')}`);
      if (result.paid) {
        localStorage.removeItem('atelier-cart');
        updateCartCount();
        button.disabled = true;
        button.textContent = 'Payment complete';
        document.querySelector('[data-checkout-notice]').textContent = 'Thank you — your payment was completed securely with Stripe.';
      } else {
        document.querySelector('[data-checkout-notice]').textContent = 'Payment has not been confirmed yet. Please refresh in a moment or contact us for help.';
      }
      document.querySelector('[data-checkout-notice]').hidden = false;
    } catch (error) {
      document.querySelector('[data-checkout-notice]').textContent = error.message;
      document.querySelector('[data-checkout-notice]').hidden = false;
    }
  } else if (params.has('cancelled')) {
    document.querySelector('[data-checkout-notice]').textContent = 'Your checkout was cancelled. Your bag is still here when you are ready.';
    document.querySelector('[data-checkout-notice]').hidden = false;
  }
}
function initAdmin() {
  const panel = document.querySelector('[data-admin-panel]');
  if (!panel) return;
  const login = panel.querySelector('[data-admin-login]');
  const dashboard = panel.querySelector('[data-admin-dashboard]');
  const productForm = panel.querySelector('[data-admin-product-form]');
  let csrfToken = null;
  let editingId = null;
  let sessionReady = Promise.resolve();
  const refreshProducts = async () => {
    window.shopProducts = await api('/api/products');
    document.querySelectorAll('[data-featured-grid]').forEach((element) => {
      element.innerHTML = window.shopProducts.filter((product) => product.featured).slice(0, 4).map(productCard).join('');
    });
    document.querySelectorAll('[data-featured-section]').forEach((element) => {
      element.hidden = !window.shopProducts.some((product) => product.featured);
    });
    const list = panel.querySelector('[data-admin-products]');
    list.innerHTML = window.shopProducts.map((product) => `<div class="admin-product"><img src="${escapeHtml(product.image)}" alt=""><div class="admin-product-info">${escapeHtml(product.name)}<span>${money(product.price)} · ${escapeHtml(product.sizes.join(', '))} · ${product.featured ? 'Featured' : 'Standard'}</span></div><div class="admin-actions"><button type="button" data-edit="${escapeHtml(product.id)}">Edit</button><button type="button" data-delete="${escapeHtml(product.id)}">Remove</button></div></div>`).join('');
  };
  const setAuthenticated = async (authenticated, token) => {
    csrfToken = token;
    login.hidden = authenticated;
    dashboard.hidden = !authenticated;
    panel.querySelector('[data-admin-logout]').hidden = !authenticated;
    if (authenticated) {
      const settings = await api('/api/settings');
      panel.querySelector('[name="featuredTitle"]').value = settings.featuredTitle;
      panel.querySelector('[name="featuredColor"]').value = settings.featuredColor;
      await refreshProducts();
    }
  };
  panel.querySelector('[data-admin-login-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await sessionReady;
    try {
      const result = await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: form.get('password') }) });
      formElement.reset();
      await setAuthenticated(true, result.csrfToken);
    } catch (error) { showToast(error.message); }
  });
  panel.querySelector('[data-admin-logout]').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
      await setAuthenticated(false, null);
    } catch (error) { showToast(error.message); }
  });
  productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(productForm);
    formData.set('featured', String(formData.get('featured') === 'on'));
    const url = editingId ? `/api/admin/products/${encodeURIComponent(editingId)}` : '/api/admin/products';
    const method = editingId ? 'PUT' : 'POST';
    try {
      await api(url, { method, headers: { 'X-CSRF-Token': csrfToken }, body: formData });
      productForm.reset();
      editingId = null;
      panel.querySelector('[data-product-submit]').textContent = 'Add product';
      await refreshProducts();
      showToast('Product saved');
    } catch (error) { showToast(error.message); }
  });
  panel.querySelector('[data-admin-products]').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');
    if (edit) {
      const product = window.shopProducts.find((item) => item.id === edit.dataset.edit);
      if (!product) return;
      editingId = product.id;
      for (const key of ['name', 'description', 'category']) productForm.elements[key].value = product[key];
      productForm.elements.sizes.value = product.sizes.join(', ');
      productForm.elements.price.value = (product.price / 100).toFixed(2);
      productForm.elements.featured.checked = product.featured;
      panel.querySelector('[data-product-submit]').textContent = 'Save changes';
      productForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (remove && window.confirm('Remove this product from your shop?')) {
      try {
        await api(`/api/admin/products/${encodeURIComponent(remove.dataset.delete)}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken } });
        await refreshProducts();
        showToast('Product removed');
      } catch (error) { showToast(error.message); }
    }
  });
  panel.querySelector('[data-settings-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const settings = await api('/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ featuredTitle: form.get('featuredTitle'), featuredColor: form.get('featuredColor') }) });
      window.shopSettings = settings;
      document.querySelectorAll('[data-featured-title]').forEach((element) => { element.textContent = settings.featuredTitle; });
      document.querySelectorAll('[data-featured-section]').forEach((element) => { element.style.backgroundColor = settings.featuredColor; });
      showToast('Featured section updated');
    } catch (error) { showToast(error.message); }
  });
  const toggle = () => {
    const open = window.location.hash === '#admin';
    panel.classList.toggle('open', open);
    if (open) panel.scrollIntoView({ behavior: 'smooth' });
  };
  window.addEventListener('hashchange', toggle);
  toggle();
  sessionReady = api('/api/admin/session')
    .then((result) => setAuthenticated(result.authenticated, result.csrfToken))
    .catch((error) => showToast(error.message));
}
document.addEventListener('DOMContentLoaded', async () => {
  updateCartCount();
  try {
    await loadCatalog();
    initCart();
    initCheckout();
    initAdmin();
  } catch (error) {
    document.querySelectorAll('[data-product-grid], [data-featured-grid]').forEach((element) => { element.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; });
  }
});
