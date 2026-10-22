import { ApiError, json, listProducts, readProductForm, requireAdmin, requireBindings, saveImage } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  await requireAdmin(request, env, true);
  requireBindings(env, ['DB', 'MEDIA']);
  const { product, image } = await readProductForm(request);
  if (!image) throw new ApiError(400, 'Choose a product image to upload.');
  const imageUrl = await saveImage(env, image);
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare('INSERT INTO products (id, name, description, price, category, sizes, featured, image, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, product.name, product.description, product.price, product.category, JSON.stringify(product.sizes), Number(product.featured), imageUrl, Date.now()).run();
  } catch (error) {
    await env.MEDIA.delete(image.key);
    throw error;
  }
  const saved = (await listProducts(env)).find((item) => item.id === id);
  return json(saved, 201);
}

export async function onRequestPut() {
  throw new ApiError(405, 'Use the product-specific endpoint to edit a product.');
}

export async function onRequestDelete() {
  throw new ApiError(405, 'Use the product-specific endpoint to remove a product.');
}
