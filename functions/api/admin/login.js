import { ApiError, createAdminSession, enforceRateLimit, readJson } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  await enforceRateLimit(request, env, 'admin-login', 8);
  const body = await readJson(request);
  if (!body || typeof body.password !== 'string' || body.password.length > 256) {
    throw new ApiError(400, 'Enter a valid password.');
  }
  return createAdminSession(request, env, body.password);
}
