import { ApiError, getSettings, json, readJson, requireAdmin } from '../../_lib.js';

export async function onRequestPut({ request, env }) {
  await requireAdmin(request, env, true);
  const body = await readJson(request);
  const featuredTitle = typeof body?.featuredTitle === 'string' ? body.featuredTitle.trim() : '';
  const featuredColor = typeof body?.featuredColor === 'string' ? body.featuredColor : '';
  if (!featuredTitle || featuredTitle.length > 60 || !/^#[0-9a-fA-F]{6}$/.test(featuredColor)) {
    throw new ApiError(400, 'Enter a section name (up to 60 characters) and a valid hex color.');
  }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('featuredTitle', featuredTitle),
    env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('featuredColor', featuredColor)
  ]);
  return json(await getSettings(env));
}
