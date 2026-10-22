import { currentAdmin, json, requireBindings } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  requireBindings(env, ['DB']);
  const session = await currentAdmin(request, env);
  return json({ authenticated: Boolean(session), csrfToken: session?.csrfToken || null });
}
