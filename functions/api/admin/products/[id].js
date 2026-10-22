import { ApiError, deleteImage, json, listProducts, readProductForm, requireAdmin, requireBindings, saveImage } from '../../../_lib.js';

export async function onRequestPut({ request, env, params }) {
  await requireAdmin(request, env, true);
  requireBindings(env, ['DB', 'MEDIA']);
  const id = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'Product not found.');
  const existing = await env.DB.prepare('SELECT id, image FROM products WHERE id = ?').bind(id).first();
  if (!existing) throw new ApiError(404, 'Product not found.');
  const { product, image } = await readProductForm(request);
  const imageUrl = image ? await saveImage(env, image) : existing.image;
  try {
    await env.DB.prepare('UPDATE products SET name = ?, description = ?, price = ?, category = ?, sizes = ?, featured = ?, image = ? WHERE id = ?')
      .bind(product.name, product.description, product.price, product.category, JSON.stringify(product.sizes), Number(product.featured), imageUrl, id).run();
  } catch (error) {
    if (image) await env.MEDIA.delete(image.key);
    throw error;
  }
  if (image) await deleteImage(env, existing.image);
  return json((await listProducts(env)).find((item) => item.id === id));
}

export async function onRequestDelete({ request, env, params }) {
  const id = params.id;
  await requireAdmin(request, env, true);
  requireBindings(env, ['DB', 'MEDIA']);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'Product not found.');
  const existing = await env.DB.prepare('SELECT id, image FROM products WHERE id = ?').bind(id).first();
  if (!existing) throw new ApiError(404, 'Product not found.');
  await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
  await deleteImage(env, existing.image);
  return json({ removed: true });
}
