// HTTP Basic auth for every page and API endpoint — same single-admin-login model as
// the original Java version (SecurityConfig), so this holds real customer/financial
// data behind at least one password.
"use strict";

const crypto = require("crypto");

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to avoid leaking length via timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function basicAuth(req, res, next) {
  const expectedUser = process.env.APP_SECURITY_USERNAME || "admin";
  const expectedPass = process.env.APP_SECURITY_PASSWORD || "changeme";

  const header = req.headers.authorization || "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sepIndex = decoded.indexOf(":");
    const user = sepIndex >= 0 ? decoded.slice(0, sepIndex) : decoded;
    const pass = sepIndex >= 0 ? decoded.slice(sepIndex + 1) : "";
    if (timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expectedPass)) {
      return next();
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="Vivaan Pharmacy Billing"');
  return res.status(401).json({ message: "Authentication required." });
}

module.exports = { basicAuth };
