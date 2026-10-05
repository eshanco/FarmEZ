// Pure calculations. No DOM, no Firebase, so this file can be unit tested with node.
// Dates are ISO strings (YYYY-MM-DD). Weights are kg, money is euro.

const DAY_MS = 86400000;

// An animal's own gain rate is only trusted once it has been weighed this long after purchase.
export const MIN_OWN_ADG_DAYS = 30;

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(from, to) {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

export function monthsBetween(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

function norm(s) {
  return (s ?? '').trim().toLowerCase();
}

function mean(values) {
  const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

// Most recent known weight: sale weight if sold, else the latest weigh-in, else purchase weight.
export function latestWeight(animal) {
  if (animal.sale) return { date: animal.sale.date, kg: animal.sale.weight };
  let latest = { date: animal.purchaseDate, kg: animal.purchaseWeight };
  for (const w of animal.weighIns ?? []) {
    if (w.date >= latest.date) latest = { date: w.date, kg: w.kg };
  }
  return latest;
}

// Average daily gain in kg/day since purchase, or null when there is no later weight.
export function adg(animal) {
  const last = latestWeight(animal);
  const days = daysBetween(animal.purchaseDate, last.date);
  if (days <= 0) return null;
  return (last.kg - animal.purchaseWeight) / days;
}

// Gain rate to use when projecting an unsold animal. Returns { value, source } where source is
// 'own' | 'breed-dam' | 'breed' | 'all' | 'manual' | null.
export function expectedAdg(animal, animals, manualAdg = null) {
  const last = latestWeight(animal);
  if (daysBetween(animal.purchaseDate, last.date) >= MIN_OWN_ADG_DAYS) {
    return { value: adg(animal), source: 'own' };
  }

  const sold = animals
    .filter((a) => a.sale && a.id !== animal.id)
    .map((a) => ({ a, gain: adg(a) }))
    .filter((x) => x.gain !== null);
  const breed = norm(animal.breed);
  const dam = norm(animal.damBreed);

  const tiers = [
    ['breed-dam', breed && dam ? sold.filter((x) => norm(x.a.breed) === breed && norm(x.a.damBreed) === dam) : []],
    ['breed', breed ? sold.filter((x) => norm(x.a.breed) === breed) : []],
    ['all', sold],
  ];
  for (const [source, matches] of tiers) {
    if (matches.length) return { value: mean(matches.map((x) => x.gain)), source, count: matches.length };
  }

  if (manualAdg !== null && manualAdg !== undefined) return { value: manualAdg, source: 'manual' };
  return { value: null, source: null };
}

// Weight on a given date, growing from the last known weight at the given rate.
export function projectedWeight(animal, adgValue, date) {
  const last = latestWeight(animal);
  const days = Math.max(0, daysBetween(last.date, date));
  return last.kg + adgValue * days;
}

// Average euro/kg achieved over the most recent sales, or null if nothing has been sold.
export function recentPricePerKg(animals, count = 5) {
  const sold = animals
    .filter((a) => a.sale && a.sale.weight > 0)
    .sort((a, b) => (a.sale.date < b.sale.date ? 1 : -1))
    .slice(0, count);
  return mean(sold.map((a) => a.sale.price / a.sale.weight));
}

// Rows of { pricePerKg, total } for a weight. Worked in cents so 0.20 steps do not drift.
export function priceTable(kg, { from = 3, to = 7, step = 0.2 } = {}) {
  const start = Math.round(from * 100);
  const end = Math.round(to * 100);
  const inc = Math.round(step * 100);
  const rows = [];
  for (let cents = start; cents <= end; cents += inc) {
    rows.push({ pricePerKg: cents / 100, total: Math.round(kg * cents) / 100 });
  }
  return rows;
}

// Outcome of a sold animal, or null if it is still on the farm.
export function saleStats(animal) {
  if (!animal.sale) return null;
  const { sale } = animal;
  const days = daysBetween(animal.purchaseDate, sale.date);
  const profit = sale.price - animal.cost;
  return {
    days,
    gain: sale.weight - animal.purchaseWeight,
    adg: adg(animal),
    pricePerKg: sale.weight > 0 ? sale.price / sale.weight : null,
    profit,
    profitPerDay: days > 0 ? profit / days : null,
  };
}

// Averages for sold animals, grouped by whatever keyFn returns (e.g. breed).
export function groupStats(animals, keyFn) {
  const groups = new Map();
  for (const animal of animals) {
    const stats = saleStats(animal);
    if (!stats) continue;
    const label = (keyFn(animal) ?? '').trim() || 'Unknown';
    const key = norm(label);
    if (!groups.has(key)) groups.set(key, { label, rows: [] });
    groups.get(key).rows.push(stats);
  }
  return [...groups.values()].map(({ label, rows }) => ({
    label,
    count: rows.length,
    adg: mean(rows.map((r) => r.adg)),
    days: mean(rows.map((r) => r.days)),
    pricePerKg: mean(rows.map((r) => r.pricePerKg)),
    profit: mean(rows.map((r) => r.profit)),
    profitPerDay: mean(rows.map((r) => r.profitPerDay)),
  }));
}
