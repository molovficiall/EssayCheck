import { cartStore } from './store.js';
import { request } from './api.js';

if (location.pathname.endsWith('/success.html')) {
  cartStore.clear();
  const sessionId = new URLSearchParams(location.search).get('session_id');
  const target = document.querySelector('[data-order-reference]');
  if (target && sessionId) {
    try {
      const confirmation = await request(
        `/api/order/confirmation?session_id=${encodeURIComponent(sessionId)}`,
      );
      target.textContent = `Order reference ${confirmation.reference}`;
    } catch {
      target.textContent =
        'We are confirming your payment. Check your email for the receipt.';
    }
  }
}
