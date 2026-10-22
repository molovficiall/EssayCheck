# Idek Shirts

Static storefront + Cloudflare Pages Functions (TypeScript) + D1 (database) + R2 (images) + Stripe Checkout.
No frontend framework, no third-party scripts, strict CSP.

## Deploy

1. `npm install`
2. Create resources: `npx wrangler d1 create idek-shirts` (paste the `database_id` into `wrangler.toml`) and `npx wrangler r2 bucket create idek-shirts-media`.
3. Create tables: `npm run db:remote` (local: `npm run db:local`).
4. Edit `wrangler.toml` vars: `SITE_URL`, `SHIP_COUNTRIES`, `ACCESS_TEAM_DOMAIN`.
5. Push to GitHub. Cloudflare dashboard > Workers & Pages > Create > Pages > connect repo. Build command `npm run build`, output directory `public`.
6. Pages project > Settings > Variables and Secrets (type: Secret): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ACCESS_AUD`, `ADMIN_EMAILS` (comma separated), `IP_SALT` (long random string).
7. Stripe dashboard > Developers > Webhooks > add `https://YOURDOMAIN/api/webhook`, events `checkout.session.completed` and `checkout.session.expired`; copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
8. Cloudflare Zero Trust > Access > Applications > Self-hosted. Add destinations `YOURDOMAIN/internal/*` and `YOURDOMAIN/api/internal/*` (also the `*.pages.dev` hostname, or disable it). Policy: Allow, your email(s), require MFA. Copy the Application Audience (AUD) tag to `ACCESS_AUD`, and your team domain to `ACCESS_TEAM_DOMAIN`.
9. Replace brand files (see `public/brand/README.md`) and fill in the [BRACKETS] in `privacy.html` and `terms.html` (have them legally reviewed).
10. Turn off Cloudflare Web Analytics for the project (its script would be blocked by the CSP).

Local dev: copy `.dev.vars.example` to `.dev.vars`, run `npm run db:local`, then `npm run dev`. Admin is at `http://localhost:8788/internal/catalog/` (auth bypass works on localhost only).

## Releasing a product

Open `/internal/catalog/` > New product > fill in name, price, colors, sizes, stock, photos > Publish. Unpublish or Archive from the table. Prices and stock are always read from the database at checkout.

## OWASP mapping

| Risk | Where |
|---|---|
| A01 Access control | `functions/_middleware.ts` guards `/internal/*` and `/api/internal/*` (404 when unauthenticated); Cloudflare Access + `authAdmin` JWT check (`_lib.ts`) with email allowlist; public API returns only published products |
| A02 Crypto | HTTPS + HSTS; secrets only in Pages secrets; no card data touches the site (Stripe-hosted Checkout) |
| A03 Injection | zod `.strict()` on every input; D1 prepared statements only; DOM built with `textContent`/`createElement`, never `innerHTML` with data |
| A04 Insecure design | Server-side pricing and stock checks; atomic stock decrement in webhook (`UPDATE ... WHERE stock >= n` in a D1 batch); D1-backed rate limits (`rateLimit`) |
| A05 Misconfiguration | CSP (no inline script/style, no `unsafe-*`), HSTS, nosniff, frame-ancestors none, COOP/CORP, Permissions-Policy, `no-store` on API; generic error messages |
| A06 Components | 2 runtime deps (zod, jose); Dependabot; `npm audit` in CI |
| A07 Auth | No passwords stored; Access SSO + MFA; JWT signature, issuer, audience, expiry verified |
| A08 Integrity | Stripe signature (HMAC-SHA256, 5 min tolerance, constant-time) and event-ID replay protection |
| A09 Logging | `audit` table for admin writes, bad webhook signatures, oversold orders; errors logged server-side only |
| A10 SSRF | No user-supplied URLs are fetched; outbound only to Stripe and your Access JWKS |
| CSRF | Admin writes require same-origin `Origin` + `X-Idek` header (forces CORS preflight we never allow) |
| Uploads | Magic-byte check (JPEG/PNG/WebP), 5 MB cap, random UUID names, served `nosniff` |

## Also do in the Cloudflare dashboard

- Security > WAF > Rate limiting rules: `/api/checkout` (10 per minute per IP) and `/api/internal/*` (30 per minute per IP) on top of the in-app limits.
- GitHub: protect `main`, require PR review, enable secret scanning and push protection.
- The obscure `/internal/catalog/` path is a minor extra layer only; real protection is Access + JWT + origin check.

## Known limits

- Stock is checked at checkout creation and decremented on payment. If two buyers pay for the last item, the later order is flagged `review` in `orders` (and audited) so you can refund it.
- Orders are stored in D1 (`orders`); there is no order-management UI yet. View with `wrangler d1 execute idek-shirts --remote --command "SELECT * FROM orders ORDER BY created_at DESC LIMIT 20"`.
