// Sends an HTML summary of an invoice via SMTP — mirrors the Java version's EmailService.
// Nothing is pre-configured (no password ships with this code); until SMTP_USER/PASSWORD
// are set, this throws a clear, actionable error instead of failing silently.
"use strict";

const nodemailer = require("nodemailer");
const { EmailDeliveryError } = require("../errors");

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildHtml(invoice, company) {
  const rows = invoice.items
    .map(
      (it) => `<tr>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(it.productName)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;">${escapeHtml(it.batchNo || "")}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${it.qty}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${fmtMoney(it.rate)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${fmtMoney(it.taxableAmt)}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#202a26;max-width:640px;">
      <h2 style="margin-bottom:2px;">${escapeHtml(company.firmName)}</h2>
      <p style="margin-top:0;color:#667169;">${escapeHtml(company.addressLine1 || "")}, ${escapeHtml(company.addressLine2 || "")}<br>
      GSTIN: ${escapeHtml(company.gstin || "")}</p>
      <h3>Invoice ${escapeHtml(invoice.invoiceNo)} — ${escapeHtml(invoice.invoiceDate)}</h3>
      <p><strong>To:</strong> ${escapeHtml(invoice.partyName)}<br>${escapeHtml(invoice.partyAddress || "")}</p>
      <table style="border-collapse:collapse;width:100%;margin:12px 0;">
        <thead>
          <tr style="background:#f0f2f0;">
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Product</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:left;">Batch</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Qty</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Rate</th>
            <th style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Taxable</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:16px;"><strong>Net Amount: ₹${fmtMoney(invoice.netAmount)}</strong></p>
      <p style="color:#667169;">${escapeHtml(invoice.amountInWords || "")}</p>
    </div>`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function sendInvoiceEmail(invoice, company, toEmail, ccEmail) {
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;

  if (!smtpUser || !smtpPassword) {
    throw new EmailDeliveryError(
      "Email is not configured yet. Set SMTP_USER and SMTP_PASSWORD (see .env.example), then restart the app."
    );
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: smtpUser, pass: smtpPassword },
    connectionTimeout: 8000,
    socketTimeout: 8000,
  });

  const fromName = process.env.EMAIL_FROM_NAME || company.firmName || "Vivaan Pharmacy";

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${smtpUser}>`,
      to: toEmail,
      cc: ccEmail || undefined,
      subject: `Invoice ${invoice.invoiceNo} from ${company.firmName}`,
      html: buildHtml(invoice, company),
    });
    console.log(`Emailed invoice ${invoice.invoiceNo} to ${toEmail}`);
  } catch (err) {
    console.warn(`Failed to email invoice ${invoice.invoiceNo} to ${toEmail}:`, err.message);
    throw new EmailDeliveryError("Could not send the email. Check your SMTP settings and try again.");
  }
}

module.exports = { sendInvoiceEmail };
