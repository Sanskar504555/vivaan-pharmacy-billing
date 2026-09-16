# Deploying to Vercel

## 1. Get a Postgres database

Vercel doesn't bundle a database, so you need one that speaks Postgres and is built for
serverless connection patterns (lots of short-lived connections from many function
instances, rather than one long-lived connection like a traditional server would use).
Two easy free options:

- **[Neon](https://neon.tech)** — sign up, create a project, and copy the connection
  string from the dashboard. **Use the one with `-pooler` in the hostname**, not the
  direct one — that routes through PgBouncer, which is what keeps this app's connection
  pool (see `src/db.js`) from exhausting Postgres's connection limit under concurrent
  cold starts.
- **Vercel Postgres** (powered by Neon under the hood) — from your Vercel project's
  **Storage** tab, **Create Database → Postgres**. Vercel automatically sets the
  `DATABASE_URL` (and a few other) environment variables on your project for you when
  you do this — the default one it sets is already pooled.

Either way, you end up with one connection string that starts with `postgresql://`.

## 2. Push this project to GitHub

```
git init
git add .
git commit -m "Vivaan Pharmacy Billing — Vercel edition"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

(`.gitignore` already excludes `node_modules/` and `.env` — don't commit either.)

## 3. Import the repo into Vercel

1. On [vercel.com](https://vercel.com): **Add New → Project**, then **Import** your
   GitHub repo.
2. Vercel will detect this as a plain Node.js project (no framework preset needed —
   `vercel.json` already tells it where the static files and the API function are).
   Leave the Build & Output settings as detected.
3. Under **Environment Variables**, add:
   - `DATABASE_URL` — the pooled connection string from step 1 (skip this one if you
     used Vercel's own Postgres integration in step 1 — it's already set).
   - `APP_SECURITY_USERNAME`, `APP_SECURITY_PASSWORD` — your real admin login. Don't
     leave `admin`/`changeme`.
   - `DEMO_DATA_ENABLED` — `false` for real use (`true` only if you want sample data).
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_NAME` — only if
     you want the "Email Bill" button to work.
4. Click **Deploy**.

## 4. Verify it came up clean

Open the deployed URL. You should see the dashboard immediately (see the security note
below for why there's no login prompt on the page itself). Try creating a party, a
product, and a sales invoice to confirm the database connection works end-to-end.

If something's wrong:

- **Build fails** — check the build log; this project has no real build step
  (`vercel.json`'s `outputDirectory` just points at the pre-built `public/` folder), so
  a failure here almost always means a `package.json`/dependency problem.
- **Pages load but API calls fail (check the browser's Network tab or Vercel's Function
  Logs)** — almost always `DATABASE_URL` is missing, wrong, or pointing at a
  non-pooled connection string that's run out of capacity. Double-check it in Project
  Settings → Environment Variables, and redeploy after changing it (env var changes
  don't apply to already-built deployments).
- **"Database is not reachable" JSON error** — same as above; check the Function Logs
  for the underlying Postgres error message.

Paste whatever the logs show and I'll help dig into it — same offer that's carried this
app through Hostinger's deployment quirks earlier.

## Important: this platform changes who Basic Auth protects

On the Hostinger, Railway, and Render editions of this app, a single Express server
serves both the frontend pages *and* the `/api/*` data, so the `basicAuth` middleware
(`src/auth.js`) protects everything — you can't even load `index.html` without the
password.

**On Vercel, that's no longer true.** `vercel.json` tells Vercel to serve everything in
`public/` (the HTML/CSS/JS pages) directly from its CDN, which is what makes those pages
fast — but it also means those requests never pass through Express at all, so
`basicAuth` never runs for them. Only requests under `/api/*` (which do run through the
serverless function in `api/index.js`) are still protected.

In practice, this means: **anyone with the URL can view the empty page shells, but
cannot read or write any actual business data** (parties, products, invoices) without
the correct Basic Auth credentials, since all of that goes through `/api/*`. Whether
that's an acceptable gap depends on how sensitive you consider the mere existence/UI of
the app to be — the underlying data stays protected either way.

If you want the pages themselves gated too, options include:

- **Vercel Deployment Protection** (Project Settings → Deployment Protection) — can
  password-protect the entire deployment at the platform level, independent of this
  app's own Basic Auth.
- Switching this deployment to the **Node.js/MySQL Hostinger edition** or the
  **Java+React+Postgres Railway/Render edition** of this app instead, where one Express
  (or Spring) server fronts everything and there's no CDN/function split — both already
  give full-app Basic Auth coverage by default.

This is a real, worth-understanding trade-off of Vercel's static+serverless
architecture — not a bug in this app's code, but genuinely different behavior from
every other hosting option this app has been built for.
