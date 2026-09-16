// Small typed errors so route handlers can just `throw` and let one error-handling
// middleware turn them into the right HTTP status + a clear { message } body — the
// frontend's api() helper (public/js/common.js) already expects that shape.
"use strict";

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.status = 404;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

class EmailDeliveryError extends Error {
  constructor(message) {
    super(message);
    this.status = 502;
  }
}

// Wraps an async Express route handler so a rejected promise reaches next(err)
// instead of crashing the process or hanging the request.
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // A known, typed error (NotFoundError/ValidationError/EmailDeliveryError) always has
  // its own `status` set by its constructor above — including EmailDeliveryError's 502,
  // which must NOT be swallowed by the generic 500 fallback below. Only a truly
  // unexpected exception (no `status` at all) falls back to the masked message.
  if (err.status) {
    if (err.status >= 500) {
      console.warn("Request failed with a known upstream error:", err.message);
    }
    return res.status(err.status).json({ message: err.message || "Request failed." });
  }

  console.error("Unhandled error while processing request:", err);
  res.status(500).json({
    message: "Something went wrong on our end. Please try again; if it keeps happening, check the server logs.",
  });
}

module.exports = { NotFoundError, ValidationError, EmailDeliveryError, asyncRoute, errorHandler };
