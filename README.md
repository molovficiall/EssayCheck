# Atelier shirt shop

Atelier is deployed on Cloudflare Pages. The original root-level HTML/CSS/JS storefront is copied to `dist/` by `npm run build`; Cloudflare Pages Functions in `functions/` provide the API. D1 stores products, settings, admin sessions, rate limits, and notification idempotency. R2 stores product image uploads. Payments use Stripe Checkout; paid-order email uses the Resend API.

## Cloudflare Pages setup

1. Connect this repository to Cloudflare Pages.
2. Set the build command to `npm run build` and the build output directory to `dist`. Leave the deploy command empty; Git-connected Pages deploys successful builds automatically. Do not set `npm start` or `wrangler deploy` as the deploy command.
3. Bind your existing D1 database as `DB` and an R2 bucket as `MEDIA` in **Settings → Functions → Bindings**. Apply `schema.sql` to that D1 database once, for example with `npx wrangler d1 execute YOUR_DATABASE_NAME --remote --file=schema.sql`.
4. Add these Pages environment variables/secrets in **Settings → Variables and Secrets**, for both production and preview as appropriate:

   - `SITE_URL`: the site's canonical HTTPS origin, without a trailing slash.
   - `ADMIN_PASSWORD`: a unique password with at least 12 characters.
   - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
   - `ORDER_NOTIFICATION_EMAIL`: the address that receives paid-order notices.
   - `RESEND_API_KEY` and `RESEND_FROM`: an email address verified with Resend.
   - `IP_SALT`: a long random value used to hash client IPs for rate limits.

5. In Stripe, create a webhook for `https://YOURDOMAIN/api/stripe/webhook` and subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Set the resulting signing secret as `STRIPE_WEBHOOK_SECRET`.
6. Set `ADMIN_PASSWORD` and `IP_SALT` as encrypted secrets, not in source control. D1 and R2 binding names must exactly match `DB` and `MEDIA`.

## Local Pages development

Use Node.js 20 or newer. Install dependencies with `npm install`, copy `.dev.vars.example` to `.dev.vars` and fill in development secrets. Add your D1 and R2 bindings to the Wrangler configuration for local development, initialize the local D1 database with `npx wrangler d1 execute YOUR_DATABASE_NAME --local --file=schema.sql`, and set `D1_DATABASE_ID` to your D1 database ID. Then run `npm run dev`; Wrangler uses local D1/R2 storage. Never commit `.dev.vars`.

## Existing Express server

`server.js` remains available for a separate Node-host deployment (`npm start`). Cloudflare Pages does not run Express; Pages deployments use the Functions implementation instead.
