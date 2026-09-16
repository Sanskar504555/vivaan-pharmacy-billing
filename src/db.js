// PostgreSQL connection pool + schema bootstrap, built for Neon/Vercel Postgres.
//
// Serverless note: Vercel spins up (and reuses, while "warm") separate function
// instances, each of which would otherwise open its own set of Postgres connections.
// Two things here specifically guard against exhausting Postgres's connection limit:
//   1. The Pool is created once at module scope, not per-request, so a warm function
//      instance reuses the same small pool across invocations instead of opening new
//      connections every time.
//   2. Use your database provider's *pooled* connection string (Neon's has "-pooler"
//      in the hostname; Vercel Postgres's default connection string already goes
//      through PgBouncer) — see .env.example — so even across many concurrent cold
//      starts, Postgres itself sees one pooled connection, not hundreds of direct ones.
"use strict";

const { Pool } = require("pg");

// node-postgres returns NUMERIC/DECIMAL columns as strings by default (to avoid silent
// precision loss). This app already Number()-wraps every money field it reads (see the
// toJson() functions in src/routes/*.js and src/services/salesInvoiceService.js), but
// this type parser is a belt-and-suspenders safety net for that same conversion at the
// driver level. OID 1700 = numeric.
const { types } = require("pg");
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false }, // Neon/Vercel Postgres require SSL; local Docker Postgres doesn't use it.
  max: 5, // keep modest — a serverless function instance rarely needs more concurrent connections than this.
});

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS company (
    id INT PRIMARY KEY DEFAULT 1,
    firm_name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    mobile1 VARCHAR(20),
    mobile2 VARCHAR(20),
    dl_numbers VARCHAR(255),
    gstin VARCHAR(20),
    pan VARCHAR(20),
    state VARCHAR(100),
    state_code VARCHAR(10),
    bank_name VARCHAR(100),
    bank_account_no VARCHAR(50),
    bank_ifsc VARCHAR(20),
    invoice_prefix VARCHAR(20) DEFAULT 'SCC',
    next_invoice_number BIGINT DEFAULT 1,
    default_salesman VARCHAR(100)
  )`,

  // Postgres has no MySQL-style inline ENUM; party_type is a plain VARCHAR with the
  // same three values enforced in application code (src/routes/parties.js validate()).
  `CREATE TABLE IF NOT EXISTS parties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    party_type VARCHAR(10) DEFAULT 'DEBTOR',
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    state_code VARCHAR(10),
    pincode VARCHAR(10),
    mobile VARCHAR(20),
    phone VARCHAR(20),
    email VARCHAR(255),
    gstin VARCHAR(20),
    pan VARCHAR(20),
    dl_numbers VARCHAR(255),
    opening_balance DECIMAL(12,2) DEFAULT 0,
    opening_balance_is_debit BOOLEAN DEFAULT TRUE,
    credit_days INT DEFAULT 0,
    credit_limit DECIMAL(12,2) DEFAULT 0,
    active BOOLEAN DEFAULT TRUE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_parties_name ON parties (name)`,

  `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    hsn_code VARCHAR(20),
    gst_percent DECIMAL(5,2) DEFAULT 0,
    pack_size INT DEFAULT 1,
    packing_type VARCHAR(30) DEFAULT 'STRIP',
    manufacturer VARCHAR(150),
    scheme VARCHAR(50),
    schedule_type VARCHAR(1) DEFAULT 'G',
    default_mrp DECIMAL(12,2) DEFAULT 0,
    default_sale_rate DECIMAL(12,2) DEFAULT 0,
    default_purchase_rate DECIMAL(12,2) DEFAULT 0,
    category VARCHAR(100),
    active BOOLEAN DEFAULT TRUE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_name ON products (name)`,

  `CREATE TABLE IF NOT EXISTS stock_batches (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id),
    batch_no VARCHAR(100),
    expiry VARCHAR(7),
    mrp DECIMAL(12,2) DEFAULT 0,
    purchase_rate DECIMAL(12,2) DEFAULT 0,
    sale_rate DECIMAL(12,2) DEFAULT 0,
    qty_available INT DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_batches_product ON stock_batches (product_id)`,

  `CREATE TABLE IF NOT EXISTS sales_invoices (
    id SERIAL PRIMARY KEY,
    invoice_no VARCHAR(50),
    invoice_date DATE,
    due_date DATE NULL,
    salesman VARCHAR(100),
    party_id INT REFERENCES parties(id),
    party_name VARCHAR(255),
    party_address VARCHAR(500),
    party_gstin VARCHAR(20),
    party_pan VARCHAR(20),
    party_dl_numbers VARCHAR(255),
    party_state VARCHAR(100),
    party_state_code VARCHAR(10),
    remark VARCHAR(500),
    total_taxable DECIMAL(12,2) DEFAULT 0,
    total_cgst DECIMAL(12,2) DEFAULT 0,
    total_sgst DECIMAL(12,2) DEFAULT 0,
    total_igst DECIMAL(12,2) DEFAULT 0,
    gross_amount DECIMAL(12,2) DEFAULT 0,
    cash_discount DECIMAL(12,2) DEFAULT 0,
    scheme_discount DECIMAL(12,2) DEFAULT 0,
    item_discount DECIMAL(12,2) DEFAULT 0,
    credit_note_adj DECIMAL(12,2) DEFAULT 0,
    debit_note_adj DECIMAL(12,2) DEFAULT 0,
    others_adj DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) DEFAULT 0,
    amount_in_words VARCHAR(500),
    status VARCHAR(20) DEFAULT 'POSTED'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_party ON sales_invoices (party_id)`,

  `CREATE TABLE IF NOT EXISTS sales_invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    line_no INT DEFAULT 0,
    product_id INT NULL REFERENCES products(id),
    stock_batch_id INT NULL REFERENCES stock_batches(id),
    product_name VARCHAR(255),
    hsn_code VARCHAR(20),
    schedule_type VARCHAR(1),
    pack_size INT,
    packing_type VARCHAR(30),
    batch_no VARCHAR(100),
    expiry VARCHAR(7),
    qty INT DEFAULT 0,
    scheme_qty INT DEFAULT 0,
    mrp DECIMAL(12,2) DEFAULT 0,
    rate DECIMAL(12,2) DEFAULT 0,
    disc_percent DECIMAL(5,2) DEFAULT 0,
    taxable_amt DECIMAL(12,2) DEFAULT 0,
    cgst_percent DECIMAL(5,2) DEFAULT 0,
    cgst_amt DECIMAL(12,2) DEFAULT 0,
    sgst_percent DECIMAL(5,2) DEFAULT 0,
    sgst_amt DECIMAL(12,2) DEFAULT 0,
    igst_percent DECIMAL(5,2) DEFAULT 0,
    igst_amt DECIMAL(12,2) DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_items_invoice ON sales_invoice_items (invoice_id)`,
];

const REAL_COMPANY = {
  firmName: "VIVAAN PHARMACY",
  addressLine1: "Shop No.35, Priyadarshani Residency",
  addressLine2: "Damani Nagar, Laxmi Peth, Solapur.",
  mobile1: "9823511799",
  mobile2: "9823843044",
  dlNumbers: "20B-MH-SOL-114330, 21B-MH-SOL-114331, 20D-114332, 20-385554, 21-385555",
  gstin: "27BBEPS8291K1ZW",
  pan: "BBEPS8291K",
  state: "MAHARASHTRA",
  stateCode: "27",
  bankName: "SARASWAT BANK",
  bankAccountNo: "610000000053680",
  bankIfsc: "SRCB0000387",
  invoicePrefix: "SCC",
  nextInvoiceNumber: 34,
  defaultSalesman: "VINAYAK SAGAR",
};

// Guards against every concurrent cold start on Vercel re-running the full schema
// bootstrap; CREATE TABLE IF NOT EXISTS is idempotent regardless, but this keeps a
// warm instance from repeating the round trips on every single request.
let schemaReadyPromise = null;

async function initSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = doInitSchema().catch((err) => {
      schemaReadyPromise = null; // let the next request retry if this attempt failed
      throw err;
    });
  }
  return schemaReadyPromise;
}

async function doInitSchema() {
  const client = await pool.connect();
  try {
    for (const stmt of SCHEMA_STATEMENTS) {
      await client.query(stmt);
    }

    const companyRows = await client.query("SELECT id FROM company WHERE id = 1");
    if (companyRows.rows.length === 0) {
      await client.query(
        `INSERT INTO company (id, firm_name, address_line1, address_line2, mobile1, mobile2,
          dl_numbers, gstin, pan, state, state_code, bank_name, bank_account_no, bank_ifsc,
          invoice_prefix, next_invoice_number, default_salesman)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          REAL_COMPANY.firmName, REAL_COMPANY.addressLine1, REAL_COMPANY.addressLine2,
          REAL_COMPANY.mobile1, REAL_COMPANY.mobile2, REAL_COMPANY.dlNumbers,
          REAL_COMPANY.gstin, REAL_COMPANY.pan, REAL_COMPANY.state, REAL_COMPANY.stateCode,
          REAL_COMPANY.bankName, REAL_COMPANY.bankAccountNo, REAL_COMPANY.bankIfsc,
          REAL_COMPANY.invoicePrefix, REAL_COMPANY.nextInvoiceNumber, REAL_COMPANY.defaultSalesman,
        ]
      );
      console.log("Seeded Vivaan Pharmacy's firm profile.");
    }

    const demoDataEnabled = String(process.env.DEMO_DATA_ENABLED || "false").toLowerCase() === "true";
    if (demoDataEnabled) {
      const partyRows = await client.query("SELECT id FROM parties LIMIT 1");
      if (partyRows.rows.length === 0) {
        const partyResult = await client.query(
          `INSERT INTO parties (name, party_type, address_line1, address_line2, city, state,
            state_code, mobile, email, gstin, dl_numbers, opening_balance, opening_balance_is_debit,
            credit_days, credit_limit, active)
           VALUES ($1, 'DEBTOR', $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, TRUE, 15, 50000, TRUE)
           RETURNING id`,
          ["SHREE MANIK MEDICAL STORES", "OPP KILLA BAUG", "MORARJI PETH", "SOLAPUR",
            "MAHARASHTRA", "27", "9876543210", "manikmedical@example.com", "27ACNPN2689M1ZP",
            "20/SOLA/314171, 21/SOLA/314173, 20/C/314172"]
        );
        console.log(`Seeded demo party (id ${partyResult.rows[0].id}).`);

        const p1 = await client.query(
          `INSERT INTO products (name, hsn_code, gst_percent, pack_size, packing_type,
            manufacturer, scheme, schedule_type, default_mrp, default_sale_rate,
            default_purchase_rate, active)
           VALUES ('UTOCARE SR', '3004909', 12.0, 10, 'STRIP', 'Generic Pharma', NULL, 'S',
            119.90, 55.33, 0, TRUE) RETURNING id`
        );
        await client.query(
          `INSERT INTO stock_batches (product_id, batch_no, expiry, mrp, purchase_rate, sale_rate, qty_available)
           VALUES ($1, 'G/30106', '2025-11', 119.90, 0, 55.33, 500)`,
          [p1.rows[0].id]
        );

        const p2 = await client.query(
          `INSERT INTO products (name, hsn_code, gst_percent, pack_size, packing_type,
            manufacturer, scheme, schedule_type, default_mrp, default_sale_rate,
            default_purchase_rate, active)
           VALUES ('PROTOCOL-F TAB', '2106100', 18.0, 10, 'STRIP', 'Generic Pharma', '5+0', 'N',
            455.00, 308.47, 0, TRUE) RETURNING id`
        );
        await client.query(
          `INSERT INTO stock_batches (product_id, batch_no, expiry, mrp, purchase_rate, sale_rate, qty_available)
           VALUES ($1, 'JTF-2508', '2026-10', 455.00, 0, 308.47, 300)`,
          [p2.rows[0].id]
        );
        console.log("Seeded demo products + starting stock batches.");
      }
    }
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema };
