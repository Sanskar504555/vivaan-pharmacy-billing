// Builds the Express app itself, with no `.listen()` call — shared by:
//   - server.js      (plain `node server.js` / `npm run dev`, for local VS Code use)
//   - api/index.js   (Vercel's serverless function, via serverless-http)
// Keeping construction in one place means the routes, middleware and static files behave
// identically whether you're running this on your own machine or on Vercel.
"use strict";

const path = require("path");
const express = require("express");
const { basicAuth } = require("./auth");
const { errorHandler } = require("./errors");

const companyRoutes = require("./routes/company").router;
const partyRoutes = require("./routes/parties").router;
const productRoutes = require("./routes/products").router;
const salesInvoiceRoutes = require("./routes/salesInvoices");

function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  // Every API endpoint sits behind a single admin login (same model as the original
  // Java version's Spring Security setup) — change APP_SECURITY_PASSWORD before relying
  // on this for real business use (see .env.example).
  //
  // IMPORTANT — read this if you're deploying to Vercel: this middleware only protects
  // requests that reach Express, i.e. everything under /api/*. The static frontend files
  // (index.html, parties.html, css/, js/, ...) live in public/, which vercel.json points
  // Vercel's CDN at directly, WITHOUT an Express server in front of them — that's how
  // Vercel's static hosting works. That means on Vercel, the HTML/CSS/JS pages themselves
  // are NOT behind Basic Auth, only the /api/* data underneath them is. See
  // DEPLOYMENT-VERCEL.md for what this means in practice and how to add real page
  // protection (Vercel's own password-protection / Deployment Protection features) if you
  // need it. On Hostinger/Railway/Render, where Express serves public/ itself (see the
  // express.static line right below), basicAuth DOES cover the pages too — this gap is
  // specific to Vercel's static+serverless split.
  app.use("/api", basicAuth);

  app.use("/api/company", companyRoutes);
  app.use("/api/parties", partyRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/sales-invoices", salesInvoiceRoutes);

  // Local/VS Code convenience only: when this app is run directly with `node server.js`
  // (not on Vercel, where public/ is served by the CDN instead), also serve those same
  // files from Express so `npm run dev` gives you the full app on one port. Scoped to the
  // public/ folder only — never the project root — so package.json, .env, and src/ are
  // never accidentally servable.
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use("/api", (req, res) => {
    res.status(404).json({ message: "Not found." });
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
