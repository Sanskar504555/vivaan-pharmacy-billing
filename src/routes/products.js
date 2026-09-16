"use strict";

const express = require("express");
const { pool } = require("../db");
const { NotFoundError, ValidationError, asyncRoute } = require("../errors");

const router = express.Router();

function toJson(row) {
  return {
    id: row.id,
    name: row.name,
    hsnCode: row.hsn_code,
    gstPercent: Number(row.gst_percent) || 0,
    packSize: row.pack_size,
    packingType: row.packing_type,
    manufacturer: row.manufacturer,
    scheme: row.scheme,
    scheduleType: row.schedule_type,
    defaultMrp: Number(row.default_mrp) || 0,
    defaultSaleRate: Number(row.default_sale_rate) || 0,
    defaultPurchaseRate: Number(row.default_purchase_rate) || 0,
    category: row.category,
    active: !!row.active,
  };
}

function batchToJson(row) {
  return {
    id: row.id,
    productId: row.product_id,
    batchNo: row.batch_no,
    expiry: row.expiry,
    mrp: Number(row.mrp) || 0,
    purchaseRate: Number(row.purchase_rate) || 0,
    saleRate: Number(row.sale_rate) || 0,
    qtyAvailable: row.qty_available,
  };
}

function validateProduct(b) {
  if (!b.name || !String(b.name).trim()) throw new ValidationError("Product name is required.");
}

function productParams(b) {
  return [
    b.name, b.hsnCode || null, b.gstPercent || 0, b.packSize || 1, b.packingType || "STRIP",
    b.manufacturer || null, b.scheme || null, b.scheduleType || "G", b.defaultMrp || 0,
    b.defaultSaleRate || 0, b.defaultPurchaseRate || 0, b.category || null, b.active !== false,
  ];
}

router.get("/", asyncRoute(async (req, res) => {
  const q = req.query.q;
  const { rows } = q
    ? await pool.query("SELECT * FROM products WHERE name ILIKE $1 ORDER BY name ASC", [`%${q}%`])
    : await pool.query("SELECT * FROM products WHERE active = TRUE ORDER BY name ASC");
  res.json(rows.map(toJson));
}));

router.get("/:id", asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
  if (rows.length === 0) throw new NotFoundError("Product not found: " + req.params.id);
  res.json(toJson(rows[0]));
}));

router.post("/", asyncRoute(async (req, res) => {
  const b = req.body || {};
  validateProduct(b);
  const { rows } = await pool.query(
    `INSERT INTO products (name, hsn_code, gst_percent, pack_size, packing_type, manufacturer,
      scheme, schedule_type, default_mrp, default_sale_rate, default_purchase_rate, category, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    productParams(b)
  );
  res.status(201).json(toJson(rows[0]));
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const b = req.body || {};
  validateProduct(b);
  const existing = await pool.query("SELECT id FROM products WHERE id = $1", [req.params.id]);
  if (existing.rows.length === 0) throw new NotFoundError("Product not found: " + req.params.id);
  const { rows } = await pool.query(
    `UPDATE products SET name=$1, hsn_code=$2, gst_percent=$3, pack_size=$4, packing_type=$5,
      manufacturer=$6, scheme=$7, schedule_type=$8, default_mrp=$9, default_sale_rate=$10,
      default_purchase_rate=$11, category=$12, active=$13 WHERE id = $14 RETURNING *`,
    [...productParams(b), req.params.id]
  );
  res.json(toJson(rows[0]));
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  const existing = await pool.query("SELECT id FROM products WHERE id = $1", [req.params.id]);
  if (existing.rows.length === 0) throw new NotFoundError("Product not found: " + req.params.id);
  await pool.query("UPDATE products SET active = FALSE WHERE id = $1", [req.params.id]);
  res.status(204).send();
}));

// --- Stock batches ---

router.get("/:id/batches", asyncRoute(async (req, res) => {
  const availableOnly = String(req.query.availableOnly).toLowerCase() === "true";
  const { rows } = availableOnly
    ? await pool.query(
        "SELECT * FROM stock_batches WHERE product_id = $1 AND qty_available > 0 ORDER BY expiry ASC",
        [req.params.id]
      )
    : await pool.query(
        "SELECT * FROM stock_batches WHERE product_id = $1 ORDER BY expiry ASC",
        [req.params.id]
      );
  res.json(rows.map(batchToJson));
}));

router.post("/:id/batches", asyncRoute(async (req, res) => {
  const b = req.body || {};
  if (!b.batchNo || !String(b.batchNo).trim()) throw new ValidationError("Batch number is required.");
  if (!b.expiry) throw new ValidationError("Expiry (month/year) is required.");
  const product = await pool.query("SELECT id FROM products WHERE id = $1", [req.params.id]);
  if (product.rows.length === 0) throw new NotFoundError("Product not found: " + req.params.id);
  const { rows } = await pool.query(
    `INSERT INTO stock_batches (product_id, batch_no, expiry, mrp, purchase_rate, sale_rate, qty_available)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.params.id, b.batchNo, b.expiry, b.mrp || 0, b.purchaseRate || 0, b.saleRate || 0, b.qtyAvailable || 0]
  );
  res.status(201).json(batchToJson(rows[0]));
}));

router.put("/batches/:batchId", asyncRoute(async (req, res) => {
  const b = req.body || {};
  const existing = await pool.query("SELECT * FROM stock_batches WHERE id = $1", [req.params.batchId]);
  if (existing.rows.length === 0) throw new NotFoundError("Batch not found: " + req.params.batchId);
  const current = existing.rows[0];
  const { rows } = await pool.query(
    `UPDATE stock_batches SET batch_no=$1, expiry=$2, mrp=$3, purchase_rate=$4, sale_rate=$5, qty_available=$6
     WHERE id = $7 RETURNING *`,
    [
      b.batchNo || current.batch_no, b.expiry || current.expiry, b.mrp ?? current.mrp,
      b.purchaseRate ?? current.purchase_rate, b.saleRate ?? current.sale_rate,
      b.qtyAvailable ?? current.qty_available, req.params.batchId,
    ]
  );
  res.json(batchToJson(rows[0]));
}));

router.delete("/batches/:batchId", asyncRoute(async (req, res) => {
  await pool.query("DELETE FROM stock_batches WHERE id = $1", [req.params.batchId]);
  res.status(204).send();
}));

module.exports = { router, toJson, batchToJson };
