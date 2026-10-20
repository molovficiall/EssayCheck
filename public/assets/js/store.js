const CART_KEY = 'idek-cart-v1';
const listeners = new Set();

function read() {
  try {
    const lines = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (!Array.isArray(lines)) return [];
    return lines
      .filter(
        (line) =>
          line &&
          typeof line.productId === 'string' &&
          typeof line.colorId === 'string' &&
          typeof line.sizeId === 'string',
      )
      .map((line) => ({
        lineId: line.lineId || crypto.randomUUID(),
        productId: line.productId,
        slug: line.slug || '',
        colorId: line.colorId,
        sizeId: line.sizeId,
        qty: Math.max(1, Math.min(10, Number(line.qty) || 1)),
      }));
  } catch {
    return [];
  }
}

function write(lines) {
  const safeLines = lines.slice(0, 25);
  localStorage.setItem(CART_KEY, JSON.stringify(safeLines));
  listeners.forEach((listener) => listener(safeLines));
  return safeLines;
}

export const cartStore = {
  get: read,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  add(line) {
    const lines = read();
    const existing = lines.find(
      (item) =>
        item.productId === line.productId &&
        item.colorId === line.colorId &&
        item.sizeId === line.sizeId,
    );
    if (existing) {
      if (existing.qty >= 10) return false;
      existing.qty = Math.min(10, existing.qty + line.qty);
    } else if (lines.length < 25)
      lines.push({ ...line, lineId: crypto.randomUUID() });
    else return false;
    write(lines);
    return true;
  },
  update(lineId, changes) {
    return write(
      read().map((line) =>
        line.lineId === lineId
          ? {
              ...line,
              ...changes,
              qty: Math.max(1, Math.min(10, Number(changes.qty ?? line.qty))),
            }
          : line,
      ),
    );
  },
  remove(lineId) {
    return write(read().filter((line) => line.lineId !== lineId));
  },
  clear() {
    write([]);
  },
};

window.addEventListener('storage', (event) => {
  if (event.key === CART_KEY) listeners.forEach((listener) => listener(read()));
});
