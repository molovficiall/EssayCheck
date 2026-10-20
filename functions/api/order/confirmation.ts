import type { Env, PagesFunction } from '../../lib/types';
import { HttpError, json, requireMethod } from '../../lib/errors';
import { z } from 'zod';
import { stripeRequest } from '../../lib/stripe';

const sessionSchema = z.string().regex(/^cs_(?:test_|live_)[A-Za-z0-9]+$/);

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  requireMethod(request, ['GET']);
  const sessionId = sessionSchema.safeParse(
    new URL(request.url).searchParams.get('session_id'),
  );
  if (!sessionId.success) throw new HttpError(400, 'Invalid session');
  const response = await stripeRequest(
    env,
    `/v1/checkout/sessions/${encodeURIComponent(sessionId.data)}`,
  );
  if (!response.ok) throw new HttpError(404, 'Order not found');
  const session = (await response.json()) as {
    payment_status?: string;
    metadata?: { order_id?: string };
  };
  if (session.payment_status !== 'paid' || !session.metadata?.order_id)
    throw new HttpError(404, 'Order not found');
  return json(
    { reference: session.metadata.order_id.slice(-6).toUpperCase() },
    200,
    { 'Cache-Control': 'no-store' },
  );
};
