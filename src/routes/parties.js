"use strict";

const express = require("express");
const { pool } = require("../db");
const { NotFoundError, ValidationError, asyncRoute } = require("../errors");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toJson(row) {
  return {
    id: row.id,
    name: row.name,
    partyType: row.party_type,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    stateCode: row.state_code,
    pincode: row.pincode,
    mobile: row.mobile,
    phone: row.phone,
    email: row.email,
    gstin: row.gstin,
    pan: row.pan,
    dlNumbers: row.dl_numbers,
    openingBalance: Number(row.opening_balance) || 0,
    openingBalanceIsDebit: !!row.opening_balance_is_debit,
    creditDays: row.credit_days,
    creditLimit: Number(row.credit_limit) || 0,
    active: !!row.active,
  };
}

function validate(b) {
  if (!b.name || !String(b.name).trim()) throw new ValidationError("Party name is required.");
  if (b.email && !EMAIL_RE.test(b.email)) throw new ValidationError("Enter a valid email address.");
  const validTypes = ["DEBTOR", "CREDITOR", "BOTH"];
  if (b.partyType && !validTypes.includes(b.partyType)) {
    throw new ValidationError("Party type must be DEBTOR, CREDITOR, or BOTH.");
  }
}

function params(b) {
  return [
    b.name, b.partyType || "DEBTOR", b.addressLine1 || null, b.addressLine2 || null,
    b.city || null, b.state || null, b.stateCode || null, b.pincode || null, b.mobile || null,
    b.phone || null, b.email || null, b.gstin || null, b.pan || null, b.dlNumbers || null,
    b.openingBalance || 0, b.openingBalanceIsDebit !== false, b.creditDays || 0,
    b.creditLimit || 0, b.active !== false,
  ];
}

router.get("/", asyncRoute(async (req, res) => {
  const q = req.query.q;
  const { rows } = q
    ? await pool.query("SELECT * FROM parties WHERE name ILIKE $1 ORDER BY name ASC", [`%${q}%`])
    : await pool.query("SELECT * FROM parties WHERE active = TRUE ORDER BY name ASC");
  res.json(rows.map(toJson));
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM parties WHERE id = $1", [req.params.id]);
  if (rows.length === 0) throw new NotFoundError("Party not found: " + req.params.id);
  res.json(toJson(rows[0]));
}));

router.post("/", asyncRoute(async (req, res) => {
  const b = req.body || {};
  validate(b);
  const { rows } = await pool.query(
    `INSERT INTO parties (name, party_type, address_line1, address_line2, city, state,
      state_code, pincode, mobile, phone, email, gstin, pan, dl_numbers, opening_balance,
      opening_balance_is_debit, credit_days, credit_limit, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    params(b)
  );
  res.status(201).json(toJson(rows[0]));
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const b = req.body || {};
  validate(b);
  const existing = await pool.query("SELECT id FROM parties WHERE id = $1", [req.params.id]);
  if (existing.rows.length === 0) throw new NotFoundError("Party not found: " + req.params.id);
  const { rows } = await pool.query(
    `UPDATE parties SET name=$1, party_type=$2, address_line1=$3, address_line2=$4, city=$5, state=$6,
      state_code=$7, pincode=$8, mobile=$9, phone=$10, email=$11, gstin=$12, pan=$13, dl_numbers=$14,
      opening_balance=$15, opening_balance_is_debit=$16, credit_days=$17, credit_limit=$18, active=$19
     WHERE id = $20 RETURNING *`,
    [...params(b), req.params.id]
  );
  res.json(toJson(rows[0]));
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const existing = await pool.query("SELECT id FROM parties WHERE id = $1", [req.params.id]);
  if (existing.rows.length === 0) throw new NotFoundError("Party not found: " + req.params.id);
  await pool.query("UPDATE parties SET active = FALSE WHERE id = $1", [req.params.id]);
  res.status(204).send();
}));

module.exports = { router, toJson };
