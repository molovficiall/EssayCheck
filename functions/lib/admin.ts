import type { Env, PagesFunction } from './types';
import { authenticate } from './auth';
import { verifyCsrf } from './csrf';
import { audit } from './audit';

export async function adminIdentity(request: Request, env: Env, write = false) {
  const identity = await authenticate(request, env);
  if (write) await verifyCsrf(request, identity.subject, env.CSRF_SECRET ?? '');
  return identity;
}

export async function logAdmin(
  request: Request,
  env: Env,
  email: string,
  action: string,
  entity: string,
  id: string,
): Promise<void> {
  await audit(request, env, email, action, entity, id, 'success');
}

export function noStore<T extends PagesFunction<Env>>(handler: T): T {
  return (async (context) => {
    const response = await handler(context);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }) as T;
}
