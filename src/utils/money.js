// Rounds to 2 decimal places (paise), the same "round after every step" approach the
// frontend's live totals preview already uses (see public/js common in sales-invoice.html's
// round2) — kept consistent here so a saved invoice never disagrees with its own preview.
function round2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function nz(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num : 0;
}

module.exports = { round2, nz };
