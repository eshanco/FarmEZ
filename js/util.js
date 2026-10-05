// Small formatting and DOM helpers shared by the views.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const moneyCents = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

const has = (n) => n !== null && n !== undefined && !Number.isNaN(n);

export const fmtMoney = (n) => (has(n) ? money.format(n) : '–');
export const fmtPrice = (n) => (has(n) ? moneyCents.format(n) : '–');
export const fmtKg = (n) => (has(n) ? `${Math.round(n)} kg` : '–');
export const fmtAdg = (n) => (has(n) ? `${n.toFixed(2)} kg/day` : '–');
export const fmtInt = (n) => (has(n) ? String(Math.round(n)) : '–');

export function fmtDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtAge(months) {
  if (!has(months) || months < 0) return '–';
  return months < 24 ? `${months} mo` : `${Math.floor(months / 12)} y ${months % 12} mo`;
}

export function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Parses a form field to a positive number, or null if it is empty or invalid.
export function positive(value) {
  const n = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Per-device preferences. Storage can be unavailable (private windows), so failures are ignored.
export function getSetting(key) {
  try {
    return positive(localStorage.getItem(`farmez.${key}`) ?? '');
  } catch {
    return null;
  }
}

export function setSetting(key, value) {
  try {
    if (value === null) localStorage.removeItem(`farmez.${key}`);
    else localStorage.setItem(`farmez.${key}`, String(value));
  } catch {
    // ignore
  }
}

export function showError(form, message) {
  const el = form.querySelector('.form-error');
  if (!el) return;
  el.textContent = message ?? '';
  el.hidden = !message;
}

// Surfaces a failed database write (see db.js for why writes are not awaited).
export function reportWrite(done) {
  done.catch((err) => toast(`Could not save: ${err?.code ?? err?.message ?? 'unknown error'}`));
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 5000);
}
