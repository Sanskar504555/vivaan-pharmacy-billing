# Vivaan Pharmacy — Billing (Node.js + Express + PostgreSQL, built for Vercel)

Wholesale pharmaceutical billing software for Vivaan Pharmacy (Solapur, Maharashtra) —
party (debtor/creditor) master, product master with batch-wise stock, and a GST-accurate
Sales Invoice voucher that matches the firm's real bill format, including CGST/SGST vs
IGST splitting by state code and an "amount in words" line.

This edition is the same application logic as the Node.js/MySQL (Hostinger) edition,
ported to **PostgreSQL** and restructured to run as a **Vercel serverless function**,
while still running as a completely normal local Express server for development in VS
Code.

## Running it locally in VS Code

1. Install a PostgreSQL server if you don't already have one (e.g. `brew install
   postgresql` on Mac, `apt install postgresql` on Linux, or the official Windows
   installer), and create a database:
   ```
   createdb pharma_billing
   ```
   (Or use a free hosted Postgres like [Neon](https://neon.tech) even for local dev —
   either way you just need a connection string.)
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` with your database's
   connection string, plus `APP_SECURITY_USERNAME`/`PASSWORD` (the admin login).
3. Install dependencies and start the app:
   ```
   npm install
   npm run dev
   ```
4. Open `http://localhost:8080` — your browser will prompt for the Basic Auth
   username/password you set in `.env`. The database schema and Vivaan Pharmacy's real
   firm profile are created automatically on first run (see `src/db.js`).

Set `DEMO_DATA_ENABLED=true` in `.env` if you want one sample party and two sample
products seeded in, useful for trying the app out before entering real data.

## Deploying: GitHub → Vercel

See **DEPLOYMENT-VERCEL.md** for the full walkthrough — pushing to GitHub, creating a
Neon or Vercel Postgres database, setting environment variables on Vercel, and an
important security note about static files bypassing Basic Auth on this platform
specifically (not an issue on the Hostinger/Railway/Render editions of this app).

## How the pieces fit together

- `src/app.js` builds the Express app (routes, JSON body parsing, Basic Auth, the
  local static file server) but never calls `.listen()`.
- `server.js` is the **local-only** entry point: it calls `createApp()` then
  `app.listen()`. This is what `npm run dev`/`npm start` runs.
- `api/index.js` is the **Vercel-only** entry point. It calls the same `createApp()`
  directly with the `(req, res)` pair Vercel's Node.js runtime hands it — an Express
  app's own call signature is already `(req, res)`, the same thing you'd give
  `http.createServer()`, so no extra adapter library is needed (an earlier draft of this
  file used `serverless-http`, which actually expects an AWS Lambda-style
  `(event, context)` call and would have hung on every real request on Vercel — caught by
  simulating Vercel's exact invocation model locally before shipping this). `vercel.json`
  routes every `/api/*` request to this one function.
- `public/` holds the frontend (plain HTML/CSS/JS, no build step) — served by Express
  locally, and directly by Vercel's CDN in production (`vercel.json`'s
  `outputDirectory`).

## A real bug found and fixed while porting this to Postgres

`company.next_invoice_number` is a `BIGINT` column. The MySQL driver (`mysql2`) used in
the Hostinger edition auto-converts `BIGINT` to a JS number, but the Postgres driver
(`pg`) deliberately returns `BIGINT` as a **string**, since some BIGINT values are too
large to represent exactly as a JS number. The invoice-numbering code did `num + 1` on
that value — which silently changed from addition to string concatenation
(`"34" + 1 === "341"`, not `35`). This was caught by actually running the ported app
against a real local PostgreSQL instance and posting two invoices in a row, not by code
review — the same lesson that came up earlier while building the Java+Postgres edition
of this app (a Spring Security CSRF bug there was only found by manual review, since
that edition could never be executed at all; this one could be run, and running it
found a different real bug). Fixed in `src/services/salesInvoiceService.js` and
`src/routes/company.js` by `Number()`-wrapping the value before using it. If you're
also running the Java+Postgres edition of this app, it does the equivalent addition in
Java where `long` arithmetic doesn't have this string-coercion problem, so it isn't
affected the same way — but it's worth keeping in mind if you ever touch that field.

## Email Bill

`POST /api/sales-invoices/:id/email` sends an HTML summary of an invoice via SMTP.
Nothing is pre-configured — until you set `SMTP_USER`/`SMTP_PASSWORD` in your
environment, this endpoint returns a clear `502` error explaining what to set, rather
than failing silently. For Gmail, use an
[App Password](https://myaccount.google.com/apppasswords), not your normal password.
