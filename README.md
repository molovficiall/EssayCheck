# Idek Shirts

Static storefront and Cloudflare Pages Functions e-commerce starter. The frontend is semantic HTML, custom CSS, and vanilla ES modules; server routes use TypeScript, Cloudflare D1/R2, Zod validation, Cloudflare Access, and hosted Stripe Checkout. No card details are handled by this site.

## Prerequisites and local setup

Use Node.js 22 LTS, npm, a Cloudflare account with Pages/D1/R2 (KV is optional), and a Stripe account.

1. Run `npm ci`.
2. Copy `.dev.vars.example` to `.dev.vars`; set `SITE_URL=http://localhost:8788`. Keep Stripe test secrets out of source control.
3. Create a local D1 database named `idek-shirts`, then run `npm run migrate:local`.
4. Configure the `idek-shirts-media` R2 bucket and bindings in `wrangler.toml`. Replace the account-specific D1 and KV IDs.
5. Run `npm run seed` to add three unpublished sample products. They do not appear on the storefront.
6. Run `npm run csp:hash`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, then `npm run dev`.

## Cloudflare deployment

Create a Pages project connected to this repository. Build command: `npm run build`; output directory: `public`; root: `/`. Pages detects the `functions/` directory automatically. Use the compatibility date in `wrangler.toml`. Create D1 and apply `npm run migrate:remote`; create the `idek-shirts-media` R2 bucket and bind it as `MEDIA`. Optionally create KV and bind `RATE_KV`. Configure production variables and secrets in the Cloudflare dashboard or with `npx wrangler pages secret put NAME --project-name idek-shirts`, then attach the production domain, force HTTPS, and set `SITE_URL` to its canonical origin. Never commit `.dev.vars`.

Replace `database_id` and KV `id` in `wrangler.toml` with the actual resource identifiers. Enable GitHub secret scanning, push protection, and CodeQL. Protect `main` with required PR review and CI checks and configure `.github/CODEOWNERS` for the real maintainer team.

## Cloudflare Access

Create a Cloudflare Zero Trust self-hosted application for the production hostname with protected paths `/internal/*` and `/api/internal/*`. Use an allow policy restricted to administrator emails, require MFA (SSO or OTP), and set session duration to at most eight hours. Set `ACCESS_AUD` to the application's audience tag and `ACCESS_TEAM_DOMAIN` to the team subdomain (without protocol or `.cloudflareaccess.com`). Set `ADMIN_EMAILS` to comma-separated lowercase email addresses. The Function independently verifies `Cf-Access-Jwt-Assertion` signature, issuer, audience, time claims, and email allowlist.

The non-obvious `/internal/catalog/` path is only a minor layer, not a security boundary. Real protection is Cloudflare Access plus Function JWT verification, CSRF, rate limiting, and audit logging. Do not link the catalog from the public site.

## Environment configuration

| Variable                 | Purpose                                                |
| ------------------------ | ------------------------------------------------------ |
| `SITE_URL`               | Canonical origin and server-owned Checkout return URLs |
| `CURRENCY`               | Three-letter currency; defaults to `usd`               |
| `ALLOWED_SHIP_COUNTRIES` | Comma-separated Stripe allowlist, e.g. `US,CA`         |
| `AUTOMATIC_TAX`          | `true` or `false`                                      |
| `STRIPE_SECRET_KEY`      | Stripe secret API key                                  |
| `STRIPE_WEBHOOK_SECRET`  | Stripe webhook signing secret                          |
| `ACCESS_TEAM_DOMAIN`     | Cloudflare Access team subdomain                       |
| `ACCESS_AUD`             | Access application audience                            |
| `ADMIN_EMAILS`           | Allowed administrator emails                           |
| `CSRF_SECRET`            | High-entropy server-only CSRF HMAC secret              |
| `AUDIT_SALT`             | High-entropy server-only salt for IP hashing           |

`wrangler.toml` documents D1, R2, optional KV, and non-secret variables. Checkout is limited to 10 requests/minute/IP, cart validation to 60/minute/IP, and internal APIs should be limited to 30 requests/minute/IP with Cloudflare account-level rate rules. The Function uses KV when configured and D1 otherwise.

## Stripe setup

1. In Stripe test mode, create a webhook endpoint at `https://YOUR_DOMAIN/api/stripe/webhook`.
2. Subscribe to `checkout.session.completed`, `checkout.session.expired`, and `charge.refunded`.
3. Put test secrets in `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
4. Run a test order using Stripe's documented test card numbers in test mode. Verify order state, stock decrement, expiry, duplicate delivery, and refund behavior from Stripe's event panel.
5. Before launch, replace test keys with live-mode secrets and create a live webhook endpoint with the same events.

Stripe Checkout is a hosted redirect. No Stripe.js is loaded, no card details reach this site, and Checkout line prices are always read from D1. Idempotency keys are accepted per checkout attempt.

## Catalog and release workflow

After Access and database setup, visit `/internal/catalog/`. Create a draft, set the product name/slug, price, colors, sizes/stock, image and required alt text. Uploads allow JPEG/PNG/WebP up to 5 MiB. Publishing requires at least one image and a stocked variant. Published products are visible in the shop and generated sitemap; unpublish changes status to draft and archive removes the product from sale. Descriptions are plain text and rendered as text, never HTML.

## OWASP Top 10:2021 mapping

| Category                                       | Files and controls                                                                                                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control                      | `functions/api/internal/_middleware.ts`, `functions/internal/_middleware.ts`, `functions/lib/auth.ts`, `functions/api/internal/products/`; Cloudflare Access, per-request JWT/email validation, UUID-only admin APIs, published-only public queries |
| A02 Cryptographic Failures                     | `functions/lib/csrf.ts`, `functions/lib/audit.ts`, `functions/api/stripe/webhook.ts`, `functions/_middleware.ts`; HMAC/SHA-256, HTTPS/HSTS, secrets in encrypted vars                                                                               |
| A03 Injection                                  | `functions/lib/validate.ts`, `functions/lib/errors.ts`, D1 route handlers, `public/assets/js/dom.js`; strict Zod schemas, bound SQL, safe text DOM                                                                                                  |
| A04 Insecure Design                            | `docs/THREAT_MODEL.md`, `functions/lib/ratelimit.ts`, `functions/api/checkout/session.ts`, `functions/api/stripe/webhook.ts`, `migrations/0001_init.sql`; untrusted cart, bounded input, atomic stock-abort trigger                                 |
| A05 Security Misconfiguration                  | `functions/_middleware.ts`, `public/_headers`, `public/_redirects`, `wrangler.toml`; strict CSP without unsafe-inline/eval, HSTS, nosniff, frame protections, no-store API/admin                                                                    |
| A06 Vulnerable and Outdated Components         | `package.json`, `package-lock.json`, `.github/dependabot.yml`, `.github/workflows/ci.yml`; pinned npm dependencies, weekly updates, `npm audit --audit-level=high`                                                                                  |
| A07 Identification and Authentication Failures | Access MFA policy, `functions/lib/auth.ts`, `functions/api/internal/session.ts`; RS256 and issuer/audience/expiry/nbf/email checks, no locally stored passwords                                                                                     |
| A08 Software and Data Integrity Failures       | `functions/api/stripe/webhook.ts`, `migrations/0002_orders.sql`, `.github/workflows/ci.yml`; raw-body signature, five-minute tolerance, unique event id, CI checks                                                                                  |
| A09 Security Logging and Monitoring Failures   | `functions/lib/audit.ts`, `migrations/0003_audit.sql`, internal route handlers; hashed IP, truncated user-agent, admin and failed-auth records                                                                                                      |
| A10 Server-Side Request Forgery                | `functions/api/checkout/session.ts`, `functions/lib/auth.ts`, `functions/api/internal/upload.ts`; fixed Stripe/JWKS hosts, upload-only images, no user URL fetch                                                                                    |

There are no third-party runtime scripts, so SRI is not applicable. Use Cloudflare Workers Logs or Logpush, and alert on repeated webhook failures, rate limits, and elevated 5xx rates. `security.txt` is at `/.well-known/security.txt`.

## Privacy and legal review

Privacy and terms are templates, not legal advice. Review for the actual entity, address, jurisdiction, tax, shipping, and returns/refunds policy before launch. The storefront uses essential cart/theme localStorage only, without tracking/analytics cookies, so no consent banner is shown. Add consent management if non-essential analytics or marketing tracking is introduced.

## Branding and operations

Replace logo and favicon placeholders following `public/assets/brand/README.md`. Self-hosted Archivo, IBM Plex Sans, and IBM Plex Mono fonts are included with their SIL Open Font License notices. Rotate Stripe, Access, CSRF, and audit secrets periodically and immediately after suspected exposure. Configure branch protections, required CI, CodeQL, secret scanning, push protection, D1 backup, rate-limit rules, and Cloudflare/Stripe alerting before launch.

The image upload route checks type and magic bytes but preserves file data. Add a production image-processing step to strip EXIF metadata before public use.

## Decisions

- The provided token colors are retained as requested; fine hairline grid rules are decorative, while keyboard focus uses a high-contrast accent outline.
- Turnstile is not implemented; do not enable a client-side challenge without adding server-side verification.
- User-provided fonts and brand artwork were not supplied. System font fallbacks and neutral brand placeholders keep local pages usable.
