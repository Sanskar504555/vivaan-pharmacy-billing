// The core billing logic — a straight port of the Java SalesInvoiceService, kept
// step-for-step identical (same rounding points, same oversell check placed before any
// stock is touched, same GST split rule) so the numbers this produces match the
// original app exactly, including against the sample bill's own totals.
"use strict";

const { pool } = require("../db");
const { round2, nz } = require("../utils/money");
const amountInWords = require("../utils/amountInWords");
const { NotFoundError, ValidationError } = require("../errors");
const { toJson: partyToJson } = require("../routes/parties");

function joinNonBlank(sep, parts) {
  return parts.filter((p) => p && String(p).trim()).join(sep);
}

async function nextInvoiceNumber(client) {
  // SELECT ... FOR UPDATE locks the company row for the rest of this transaction, so two
  // invoices being saved at the same instant can't both grab the same number.
  const { rows } = await client.query("SELECT invoice_prefix, next_invoice_number FROM company WHERE id = 1 FOR UPDATE");
  const prefix = rows[0].invoice_prefix || "SCC";
  // next_invoice_number is BIGINT — node-postgres returns BIGINT as a string (not a
  // number) to avoid silent precision loss on very large values, so this MUST be
  // Number()-wrapped before arithmetic. Without it, `num + 1` string-concatenates
  // ("34" + 1 === "341") instead of incrementing — caught via live testing against a
  // real Postgres instance, not by code review.
  const num = Number(rows[0].next_invoice_number) || 1;
  await client.query("UPDATE company SET next_invoice_number = $1 WHERE id = 1", [num + 1]);
  return `${prefix}/${num}`;
}

async function itemToInvoiceRow(client, itemReq, company, interState) {
  const { rows: productRows } = await client.query("SELECT * FROM products WHERE id = $1", [itemReq.productId]);
  if (productRows.length === 0) throw new NotFoundError("Product not found: " + itemReq.productId);
  const product = productRows[0];

  let batch = null;
  if (itemReq.stockBatchId) {
    const { rows: batchRows } = await client.query("SELECT * FROM stock_batches WHERE id = $1 FOR UPDATE", [itemReq.stockBatchId]);
    if (batchRows.length === 0) throw new NotFoundError("Batch not found: " + itemReq.stockBatchId);
    batch = batchRows[0];
    const requestedQty = Number(itemReq.qty) || 0;
    const available = Number(batch.qty_available) || 0;
    if (requestedQty > available) {
      throw new ValidationError(
        `Insufficient stock for ${product.name} batch ${batch.batch_no}: requested ${requestedQty}, only ${available} available.`
      );
    }
  }

  const mrp = nz(itemReq.mrp != null ? itemReq.mrp : (batch ? batch.mrp : product.default_mrp));
  const rate = nz(
    itemReq.rate != null
      ? itemReq.rate
      : (batch && Number(batch.sale_rate) > 0 ? batch.sale_rate : product.default_sale_rate)
  );
  const discPercent = nz(itemReq.discPercent);
  const qty = Number(itemReq.qty) || 0;
  if (qty < 1) throw new ValidationError(`Quantity must be at least 1 for ${product.name}.`);
  if (discPercent < 0 || discPercent > 100) throw new ValidationError("Discount % must be between 0 and 100.");

  const lineGross = round2(rate * qty);
  const taxable = round2(lineGross * (1 - discPercent / 100));
  const lineDisc = round2(lineGross - taxable);

  const gstPercent = nz(product.gst_percent);
  let cgstPercent = 0, sgstPercent = 0, igstPercent = 0;
  let cgstAmt = 0, sgstAmt = 0, igstAmt = 0;

  if (interState) {
    igstPercent = gstPercent;
    igstAmt = round2((taxable * igstPercent) / 100);
  } else {
    cgstPercent = round2(gstPercent / 2);
    sgstPercent = cgstPercent;
    cgstAmt = round2((taxable * cgstPercent) / 100);
    sgstAmt = round2((taxable * sgstPercent) / 100);
  }

  return {
    productId: product.id,
    stockBatchId: batch ? batch.id : null,
    productName: product.name,
    hsnCode: product.hsn_code,
    scheduleType: product.schedule_type,
    packSize: product.pack_size,
    packingType: product.packing_type,
    batchNo: batch ? batch.batch_no : (itemReq.batchNo || null),
    expiry: batch ? batch.expiry : (itemReq.expiry || null),
    qty,
    schemeQty: Number(itemReq.schemeQty) || 0,
    mrp, rate, discPercent,
    taxableAmt: taxable,
    cgstPercent, cgstAmt, sgstPercent, sgstAmt, igstPercent, igstAmt,
    lineGross, lineDisc,
    _batchDeduct: batch ? { id: batch.id, qty } : null,
  };
}

function invoiceRowToJson(invoiceRow, items, party) {
  return {
    id: invoiceRow.id,
    invoiceNo: invoiceRow.invoice_no,
    invoiceDate: formatDate(invoiceRow.invoice_date),
    dueDate: formatDate(invoiceRow.due_date),
    salesman: invoiceRow.salesman,
    party: party || null,
    partyName: invoiceRow.party_name,
    partyAddress: invoiceRow.party_address,
    partyGstin: invoiceRow.party_gstin,
    partyPan: invoiceRow.party_pan,
    partyDlNumbers: invoiceRow.party_dl_numbers,
    partyState: invoiceRow.party_state,
    partyStateCode: invoiceRow.party_state_code,
    remark: invoiceRow.remark,
    items: items.map((it) => ({
      id: it.id,
      productName: it.product_name,
      hsnCode: it.hsn_code,
      scheduleType: it.schedule_type,
      packSize: it.pack_size,
      packingType: it.packing_type,
      batchNo: it.batch_no,
      expiry: it.expiry,
      qty: it.qty,
      schemeQty: it.scheme_qty,
      mrp: Number(it.mrp),
      rate: Number(it.rate),
      discPercent: Number(it.disc_percent),
      taxableAmt: Number(it.taxable_amt),
      cgstPercent: Number(it.cgst_percent),
      cgstAmt: Number(it.cgst_amt),
      sgstPercent: Number(it.sgst_percent),
      sgstAmt: Number(it.sgst_amt),
      igstPercent: Number(it.igst_percent),
      igstAmt: Number(it.igst_amt),
    })),
    totalTaxable: Number(invoiceRow.total_taxable),
    totalCgst: Number(invoiceRow.total_cgst),
    totalSgst: Number(invoiceRow.total_sgst),
    totalIgst: Number(invoiceRow.total_igst),
    grossAmount: Number(invoiceRow.gross_amount),
    cashDiscount: Number(invoiceRow.cash_discount),
    schemeDiscount: Number(invoiceRow.scheme_discount),
    itemDiscount: Number(invoiceRow.item_discount),
    creditNoteAdj: Number(invoiceRow.credit_note_adj),
    debitNoteAdj: Number(invoiceRow.debit_note_adj),
    othersAdj: Number(invoiceRow.others_adj),
    netAmount: Number(invoiceRow.net_amount),
    amountInWords: invoiceRow.amount_in_words,
    status: invoiceRow.status,
  };
}

function formatDate(d) {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function create(req) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: companyRows } = await client.query("SELECT * FROM company WHERE id = 1");
    const company = companyRows[0];

    if (!req.partyId) throw new ValidationError("A party must be selected.");
    const { rows: partyRows } = await client.query("SELECT * FROM parties WHERE id = $1", [req.partyId]);
    if (partyRows.length === 0) throw new NotFoundError("Party not found: " + req.partyId);
    const party = partyRows[0];

    if (!Array.isArray(req.items) || req.items.length === 0) {
      throw new ValidationError("At least one item is required.");
    }

    const interState = !!(party.state_code && company.state_code && party.state_code.trim() !== company.state_code.trim());

    const invoiceNo = await nextInvoiceNumber(client);
    const invoiceDate = req.invoiceDate || new Date().toISOString().slice(0, 10);
    const dueDate = req.dueDate && String(req.dueDate).trim() ? req.dueDate : null;
    const salesman = req.salesman && String(req.salesman).trim() ? req.salesman : company.default_salesman;
    const partyAddress = joinNonBlank(", ", [party.address_line1, party.address_line2, party.city]);
    const defaultRemark = company.bank_name
      ? `${company.bank_name}, ACC NO.${company.bank_account_no || ""},IFSC ${company.bank_ifsc || ""}`
      : "";
    const remark = req.remark && String(req.remark).trim() ? req.remark : defaultRemark;

    let gross = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0, lineDiscTotal = 0;
    const rows = [];
    for (const itemReq of req.items) {
      const row = await itemToInvoiceRow(client, itemReq, company, interState);
      rows.push(row);
      gross = round2(gross + row.lineGross);
      taxable = round2(taxable + row.taxableAmt);
      cgst = round2(cgst + row.cgstAmt);
      sgst = round2(sgst + row.sgstAmt);
      igst = round2(igst + row.igstAmt);
      lineDiscTotal = round2(lineDiscTotal + row.lineDisc);
    }

    const schemeDiscount = nz(req.schemeDiscount);
    const itemDiscount = nz(req.itemDiscount);
    const creditNoteAdj = nz(req.creditNoteAdj);
    const debitNoteAdj = nz(req.debitNoteAdj);
    const othersAdj = nz(req.othersAdj);
    const addAmt = round2(cgst + sgst + igst);
    const net = round2(
      gross + addAmt - lineDiscTotal - schemeDiscount - itemDiscount - creditNoteAdj + debitNoteAdj + othersAdj
    );
    const amountInWordsText = "RUPEES " + amountInWords.convert(net);

    const { rows: invoiceInsertRows } = await client.query(
      `INSERT INTO sales_invoices (invoice_no, invoice_date, due_date, salesman, party_id,
        party_name, party_address, party_gstin, party_pan, party_dl_numbers, party_state,
        party_state_code, remark, total_taxable, total_cgst, total_sgst, total_igst,
        gross_amount, cash_discount, scheme_discount, item_discount, credit_note_adj,
        debit_note_adj, others_adj, net_amount, amount_in_words, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, 'POSTED') RETURNING id`,
      [
        invoiceNo, invoiceDate, dueDate, salesman, party.id, party.name, partyAddress,
        party.gstin, party.pan, party.dl_numbers, party.state, party.state_code, remark,
        taxable, cgst, sgst, igst, gross, lineDiscTotal, schemeDiscount, itemDiscount,
        creditNoteAdj, debitNoteAdj, othersAdj, net, amountInWordsText,
      ]
    );
    const invoiceId = invoiceInsertRows[0].id;

    let lineNo = 0;
    for (const row of rows) {
      await client.query(
        `INSERT INTO sales_invoice_items (invoice_id, line_no, product_id, stock_batch_id,
          product_name, hsn_code, schedule_type, pack_size, packing_type, batch_no, expiry,
          qty, scheme_qty, mrp, rate, disc_percent, taxable_amt, cgst_percent, cgst_amt,
          sgst_percent, sgst_amt, igst_percent, igst_amt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23)`,
        [
          invoiceId, lineNo++, row.productId, row.stockBatchId, row.productName, row.hsnCode,
          row.scheduleType, row.packSize, row.packingType, row.batchNo, row.expiry, row.qty,
          row.schemeQty, row.mrp, row.rate, row.discPercent, row.taxableAmt, row.cgstPercent,
          row.cgstAmt, row.sgstPercent, row.sgstAmt, row.igstPercent, row.igstAmt,
        ]
      );
      if (row._batchDeduct) {
        // Oversell was already rejected in itemToInvoiceRow before any row was written, and
        // the batch was locked with FOR UPDATE, so this decrement is safe under concurrency.
        await client.query(
          "UPDATE stock_batches SET qty_available = qty_available - $1 WHERE id = $2",
          [row._batchDeduct.qty, row._batchDeduct.id]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`Posted sales invoice ${invoiceNo} for party '${party.name}' — net amount ${net}`);

    const { rows: invoiceRows } = await pool.query("SELECT * FROM sales_invoices WHERE id = $1", [invoiceId]);
    const { rows: itemRows } = await pool.query("SELECT * FROM sales_invoice_items WHERE invoice_id = $1 ORDER BY line_no ASC", [invoiceId]);
    return invoiceRowToJson(invoiceRows[0], itemRows, partyToJson(party));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listAll() {
  const { rows } = await pool.query("SELECT * FROM sales_invoices ORDER BY invoice_date DESC, id DESC");
  return rows.map((r) => invoiceRowToJson(r, [], null));
}

async function get(id) {
  const { rows } = await pool.query("SELECT * FROM sales_invoices WHERE id = $1", [id]);
  if (rows.length === 0) throw new NotFoundError("Sales invoice not found: " + id);
  const { rows: itemRows } = await pool.query("SELECT * FROM sales_invoice_items WHERE invoice_id = $1 ORDER BY line_no ASC", [id]);
  let party = null;
  if (rows[0].party_id) {
    const { rows: partyRows } = await pool.query("SELECT * FROM parties WHERE id = $1", [rows[0].party_id]);
    if (partyRows.length) party = partyToJson(partyRows[0]);
  }
  return invoiceRowToJson(rows[0], itemRows, party);
}

module.exports = { create, listAll, get };
