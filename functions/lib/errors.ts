export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(
  data: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof HttpError) {
    return json(
      { error: error.message, details: error.details, requestId },
      error.status,
    );
  }
  console.error(
    JSON.stringify({
      requestId,
      error: error instanceof Error ? error.message : 'unknown',
    }),
  );
  return json({ error: 'Internal server error', requestId }, 500);
}

export function requireMethod(request: Request, allowed: string[]): void {
  if (!allowed.includes(request.method)) {
    throw new HttpError(405, 'Method not allowed');
  }
}

export function requireSameOrigin(request: Request): void {
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    request.headers.get('sec-fetch-site') !== 'same-origin'
  ) {
    throw new HttpError(403, 'Origin not allowed');
  }
}

export async function readJson(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<unknown> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes)
    throw new HttpError(413, 'Request body too large');
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
