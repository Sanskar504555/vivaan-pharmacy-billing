// Vivaan Pharmacy Billing — Node.js/Express + PostgreSQL edition, built for Vercel.
//
// This file is ONLY for running the app locally in VS Code (`npm run dev` or
// `npm start`) — it starts a normal, persistent Express server with `.listen()`.
// On Vercel itself, this file is never invoked; api/index.js wraps the same shared
// app (src/app.js) as a serverless function instead. Keeping app construction in
// src/app.js means both entry points behave identically.
"use strict";

require("dotenv").config();

const { createApp } = require("./src/app");
const { initSchema } = require("./src/db");

const app = createApp();
const PORT = process.env.PORT || 8080;

async function start() {
  try {
    await initSchema();
  } catch (err) {
    console.error("Failed to connect to Postgres / initialize schema. Check DATABASE_URL in your .env " +
      "(see .env.example) — for local development, that's usually a Postgres instance running on your machine.");
    console.error(err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Vivaan Pharmacy Billing listening on http://localhost:${PORT}`);
    if ((process.env.APP_SECURITY_PASSWORD || "changeme") === "changeme") {
      console.warn("WARNING: using the default admin password — set APP_SECURITY_PASSWORD before going live.");
    }
  });
}

start();
