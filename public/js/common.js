// Shared helpers used across all pages.

const NAV_LINKS = [
  { href: "index.html", label: "Dashboard" },
  { href: "parties.html", label: "Parties (Debtors/Creditors)" },
  { href: "products.html", label: "Products & Stock" },
  { href: "sales-invoice.html", label: "Sales Invoice" },
];

function renderNav(activeHref) {
  const bar = document.getElementById("topbar");
  if (!bar) return;
  const brand = document.createElement("div");
  brand.className = "brand";
  brand.textContent = "VIVAAN PHARMACY — Billing";
  const nav = document.createElement("nav");
  NAV_LINKS.forEach((l) => {
    const a = document.createElement("a");
    a.href = l.href;
    a.textContent = l.label;
    if (l.href === activeHref) a.classList.add("active");
    nav.appendChild(a);
  });
  bar.appendChild(brand);
  bar.appendChild(nav);
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.message || JSON.stringify(body);
    } catch (e) { /* ignore parse errors */ }
    throw new Error(msg || ("Request failed: " + res.status));
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function toast(message, isError) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle("error", !!isError);
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 3200);
}

function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

// "2025-11" -> "11-25" (matches the sample bill's MM-YY expiry format)
function fmtExpiry(yearMonth) {
  if (!yearMonth) return "";
  const [y, m] = yearMonth.split("-");
  return `${m}-${y.slice(2)}`;
}
