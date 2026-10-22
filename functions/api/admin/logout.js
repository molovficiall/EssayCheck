import { destroyAdminSession, requireAdmin } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const session = await requireAdmin(request, env, true);
  return destroyAdminSession(request, env, session);
}
