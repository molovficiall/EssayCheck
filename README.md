# Atelier shirt shop

A small Node.js and Express storefront. The HTML pages in the repository root are served directly by `server.js`. Stripe Checkout handles payments, and a Stripe webhook sends paid-order notifications by email.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set real values for the Stripe test key, admin password, session secret, and SMTP settings.
4. Run `npm start` and open `http://localhost:3000`.

## Deploy

Deploy this project to a host that runs a persistent Node.js application. Configure the environment variables from `.env.example` in the host's secret/environment settings, then run `npm start`.

Cloudflare Pages serves static files and does not run this Express server. The admin API, Stripe Checkout creation, sessions, uploads, and email webhook require the Node.js backend. To use Pages, the backend must be separately hosted and the frontend configured to call it, or the backend must be migrated to Cloudflare Pages Functions and compatible storage.

## Stripe order email

Set `STRIPE_WEBHOOK_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `ORDER_NOTIFICATION_EMAIL`. Configure a Stripe webhook at `/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.

## Admin

Open the home page and use the admin section. The admin password is configured with `ADMIN_PASSWORD`; use a unique strong value in production. Product and settings data are stored under `data/`, and uploaded product images are stored under `uploads/`.
