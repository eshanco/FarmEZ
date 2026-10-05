import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adg,
  daysBetween,
  expectedAdg,
  groupStats,
  latestWeight,
  monthsBetween,
  priceTable,
  projectedWeight,
  recentPricePerKg,
  saleStats,
} from '../js/calc.js';

const animal = (over = {}) => ({
  id: 'a1',
  tag: 'IE1',
  breed: 'Charolais',
  damBreed: 'Limousin',
  purchaseDate: '2026-01-01',
  purchaseWeight: 300,
  cost: 1200,
  weighIns: [],
  sale: null,
  ...over,
});

test('daysBetween and monthsBetween', () => {
  assert.equal(daysBetween('2026-01-01', '2026-01-31'), 30);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // across a DST change
  assert.equal(monthsBetween('2025-01-15', '2026-01-14'), 11);
  assert.equal(monthsBetween('2025-01-15', '2026-01-15'), 12);
});

test('latestWeight prefers sale, then newest weigh-in, then purchase', () => {
  assert.deepEqual(latestWeight(animal()), { date: '2026-01-01', kg: 300 });
  const weighed = animal({ weighIns: [{ date: '2026-03-01', kg: 360 }, { date: '2026-02-01', kg: 330 }] });
  assert.deepEqual(latestWeight(weighed), { date: '2026-03-01', kg: 360 });
  const sold = { ...weighed, sale: { date: '2026-04-11', weight: 400, price: 1800 } };
  assert.deepEqual(latestWeight(sold), { date: '2026-04-11', kg: 400 });
});

test('adg is gain over days since purchase', () => {
  assert.equal(adg(animal()), null);
  assert.equal(adg(animal({ sale: { date: '2026-04-11', weight: 400, price: 1800 } })), 1);
});

test('expectedAdg falls back in order: own, breed+dam, breed, all, manual', () => {
  const sold = (id, breed, damBreed, weight) =>
    animal({ id, breed, damBreed, sale: { date: '2026-04-11', weight, price: 1800 } }); // 100 days
  const herd = [
    sold('s1', 'Charolais', 'Limousin', 420), // 1.2
    sold('s2', 'charolais ', 'Friesian', 400), // 1.0
    sold('s3', 'Hereford', 'Friesian', 380), // 0.8
  ];

  const own = animal({ weighIns: [{ date: '2026-01-31', kg: 327 }] });
  assert.deepEqual(expectedAdg(own, herd), { value: 0.9, source: 'own' });

  // A weigh-in under 30 days after purchase is not trusted on its own.
  const tooSoon = animal({ weighIns: [{ date: '2026-01-10', kg: 330 }] });
  assert.equal(expectedAdg(tooSoon, herd).source, 'breed-dam');
  assert.ok(Math.abs(expectedAdg(tooSoon, herd).value - 1.2) < 1e-9);

  const byBreed = expectedAdg(animal({ damBreed: 'Angus' }), herd);
  assert.equal(byBreed.source, 'breed');
  assert.ok(Math.abs(byBreed.value - 1.1) < 1e-9);

  const byAll = expectedAdg(animal({ breed: 'Simmental' }), herd);
  assert.equal(byAll.source, 'all');
  assert.ok(Math.abs(byAll.value - 1.0) < 1e-9);

  assert.deepEqual(expectedAdg(animal(), [], 0.95), { value: 0.95, source: 'manual' });
  assert.deepEqual(expectedAdg(animal(), []), { value: null, source: null });
});

test('projectedWeight grows from the last known weight', () => {
  const a = animal({ weighIns: [{ date: '2026-03-01', kg: 360 }] });
  assert.equal(projectedWeight(a, 1, '2026-03-31'), 390);
  assert.equal(projectedWeight(a, 1, '2026-02-01'), 360); // never projects backwards
});

test('priceTable runs 3.00 to 7.00 in 0.20 steps', () => {
  const rows = priceTable(530);
  assert.equal(rows.length, 21);
  assert.deepEqual(rows[0], { pricePerKg: 3, total: 1590 });
  assert.deepEqual(rows.find((r) => r.pricePerKg === 4), { pricePerKg: 4, total: 2120 });
  assert.deepEqual(rows.find((r) => r.pricePerKg === 4.2), { pricePerKg: 4.2, total: 2226 });
  assert.deepEqual(rows.at(-1), { pricePerKg: 7, total: 3710 });
});

test('saleStats and recentPricePerKg', () => {
  const sold = animal({ sale: { date: '2026-04-11', weight: 400, price: 1800 } });
  assert.deepEqual(saleStats(sold), {
    days: 100,
    gain: 100,
    adg: 1,
    pricePerKg: 4.5,
    profit: 600,
    profitPerDay: 6,
  });
  assert.equal(saleStats(animal()), null);
  assert.equal(recentPricePerKg([sold, animal()]), 4.5);
  assert.equal(recentPricePerKg([animal()]), null);
});

test('groupStats averages sold animals per group, ignoring case and spacing', () => {
  const herd = [
    animal({ id: '1', sale: { date: '2026-04-11', weight: 400, price: 1800 } }),
    animal({ id: '2', breed: ' charolais', sale: { date: '2026-04-11', weight: 420, price: 2000 } }),
    animal({ id: '3', breed: 'Hereford', sale: { date: '2026-04-11', weight: 380, price: 1500 } }),
    animal({ id: '4', breed: 'Hereford' }), // unsold, ignored
  ];
  const groups = groupStats(herd, (a) => a.breed);
  assert.equal(groups.length, 2);
  const charolais = groups.find((g) => g.label === 'Charolais');
  assert.equal(charolais.count, 2);
  assert.ok(Math.abs(charolais.adg - 1.1) < 1e-9);
  assert.equal(charolais.profit, 700);
  assert.equal(groups.find((g) => g.label === 'Hereford').count, 1);
});
