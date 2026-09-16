"use strict";

const express = require("express");
const { pool } = require("../db");
const salesInvoiceService = require("../services/salesInvoiceService");
const emailService = require("../services/emailService");
const { toJson: companyToJson } = require("./company");
const { ValidationError, asyncRoute } = require("../errors");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get("/", asyncRoute(async (req, res) => {
  res.json(await salesInvoiceService.listAll());
}));

router.get("/:id", asyncRoute(async (req, res) => {
  res.json(await salesInvoiceService.get(req.params.id));
}));

router.post("/", asyncRoute(async (req, res) => {
  const saved = await salesInvoiceService.create(req.body || {});
  res.status(201).json(saved);
}));

router.post("/:id/email", asyncRoute(async (req, res) => {
  const { toEmail, ccEmail } = req.body || {};
  if (!toEmail || !EMAIL_RE.test(toEmail)) {
    throw new ValidationError("Enter a valid recipient email address.");
  }
  const invoice = await salesInvoiceService.get(req.params.id);
  const { rows: companyRows } = await pool.query("SELECT * FROM company WHERE id = 1");
  const company = companyToJson(companyRows[0]);
  await emailService.sendInvoiceEmail(invoice, company, toEmail, ccEmail || null);
  res.json({ status: "sent", to: toEmail });
}));

module.exports = router;
