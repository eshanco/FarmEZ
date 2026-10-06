import {
  adg, daysBetween, expectedAdg, expectedPricePerKg, latestWeight, monthsBetween, projectedWeight, saleStats,
} from '../calc.js';
import { breedName } from '../breeds.js';
import { deleteAnimal, updateAnimal } from '../db.js';
import { priceTableHtml } from './calculator.js';
import {
  esc, fmtAdg, fmtAge, fmtDate, fmtInt, fmtKg, fmtMoney, fmtPrice, positive, reportWrite, showError, todayISO,
} from '../util.js';

// Interim weigh-ins are switched off while there is no scale on the farm. Set to true to bring
// back the Weights section; the calculations already use any weigh-ins an animal has.
const WEIGH_INS_ENABLED = false;

const SAVE_DELAY = 800;

// What the user has typed into the estimate panel, kept across re-renders of the same animal.
let est = { id: null, date: '', adg: '', price: '' };
// Sale weight and bid typed at the ring, kept the same way until the sale is recorded.
let saleDraft = { id: null, weight: '', price: '' };

const SOURCE_TEXT = {
  own: () => "Gain rate is this animal's own average since purchase.",
  'breed-dam': (a, n) => `Gain rate is the average of ${n} sold ${a.breed} × ${a.damBreed}.`,
  breed: (a, n) => `Gain rate is the average of ${n} sold ${a.breed}.`,
  all: (a, n) => `Gain rate is the average of all ${n} sold animals.`,
  manual: () => 'Gain rate is the figure you entered.',
};

export function renderAnimal(el, { state, arg }) {
  const animal = state.animals.find((a) => a.id === arg);
  if (!animal) {
    el.innerHTML = `<p class="empty">Animal not found. <a href="#herd">Back to herd</a>.</p>`;
    return;
  }
  if (est.id !== animal.id) est = { id: animal.id, date: '', adg: '', price: '' };
  if (saleDraft.id !== animal.id || animal.sale) saleDraft = { id: animal.id, weight: '', price: '' };

  const uid = state.user.uid;
  const today = todayISO();
  const last = latestWeight(animal);
  const sold = Boolean(animal.sale);

  el.innerHTML = `
    <a class="back" href="#herd">‹ Herd</a>
    <div class="page-head">
      <h1>${esc(animal.tag)} <span class="badge ${sold ? 'sold' : ''}">${sold ? 'Sold' : animal.sellingDate ? 'Selling' : 'On farm'}</span></h1>
      <div class="actions">
        ${sold ? '' : '<button class="btn primary" type="button" id="go-sell">Sell</button>'}
        <a class="btn" href="#edit/${esc(animal.id)}">Edit</a>
        <button class="btn danger" type="button" id="delete-animal">Delete</button>
      </div>
    </div>

    <section class="card">
      <dl class="facts">
        <div><dt>Breed</dt><dd>${breedFact(animal.breed)}</dd></div>
        <div><dt>Dam breed</dt><dd>${breedFact(animal.damBreed)}</dd></div>
        <div><dt>Born</dt><dd>${fmtDate(animal.dob)} <span class="muted">(${fmtAge(monthsBetween(animal.dob, sold ? animal.sale.date : today))}${sold ? ' at sale' : ''})</span></dd></div>
        <div><dt>Purchased</dt><dd>${fmtDate(animal.purchaseDate)}</dd></div>
        <div><dt>Weight at purchase</dt><dd>${fmtKg(animal.purchaseWeight)}</dd></div>
        <div><dt>Cost</dt><dd>${fmtMoney(animal.cost)} <span class="muted">(${fmtPrice(animal.cost / animal.purchaseWeight)}/kg)</span></dd></div>
        ${animal.wintered ? '<div><dt>Wintered</dt><dd>Yes</dd></div>' : ''}
        ${animal.location ? `<div><dt>Location</dt><dd>${esc(animal.location)}</dd></div>` : ''}
      </dl>
    </section>

    ${sold ? saleResult(animal) : onFarmSections(animal, last, today)}

    ${!WEIGH_INS_ENABLED ? '' : `
    <section class="card">
      <h2>Weights</h2>
      ${weightHistory(animal)}
      ${sold ? '' : `
      <form id="weigh-form" class="inline-form" novalidate>
        <label>Date
          <input name="date" type="date" required min="${esc(animal.purchaseDate)}" max="${today}" value="${today}">
        </label>
        <label>Weight (kg)
          <input name="kg" type="number" inputmode="decimal" min="1" step="0.5" required>
        </label>
        <button class="btn" type="submit">Add weigh-in</button>
        <p class="form-error" role="alert" hidden></p>
      </form>`}
    </section>`}

    ${sold ? '' : `
    <section class="card" id="sale-section">
      <h2>Record sale</h2>
      <p class="hint lead">Enter the sale weight to see what each €/kg comes to. Type the bid as it rises to see the €/kg you are getting.</p>
      <form id="sale-form" class="inline-form" novalidate>
        <label>Sale date
          <input name="date" type="date" required min="${esc(last.date)}" max="${today}" value="${today}">
        </label>
        <label>Sale weight (kg)
          <input name="weight" type="number" inputmode="decimal" min="1" step="0.5" required value="${esc(saleDraft.weight)}">
        </label>
        <label>Bid / sale price (€)
          <input name="price" type="number" inputmode="decimal" min="0" step="0.01" required value="${esc(saleDraft.price)}">
        </label>
        <button class="btn primary" type="submit">Record sale</button>
        <p class="form-error" role="alert" hidden></p>
      </form>
      <div id="sale-gauge"></div>
    </section>`}`;

  const write = async (data) => reportWrite((await updateAnimal(uid, animal.id, data)).done);

  el.querySelector('#delete-animal').addEventListener('click', async () => {
    if (!confirm(`Delete ${animal.tag} and all its records? This cannot be undone.`)) return;
    reportWrite((await deleteAnimal(uid, animal.id)).done);
    location.hash = '#herd';
  });

  el.querySelectorAll('[data-delete-weigh]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const date = btn.dataset.deleteWeigh;
      if (!confirm(`Remove the weigh-in from ${fmtDate(date)}?`)) return;
      write({ weighIns: animal.weighIns.filter((w) => w.date !== date) });
    }),
  );

  el.querySelector('#undo-sale')?.addEventListener('click', () => {
    if (!confirm(`Remove the sale record for ${animal.tag} and move it back to the farm?`)) return;
    write({ sale: null });
  });

  const weighForm = el.querySelector('#weigh-form');
  weighForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(weighForm));
    const kg = positive(f.kg);
    let error = null;
    if (!f.date) error = 'Choose the date of the weigh-in.';
    else if (kg === null) error = 'Enter the weight in kg.';
    else if (f.date < animal.purchaseDate) error = 'A weigh-in cannot be before the purchase date.';
    else if (f.date > today) error = 'A weigh-in cannot be in the future.';
    showError(weighForm, error);
    if (error) return;
    // One weight per day: a second entry for the same date replaces the first.
    const weighIns = [...(animal.weighIns ?? []).filter((w) => w.date !== f.date), { date: f.date, kg }]
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    write({ weighIns });
  });

  const saleForm = el.querySelector('#sale-form');
  saleForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(saleForm));
    const weight = positive(f.weight);
    const price = positive(f.price);
    let error = null;
    if (!f.date) error = 'Choose the sale date.';
    else if (weight === null) error = 'Enter the sale weight in kg.';
    else if (price === null) error = 'Enter the sale price in euro.';
    else if (f.date < last.date) error = `Sale date cannot be before the last recorded weight (${fmtDate(last.date)}).`;
    else if (f.date > today) error = 'Sale date cannot be in the future.';
    showError(saleForm, error);
    if (error) return;
    write({ sale: { date: f.date, weight, price }, sellingDate: null });
  });

  if (!sold) {
    wireEstimate(el, animal, state.animals, uid, today);
    wireSaleGauge(el, animal, saleForm);
  }
}

// Live at the ring: the price table for the sale weight, and what the current bid is per kg.
function wireSaleGauge(el, animal, form) {
  const gauge = el.querySelector('#sale-gauge');
  const update = () => {
    const weight = positive(form.elements.weight.value);
    const bid = positive(form.elements.price.value);
    if (weight === null) {
      gauge.innerHTML = '';
      return;
    }
    gauge.innerHTML = `
      ${bid === null ? '' : `
      <div class="tiles">
        <div class="tile"><span>Bid is worth</span><strong>${fmtPrice(bid / weight)}/kg</strong></div>
        <div class="tile"><span>Margin over cost</span><strong class="${bid < animal.cost ? 'neg' : 'pos'}">${fmtMoney(bid - animal.cost)}</strong></div>
      </div>`}
      ${priceTableHtml(weight, { cost: animal.cost, bid })}`;
  };
  form.addEventListener('input', () => {
    saleDraft.weight = form.elements.weight.value;
    saleDraft.price = form.elements.price.value;
    update();
  });
  el.querySelector('#go-sell').addEventListener('click', () => {
    el.querySelector('#sale-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.weight.focus({ preventScroll: true });
  });
  update();
}

// Card code with the full name alongside, e.g. "AAX (Aberdeen Angus cross)".
function breedFact(code) {
  const name = breedName(code);
  return `${esc(code)}${name ? ` <span class="muted">(${esc(name)})</span>` : ''}`;
}

function onFarmSections(animal, last, today) {
  return `
    <section class="tiles">
      <div class="tile"><span>Days on farm</span><strong>${fmtInt(daysBetween(animal.purchaseDate, today))}</strong></div>
      <div class="tile"><span>Last weight</span><strong>${fmtKg(last.kg)}</strong><small>${fmtDate(last.date)}</small></div>
      <div class="tile"><span>Gain so far</span><strong>${fmtAdg(adg(animal))}</strong></div>
    </section>

    <section class="card">
      <h2>Sale estimate</h2>
      <div class="inline-form" data-live-save>
        <label>Sale date
          <input id="est-date" type="date" min="${esc(last.date)}">
        </label>
        <label>Gain (kg/day)
          <input id="est-adg" type="number" inputmode="decimal" step="0.01">
        </label>
        <label>Price (€/kg)
          <input id="est-price" type="number" inputmode="decimal" min="0" step="0.05">
        </label>
      </div>
      <div id="est-out"></div>
    </section>`;
}

function wireEstimate(el, animal, animals, uid, today) {
  const dateEl = el.querySelector('#est-date');
  const adgEl = el.querySelector('#est-adg');
  const priceEl = el.querySelector('#est-price');
  const out = el.querySelector('#est-out');

  const expected = expectedAdg(animal, animals);
  const defaultPrice = expectedPricePerKg(animal, animals);

  // The gain and €/kg typed here belong to this animal only. They are typed a key at a time,
  // so the save waits for a pause.
  const unsaved = {};
  let saveTimer;
  const saveSoon = (field, value) => {
    unsaved[field] = value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      updateAnimal(uid, animal.id, { ...unsaved }).then(({ done }) => reportWrite(done));
      for (const key of Object.keys(unsaved)) delete unsaved[key];
    }, SAVE_DELAY);
  };

  // An animal lined up on the Selling tab is estimated for its sale date.
  const planned = animal.sellingDate && animal.sellingDate >= today ? animal.sellingDate : today;
  dateEl.value = est.date || planned;
  adgEl.value = est.adg || (expected.value !== null ? expected.value.toFixed(2) : '');
  priceEl.value = est.price || (defaultPrice !== null ? defaultPrice.toFixed(2) : '');

  const update = () => {
    const date = dateEl.value || today;
    const rate = Number.parseFloat(adgEl.value);
    const price = positive(priceEl.value);

    if (!Number.isFinite(rate)) {
      out.innerHTML = `<p class="hint">No sales history to estimate a gain rate from yet. Enter a kg/day figure above.</p>`;
      return;
    }
    const weight = projectedWeight(animal, rate, date);
    const value = price !== null ? weight * price : null;
    const source = est.adg ? SOURCE_TEXT.manual() : SOURCE_TEXT[expected.source]?.(animal, expected.count) ?? '';

    out.innerHTML = `
      <div class="tiles">
        <div class="tile"><span>Projected weight</span><strong>${fmtKg(weight)}</strong><small>${fmtDate(date)}</small></div>
        <div class="tile"><span>Estimated sale price</span><strong>${fmtMoney(value)}</strong></div>
        <div class="tile"><span>Estimated margin</span><strong class="${value !== null && value < animal.cost ? 'neg' : ''}">${fmtMoney(value !== null ? value - animal.cost : null)}</strong><small>over cost</small></div>
      </div>
      <p class="hint">${esc(source)}${price === null ? ' Enter a €/kg to see a sale price.' : ''}
        <a href="#calculator/${Math.round(weight)}">Price table for ${fmtKg(weight)}</a></p>`;
  };

  dateEl.addEventListener('input', () => {
    est.date = dateEl.value;
    update();
  });
  adgEl.addEventListener('input', () => {
    est.adg = adgEl.value;
    saveSoon('estAdg', positive(adgEl.value));
    update();
  });
  priceEl.addEventListener('input', () => {
    est.price = priceEl.value;
    saveSoon('estPrice', positive(priceEl.value));
    update();
  });
  update();
}

function saleResult(animal) {
  const s = saleStats(animal);
  return `
    <section class="card">
      <div class="card-head">
        <h2>Sale result</h2>
        <button class="btn small" type="button" id="undo-sale">Undo sale</button>
      </div>
      <div class="tiles">
        <div class="tile"><span>Sold</span><strong>${fmtMoney(animal.sale.price)}</strong><small>${fmtDate(animal.sale.date)}</small></div>
        <div class="tile"><span>Sale weight</span><strong>${fmtKg(animal.sale.weight)}</strong><small>${fmtPrice(s.pricePerKg)}/kg</small></div>
        <div class="tile"><span>Profit</span><strong class="${s.profit < 0 ? 'neg' : 'pos'}">${fmtMoney(s.profit)}</strong><small>${fmtPrice(s.profitPerDay)}/day</small></div>
        <div class="tile"><span>Gain</span><strong>${fmtAdg(s.adg)}</strong><small>${fmtKg(s.gain)} in ${fmtInt(s.days)} days</small></div>
      </div>
    </section>`;
}

function weightHistory(animal) {
  const points = [
    { date: animal.purchaseDate, kg: animal.purchaseWeight, label: 'Purchase' },
    ...(animal.weighIns ?? []).map((w) => ({ ...w, label: 'Weigh-in', removable: !animal.sale })),
    ...(animal.sale ? [{ date: animal.sale.date, kg: animal.sale.weight, label: 'Sale' }] : []),
  ];
  return `
    <table class="history">
      <thead><tr><th>Date</th><th class="num">Weight</th><th class="num">Gain</th><th></th></tr></thead>
      <tbody>
        ${points.map((p, i) => {
          const prev = points[i - 1];
          const days = prev ? daysBetween(prev.date, p.date) : 0;
          return `
          <tr>
            <td>${fmtDate(p.date)}<small class="muted">${p.label}</small></td>
            <td class="num">${fmtKg(p.kg)}</td>
            <td class="num">${days > 0 ? fmtAdg((p.kg - prev.kg) / days) : '–'}</td>
            <td class="num">${p.removable ? `<button class="btn small icon" type="button" data-delete-weigh="${esc(p.date)}" aria-label="Remove weigh-in from ${fmtDate(p.date)}">✕</button>` : ''}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}
