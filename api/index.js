// Vercel serverless function entry point. vercel.json rewrites every request under
// /api/(.*) to this one function.
//
// Note: this does NOT use `serverless-http`. Vercel's Node.js runtime invokes an
// api/*.js function directly as `(req, res)` — a real http.IncomingMessage /
// http.ServerResponse pair — not a Lambda-style `(event, context)` call. An Express
// app's own signature is already `(req, res)` (that's exactly what you hand to
// http.createServer normally), so it's directly compatible with Vercel's Node.js
// runtime with nothing in between. `serverless-http` exists to translate a Lambda
// event object into something Express understands — since Vercel never gives us that
// event object, wrapping with it here would silently break every request instead of
// helping. (Confirmed by actually simulating Vercel's invocation model locally:
// serverless-http's handler hung indefinitely when called with a raw req/res pair.)
//
// Schema bootstrap (initSchema) runs lazily on first request rather than at module
// load, and is cached (see src/db.js's schemaReadyPromise) so it only actually does
// work once per warm function instance, not on every invocation.
"use strict";

const { createApp } = require("../src/app");
const { initSchema } = require("../src/db");

const app = createApp();

module.exports = async (req, res) => {
  try {
    await initSchema();
  } catch (err) {
    console.error("Failed to connect to Postgres / initialize schema. Check the DATABASE_URL " +
      "environment variable in your Vercel project settings.");
    console.error(err.message);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: "Database is not reachable. Check server logs." }));
    return;
  }
  return app(req, res);
};
