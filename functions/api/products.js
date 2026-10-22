import { json, listProducts } from '../_lib.js';

export async function onRequestGet({ env }) {
  return json(await listProducts(env));
}
