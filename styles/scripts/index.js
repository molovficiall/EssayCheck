(() => {
	function animateArrow() {
		const arrow = document.getElementById('arrow-down');

		if (!arrow || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}

		arrow.animate(
			[
				{ transform: 'translateY(0)' },
				{ transform: 'translateY(8px)' },
				{ transform: 'translateY(0)' },
			],
			{
				duration: 1200,
				iterations: Infinity,
				easing: 'ease-in-out',
			},
		);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', animateArrow, { once: true });
	} else {
		animateArrow();
	}

	function openItem(item) {
		try {
			localStorage.setItem('selectedItem', JSON.stringify(item));
		} catch (error) {
			console.warn('Could not save the selected item; continuing with URL data.', error);
		}

		const targetUrl = new URL('pages/item.html', window.location.href);
		Object.entries(item).forEach(([key, value]) => {
			if (value !== undefined && value !== null && value !== '') {
				targetUrl.searchParams.set(key, String(value));
			}
		});
		window.location.href = targetUrl.toString();
	}

	function initializeCollection() {
		document.querySelectorAll('.item .button').forEach((button) => {
			button.addEventListener('click', () => {
				const card = button.closest('.item');
				if (!card) {
					return;
				}

				const image = card.querySelector('.item-image');
				const name = card.querySelector('.item-text');
				const description = card.querySelector('.body-text');
				const price = card.querySelector('.price');
				openItem({
					id: card.dataset.itemId,
					name: name ? name.textContent.trim() : '',
					description: description ? description.textContent.trim() : '',
					price: price ? price.textContent.trim() : '',
					image: image ? image.src : '',
					category: 'Collection',
				});
			});
		});
	}

	function renderItem() {
		const overview = document.getElementById('item-overview');
		if (!overview) {
			return;
		}

		const params = new URLSearchParams(window.location.search);
		let storedItem = null;
		try {
			storedItem = JSON.parse(localStorage.getItem('selectedItem') || 'null');
		} catch (error) {
			console.warn('Could not read the saved item; using URL data.', error);
		}

		const requestedId = params.get('id');
		const savedItemMatches = storedItem
			&& (!requestedId || String(storedItem.id) === requestedId);
		const item = { ...(savedItemMatches ? storedItem : {}) };
		params.forEach((value, key) => {
			item[key] = value;
		});

		const name = item.name || item.title;
		if (!name) {
			overview.className = 'empty-state';
			overview.innerHTML = '<h1>Item not found</h1><p>Select an item from the collection to see its details.</p>';
			document.querySelector('.item-lower-content').hidden = true;
			document.title = 'Item not found | Weissmark';
			return;
		}

		const image = item.image || item.imageUrl || item.thumbnail;
		const description = item.description || 'No description available.';
		const itemId = item.id === undefined || item.id === null ? '' : String(item.id);
		overview.className = 'item-card';
		overview.innerHTML = `
			<div class="item-image">${image
				? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(name)}">`
				: '<span>No image available</span>'}</div>
			<div class="item-details">
				<p class="category">${escapeHtml(item.category || 'Item')}</p>
				<h1>${escapeHtml(name)}</h1>
				<p class="description">${escapeHtml(description)}</p>
				${item.price ? `<p class="price">${escapeHtml(String(item.price))}</p>` : ''}
				${itemId ? `<p class="item-id">Item #${escapeHtml(itemId)}</p>` : ''}
				<div class="purchase-panel">
					<button class="dark-button add-to-cart-button" type="button">Add to cart</button>
					<p id="cart-status" class="action-status" role="status" aria-live="polite"></p>
				</div>
			</div>`;
		document.getElementById('breadcrumb-item').textContent = name;
		document.getElementById('item-description').textContent = description;
		document.getElementById('item-facts').innerHTML = [
			['Collection', item.category || 'Weissmark'],
			...(itemId ? [['Item number', itemId]] : []),
			...(item.price ? [['Price', String(item.price)]] : []),
		].map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('');
		document.title = `${name} | Weissmark`;

		const product = {
			id: itemId || name,
			name,
			price: item.price || '',
			image: image || '',
		};
		const cartButton = overview.querySelector('.add-to-cart-button');
		cartButton.addEventListener('click', () => addToCart(product));
		initializeReviewForm(product);
		renderReviews(product);
		renderCart();
	}

	function readStoredArray(key) {
		const value = localStorage.getItem(key);
		if (value === null) {
			return [];
		}

		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) {
			throw new Error(`Stored data for "${key}" is not a list.`);
		}
		return parsed;
	}

	function updateCartCount() {
		const count = document.getElementById('cart-count');
		if (!count) {
			return;
		}

		try {
			const cart = readStoredArray('weissmarkCart');
			const itemCount = cart.reduce((total, entry) => {
				const quantity = Number(entry.quantity);
				return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
			}, 0);
			count.textContent = String(itemCount);
			count.setAttribute('aria-label', `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`);
		} catch (error) {
			console.warn('Could not read the shopping cart.', error);
			count.textContent = '!';
			count.setAttribute('aria-label', 'Cart count unavailable');
		}
	}

	function renderCart() {
		updateCartCount();
		const cartItems = document.getElementById('cart-items');
		if (!cartItems) {
			return;
		}

		try {
			const cart = readStoredArray('weissmarkCart');
			if (cart.length === 0) {
				cartItems.innerHTML = '<p class="cart-empty">Your cart is empty. Add a piece from the collection to get started.</p>';
				return;
			}

			cartItems.innerHTML = cart.map((entry) => `
				<article class="cart-line">
					<div>
						<h3 class="cart-line-name">${escapeHtml(entry.name || 'Weissmark item')}</h3>
						<p class="cart-line-detail">Quantity: ${escapeHtml(String(entry.quantity || 1))}</p>
					</div>
					${entry.price ? `<p class="cart-line-detail">${escapeHtml(String(entry.price))}</p>` : ''}
				</article>`).join('');
		} catch (error) {
			console.error('Could not load the shopping cart.', error);
			cartItems.innerHTML = '<p class="cart-empty">Your cart could not be loaded. Please check your browser storage settings.</p>';
		}
	}

	function addToCart(product) {
		const status = document.getElementById('cart-status');
		try {
			const cart = readStoredArray('weissmarkCart');
			const existing = cart.find((entry) => String(entry.id) === product.id);
			if (existing) {
				existing.quantity = (Number(existing.quantity) || 0) + 1;
			} else {
				cart.push({ ...product, quantity: 1 });
			}
			localStorage.setItem('weissmarkCart', JSON.stringify(cart));
			renderCart();
			status.textContent = `${product.name} was added to your cart.`;
		} catch (error) {
			console.error('Could not add the item to the shopping cart.', error);
			status.textContent = 'We could not update your cart. Please check your browser storage settings and try again.';
		}
	}

	function reviewStorageKey(product) {
		return `weissmarkReviews:${product.id}`;
	}

	function renderReviews(product) {
		const list = document.getElementById('review-list');
		if (!list) {
			return;
		}

		try {
			const reviews = readStoredArray(reviewStorageKey(product));
			if (reviews.length === 0) {
				list.innerHTML = '<p class="section-copy">There are no reviews yet. Share your experience with this item.</p>';
				return;
			}

			list.innerHTML = reviews.map((review) => {
				const rating = Math.min(5, Math.max(1, Number(review.rating) || 0));
				const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
				return `<article class="review-card">
					<p class="review-rating" aria-label="${rating} out of 5 stars">${stars}<span class="review-rating-label">${rating} out of 5</span></p>
					<h3>${escapeHtml(review.title || 'Customer review')}</h3>
					<p>${escapeHtml(review.body || '')}</p>
				</article>`;
			}).join('');
		} catch (error) {
			console.error('Could not load customer reviews.', error);
			list.innerHTML = '<p class="section-copy">Reviews could not be loaded. Please check your browser storage settings.</p>';
		}
	}

	function initializeReviewForm(product) {
		const form = document.getElementById('review-form');
		if (!form) {
			return;
		}

		form.addEventListener('submit', (event) => {
			event.preventDefault();
			const formData = new FormData(form);
			const review = {
				rating: Number(formData.get('rating')),
				title: String(formData.get('title') || '').trim(),
				body: String(formData.get('body') || '').trim(),
			};
			const status = document.getElementById('review-status');
			if (!review.rating || !review.title || !review.body) {
				status.textContent = 'Please provide a rating, title, and review.';
				return;
			}

			try {
				const key = reviewStorageKey(product);
				const reviews = readStoredArray(key);
				reviews.unshift(review);
				localStorage.setItem(key, JSON.stringify(reviews));
				renderReviews(product);
				form.reset();
				status.textContent = 'Thank you. Your review has been added on this device.';
			} catch (error) {
				console.error('Could not save the customer review.', error);
				status.textContent = 'We could not save your review. Please check your browser storage settings and try again.';
			}
		});
	}

	function escapeHtml(value) {
		return String(value).replace(/[&<>"']/g, (character) => ({
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;',
		})[character]);
	}

	function escapeAttribute(value) {
		return escapeHtml(value);
	}

	initializeCollection();
	renderItem();
})();
