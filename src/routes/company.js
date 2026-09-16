"use strict";

const express = require("express");
const { pool } = require("../db");
const { NotFoundError, ValidationError, asyncRoute } = require("../errors");

const router = express.Router();

function toJson(row) {
  return {
    id: row.id,
    firmName: row.firm_name,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    mobile1: row.mobile1,
    mobile2: row.mobile2,
    dlNumbers: row.dl_numbers,
    gstin: row.gstin,
    pan: row.pan,
    state: row.state,
    stateCode: row.state_code,
    bankName: row.bank_name,
    bankAccountNo: row.bank_account_no,
    bankIfsc: row.bank_ifsc,
    invoicePrefix: row.invoice_prefix,
    // BIGINT column — node-postgres returns it as a string; Number() it so the JSON API
    // gives the frontend an actual number like every other numeric field here.
    nextInvoiceNumber: Number(row.next_invoice_number) || 0,
    defaultSalesman: row.default_salesman,
  };
}

router.get("/", asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM company WHERE id = 1");
  if (rows.length === 0) throw new NotFoundError("Company profile not set up yet.");
  res.json(toJson(rows[0]));
}));

router.put("/", asyncRoute(async (req, res) => {
  const b = req.body || {};
  if (!b.firmName || !String(b.firmName).trim()) {
    throw new ValidationError("Firm name is required.");
  }
  await pool.query(
    `UPDATE company SET firm_name=$1, address_line1=$2, address_line2=$3, mobile1=$4, mobile2=$5,
      dl_numbers=$6, gstin=$7, pan=$8, state=$9, state_code=$10, bank_name=$11, bank_account_no=$12,
      bank_ifsc=$13, invoice_prefix=$14, default_salesman=$15 WHERE id = 1`,
    [
      b.firmName, b.addressLine1 || null, b.addressLine2 || null, b.mobile1 || null,
      b.mobile2 || null, b.dlNumbers || null, b.gstin || null, b.pan || null, b.state || null,
      b.stateCode || null, b.bankName || null, b.bankAccountNo || null, b.bankIfsc || null,
      b.invoicePrefix || "SCC", b.defaultSalesman || null,
    ]
  );
  const { rows } = await pool.query("SELECT * FROM company WHERE id = 1");
  res.json(toJson(rows[0]));
}));

module.exports = { router, toJson };
