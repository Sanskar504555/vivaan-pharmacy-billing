// Converts a rupee amount into Indian-numbering-system words (crore/lakh/thousand/hundred),
// matching the format used on the sample GST Tax Invoice ("RUPEES ... ONLY").
"use strict";

const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN",
  "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function twoDigit(n) {
  if (n < 20) return ONES[n];
  const rest = n % 10 ? " " + ONES[n % 10] : "";
  return TENS[Math.floor(n / 10)] + rest;
}

function convert(amount) {
  let rupees = Math.round(Number(amount) || 0);
  if (rupees === 0) return "ZERO ONLY";

  const parts = [];
  const crore = Math.floor(rupees / 10000000); rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000); rupees %= 100000;
  const thousand = Math.floor(rupees / 1000); rupees %= 1000;
  const hundred = Math.floor(rupees / 100); rupees %= 100;

  if (crore) parts.push(twoDigit(crore) + " CRORE");
  if (lakh) parts.push(twoDigit(lakh) + " LAKH");
  if (thousand) parts.push(twoDigit(thousand) + " THOUSAND");
  if (hundred) parts.push(ONES[hundred] + " HUNDRED");
  if (rupees) parts.push((parts.length ? "AND " : "") + twoDigit(rupees));

  return parts.join(" ") + " ONLY";
}

module.exports = { convert };
