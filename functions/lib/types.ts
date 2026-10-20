export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  RATE_KV?: KVNamespace;
  SITE_URL: string;
  CURRENCY?: string;
  ALLOWED_SHIP_COUNTRIES?: string;
  AUTOMATIC_TAX?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  CSRF_SECRET?: string;
  AUDIT_SALT?: string;
}

export interface PagesContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
  next: () => Promise<Response>;
}

export type PagesFunction<TEnv = Env> = (
  context: PagesContext & { env: TEnv },
) => Response | Promise<Response>;

export interface AuthenticatedData {
  email: string;
  subject: string;
}
