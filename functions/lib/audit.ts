import type { Env } from './types';

export async function audit(
  request: Request,
  env: Env,
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  outcome: string,
): Promise<void> {
  const salt = env.AUDIT_SALT ?? '';
  const material = `${salt}:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(material),
  );
  const ipHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  await env.DB.prepare(
    'INSERT INTO audit_log (id, ts, actor_email, action, entity, entity_id, ip_hash, user_agent, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      Date.now(),
      actor,
      action,
      entity,
      entityId,
      ipHash,
      (request.headers.get('user-agent') ?? '').slice(0, 300),
      outcome,
    )
    .run();
}
