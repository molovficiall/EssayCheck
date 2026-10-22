import { getSettings, json } from '../_lib.js';

export async function onRequestGet({ env }) {
  return json(await getSettings(env));
}
