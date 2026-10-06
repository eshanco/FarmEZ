import {
  adg, daysBetween, expectedAdg, expectedPricePerKg, latestWeight, projectedWeight, saleStats,
} from '../calc.js';
import { breedName, breedOptions, toBreedCode } from '../breeds.js';
import { addAnimal, updateAnimal } from '../db.js';
import {
  esc, fmtAdg, fmtDate, fmtInt, fmtKg, fmtMoney, fmtPrice, positive, reportWrite, showError, todayISO,
} from '../util.js';

let tab = 'farm';
let query = '';
// Sale date chosen on the Selling tab this session; '' means not chosen yet.
let sellDate = '';
let sellDateTimer;
// Sale year the Sold tab is limited to, or 'all'. Insights groups by purchase year instead.
let soldYear = 'all';
// Column and direction the Sold table is sorted by; newest sale first to begin with.
let soldSort = { key: 'date', dir: 'desc' };
// Whether the rest-of-herd table on the Selling tab is expanded.
let restOpen = false;

// An animal is lined up for sale when it carries a sellingDate and has not been sold.
const isSelling = (a) => !a.sale && Boolean(a.sellingDate);
const byTag = (x, y) => x.tag.localeCompare(y.tag, undefined, { numeric: true });

// Option value for typing a new location instead of picking one.
const NEW_LOCATION = '__new__';

// Locations already given to an animal, one spelling each, in alphabetical order.
function locationsOf(animals) {
  const byKey = new Map();
  for (const a of animals) {
    const name = (a.location ?? '').trim();
    if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  }
  return [...byKey.values()].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
}

const breedLabel = (a) => (a.damBreed ? `${a.breed} × ${a.damBreed}` : a.breed);

export function renderHerd(el, { state }) {
  const onFarm = state.animals.filter((a) => !a.sale);
  const selling = onFarm.filter(isSelling);
  const sold = state.animals.filter((a) => a.sale);

  el.innerHTML = `
    <div class="page-head">
      <h1>Herd</h1>
      <a class="btn primary" href="#new">Add animal</a>
    </div>
    <div class="toolbar">
      <div class="tabs">
        <button type="button" data-tab="farm" aria-pressed="${tab === 'farm'}">On farm (${onFarm.length})</button>
        <button type="button" data-tab="selling" aria-pressed="${tab === 'selling'}">Selling (${selling.length})</button>
        <button type="button" data-tab="sold" aria-pressed="${tab === 'sold'}">Sold (${sold.length})</button>
      </div>
      <input type="search" id="herd-search" placeholder="Search tag or breed" aria-label="Search tag or breed" value="${esc(query)}">
    </div>
    <div id="herd-list"></div>`;

  const list = el.querySelector('#herd-list');
  const draw = () => {
    if (tab === 'selling') renderSelling(list, state, onFarm, selling);
    else list.innerHTML = tab === 'farm' ? farmList(onFarm, state.animals) : soldList(sold);
    list.querySelectorAll('[data-sold-year]').forEach((btn) =>
      btn.addEventListener('click', () => {
        soldYear = btn.dataset.soldYear;
        draw();
      }),
    );
    // Picking the column already sorted on flips the direction; a new column starts highest first.
    list.querySelectorAll('[data-sold-sort]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const key = btn.dataset.soldSort;
        soldSort = { key, dir: key === soldSort.key && soldSort.dir === 'desc' ? 'asc' : 'desc' };
        draw();
      }),
    );
    list.querySelector('#sold-sort-by')?.addEventListener('change', (e) => {
      soldSort = { key: e.target.value, dir: 'desc' };
      draw();
    });
    list.querySelector('#sold-sort-dir')?.addEventListener('click', () => {
      soldSort = { ...soldSort, dir: soldSort.dir === 'asc' ? 'desc' : 'asc' };
      draw();
    });
  };
  draw();

  el.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      draw();
    }),
  );
  el.querySelector('#herd-search').addEventListener('input', (e) => {
    query = e.target.value;
    draw();
  });
}

function matches(a) {
  const q = query.trim().toLowerCase();
  return !q || `${a.tag} ${a.breed} ${a.damBreed} ${breedName(a.breed)} ${breedName(a.damBreed)}`.toLowerCase().includes(q);
}

// Each animal is valued at its own €/kg, so totals only cover the animals that have one.
function pricedSummary(rows, text) {
  const priced = rows.filter((r) => r.value !== null).length;
  if (!priced) return 'Enter a €/kg on an animal to see its estimated value.';
  return priced < rows.length ? `${text} for the ${priced} of ${rows.length} with a €/kg` : text;
}

function farmList(onFarm, all) {
  if (!onFarm.length) {
    return `<p class="empty">No animals on the farm yet. <a href="#new">Add the first one</a>.</p>`;
  }
  const today = todayISO();

  const rows = onFarm
    .map((a) => {
      const exp = expectedAdg(a, all);
      const price = expectedPricePerKg(a, all);
      const weight = exp.value !== null ? projectedWeight(a, exp.value, today) : latestWeight(a).kg;
      return { a, exp, weight, value: price !== null ? weight * price : null };
    })
    .sort((x, y) => byTag(x.a, y.a));
  const shown = rows.filter((r) => matches(r.a));
  if (!shown.length) return `<p class="empty">No animals match “${esc(query)}”.</p>`;

  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const summary = pricedSummary(rows, `Estimated herd value today <strong>${fmtMoney(total)}</strong>`);

  return `
    <p class="summary">${summary}</p>
    <table class="cards">
      <thead><tr>
        <th>Tag</th><th>Breed</th><th class="num">Days on farm</th><th class="num">Last weight</th>
        <th class="num">Gain</th><th class="num">Est. weight today</th><th class="num">Est. value</th>
      </tr></thead>
      <tbody>
        ${shown.map(({ a, exp, weight, value }) => `
          <tr>
            <td class="title"><a class="row-link" href="#animal/${esc(a.id)}">${esc(a.tag)}</a>${isSelling(a) ? ' <span class="badge">Selling</span>' : ''}</td>
            <td data-label="Breed">${esc(breedLabel(a))}</td>
            <td class="num" data-label="Days on farm">${fmtInt(daysBetween(a.purchaseDate, today))}</td>
            <td class="num" data-label="Last weight">${fmtKg(latestWeight(a).kg)}</td>
            <td class="num" data-label="Gain">${fmtAdg(exp.value)}${exp.value !== null && exp.source !== 'own' ? ' <span class="muted">est.</span>' : ''}</td>
            <td class="num" data-label="Est. weight today">${fmtKg(weight)}</td>
            <td class="num" data-label="Est. value">${fmtMoney(value)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// Animals lined up for the next sale, with estimates for the chosen sale date.
function renderSelling(list, state, onFarm, selling) {
  const today = todayISO();
  const uid = state.user.uid;
  // The date is saved on each selling animal, so it carries over to another device.
  const saved = selling.map((a) => a.sellingDate).sort().at(-1);
  const startDate = sellDate || (saved && saved >= today ? saved : today);
  const candidates = onFarm.filter((a) => !isSelling(a)).sort(byTag);

  list.innerHTML = `
    <div class="selling-bar">
      <label>Sale date
        <input type="date" id="sell-date" min="${today}" value="${startDate}">
      </label>
      <button class="btn" type="button" id="pick-open">Add from herd</button>
    </div>
    <div id="selling-rows"></div>
    <dialog id="picker" aria-labelledby="picker-title">
      <h2 id="picker-title">Add animals to sell</h2>
      ${candidates.length ? `
      <input type="search" id="pick-filter" placeholder="Filter by tag or breed" aria-label="Filter by tag or breed">
      <div class="pick-list">
        ${candidates.map((a) => `
          <label class="pick" data-text="${esc(`${a.tag} ${a.breed} ${a.damBreed}`.toLowerCase())}">
            <input type="checkbox" value="${esc(a.id)}">
            <span><strong>${esc(a.tag)}</strong> <span class="muted">${esc(breedLabel(a))}</span></span>
          </label>`).join('')}
      </div>` : '<p class="hint">Every animal on the farm is already in the selling list.</p>'}
      <div class="actions">
        ${candidates.length ? '<button class="btn primary" type="button" id="pick-add">Add selected</button>' : ''}
        <button class="btn" type="button" id="pick-cancel">Cancel</button>
      </div>
    </dialog>`;

  const dateEl = list.querySelector('#sell-date');
  const rowsEl = list.querySelector('#selling-rows');
  const picker = list.querySelector('#picker');
  const saleDate = () => dateEl.value || today;
  const save = async (id, data) => reportWrite((await updateAnimal(uid, id, data)).done);

  const drawRows = () => {
    rowsEl.innerHTML = sellingRows(selling, state.animals, saleDate()) + restRows(candidates, state.animals, saleDate());
    rowsEl.querySelector('#rest-herd')?.addEventListener('toggle', (e) => {
      restOpen = e.target.open;
    });
    rowsEl.querySelectorAll('[data-unsell]').forEach((btn) =>
      btn.addEventListener('click', () => save(btn.dataset.unsell, { sellingDate: null })),
    );
    rowsEl.querySelectorAll('[data-sell]').forEach((btn) =>
      btn.addEventListener('click', () => save(btn.dataset.sell, { sellingDate: saleDate() })),
    );
  };
  drawRows();

  dateEl.addEventListener('change', () => {
    sellDate = dateEl.value;
    drawRows();
    // Saved after a pause so the page is not redrawn while the date is still being typed.
    clearTimeout(sellDateTimer);
    const date = saleDate();
    sellDateTimer = setTimeout(() => {
      selling.filter((a) => a.sellingDate !== date).forEach((a) => save(a.id, { sellingDate: date }));
    }, 1000);
  });

  list.querySelector('#pick-open').addEventListener('click', () => picker.showModal());
  list.querySelector('#pick-cancel').addEventListener('click', () => picker.close());
  list.querySelector('#pick-filter')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    picker.querySelectorAll('.pick').forEach((row) => {
      row.hidden = Boolean(q) && !row.dataset.text.includes(q);
    });
  });
  list.querySelector('#pick-add')?.addEventListener('click', () => {
    const ids = [...picker.querySelectorAll('.pick input:checked')].map((box) => box.value);
    picker.close();
    ids.forEach((id) => save(id, { sellingDate: saleDate() }));
  });
}

// Weight, value and margin of each animal if it were sold on `date`.
function saleEstimates(animals, all, date) {
  return animals
    .map((a) => {
      const exp = expectedAdg(a, all);
      const price = expectedPricePerKg(a, all);
      const weight = exp.value !== null ? projectedWeight(a, exp.value, date) : latestWeight(a).kg;
      const value = price !== null ? weight * price : null;
      return { a, weight, price, value, margin: value !== null ? value - a.cost : null };
    })
    .sort((x, y) => byTag(x.a, y.a));
}

const sumOf = (rows, key) => rows.reduce((total, r) => total + (r[key] ?? 0), 0);

// `action` builds the button cell for an animal.
function estimateTable(shown, action) {
  return `
    <table class="cards">
      <thead><tr>
        <th>Tag</th><th>Breed</th><th class="num">Est. weight</th><th class="num">Est. €/kg</th>
        <th class="num">Est. value</th><th class="num">Est. margin</th><th></th>
      </tr></thead>
      <tbody>
        ${shown.map(({ a, weight, price, value, margin }) => `
          <tr>
            <td class="title"><a class="row-link" href="#animal/${esc(a.id)}">${esc(a.tag)}</a></td>
            <td data-label="Breed">${esc(breedLabel(a))}</td>
            <td class="num" data-label="Est. weight">${fmtKg(weight)}</td>
            <td class="num" data-label="Est. €/kg">${fmtPrice(price)}</td>
            <td class="num" data-label="Est. value">${fmtMoney(value)}</td>
            <td class="num ${margin !== null && margin < 0 ? 'neg' : ''}" data-label="Est. margin">${fmtMoney(margin)}</td>
            ${action(a)}
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function sellingRows(selling, all, date) {
  if (!selling.length) {
    return `<p class="empty">No animals lined up for sale. Press <strong>Add from herd</strong> to pick the ones you are selling.</p>`;
  }
  const rows = saleEstimates(selling, all, date);
  const shown = rows.filter((r) => matches(r.a));
  if (!shown.length) return `<p class="empty">No animals match “${esc(query)}”.</p>`;

  const summary = pricedSummary(
    rows,
    `${rows.length} to sell on ${fmtDate(date)}: estimated value <strong>${fmtMoney(sumOf(rows, 'value'))}</strong>, margin <strong>${fmtMoney(sumOf(rows, 'margin'))}</strong>`,
  );

  return `
    <p class="summary">${summary}</p>
    ${estimateTable(shown, (a) => `<td class="num row-action"><button class="btn small" type="button" data-unsell="${esc(a.id)}" aria-label="Remove ${esc(a.tag)} from selling">Remove</button></td>`)}`;
}

// The animals staying on the farm, collapsed until opened, with the same estimates for the sale date.
function restRows(rest, all, date) {
  if (!rest.length) return '';
  const rows = saleEstimates(rest, all, date);
  const shown = rows.filter((r) => matches(r.a));
  const summary = pricedSummary(
    rows,
    `${rows.length} not being sold: estimated value on ${fmtDate(date)} <strong>${fmtMoney(sumOf(rows, 'value'))}</strong>, margin <strong>${fmtMoney(sumOf(rows, 'margin'))}</strong>`,
  );

  return `
    <details class="rest" id="rest-herd" ${restOpen ? 'open' : ''}>
      <summary>Rest of herd (${rows.length})</summary>
      ${shown.length ? `<p class="summary">${summary}</p>${estimateTable(shown, (a) => `<td class="num row-action"><button class="btn small" type="button" data-sell="${esc(a.id)}" aria-label="Add ${esc(a.tag)} to selling">Add</button></td>`)}` : `<p class="empty">No animals match “${esc(query)}”.</p>`}
    </details>`;
}

const SOLD_COLUMNS = [
  { key: 'date', label: 'Sold' },
  { key: 'days', label: 'Days on farm', num: true },
  { key: 'gain', label: 'Gain', num: true },
  { key: 'price', label: 'Price', num: true },
  { key: 'pricePerKg', label: '€/kg', num: true },
  { key: 'profit', label: 'Profit', num: true },
];

function soldList(sold) {
  if (!sold.length) return `<p class="empty">No sales recorded yet. Open an animal to record its sale.</p>`;
  const soldIn = (a) => a.sale.date.slice(0, 4);
  const years = [...new Set(sold.map(soldIn))].sort().reverse();
  if (!years.includes(soldYear)) soldYear = 'all';
  const yearTabs = `
    <div class="toolbar">
      <div class="tabs">
        ${['all', ...years].map((y) => `<button type="button" data-sold-year="${y}" aria-pressed="${y === soldYear}">${y === 'all' ? 'All' : y}</button>`).join('')}
      </div>
    </div>`;
  const sign = soldSort.dir === 'asc' ? 1 : -1;
  const shown = sold
    .filter((a) => (soldYear === 'all' || soldIn(a) === soldYear) && matches(a))
    .map((a) => {
      const s = saleStats(a);
      return { a, date: a.sale.date, days: s.days, gain: adg(a), price: a.sale.price, pricePerKg: s.pricePerKg, profit: s.profit };
    })
    // Rows with no figure in the sorted column stay at the bottom either way.
    .sort((x, y) => {
      const [p, q] = [x[soldSort.key], y[soldSort.key]];
      if (p === null || q === null) return (p === null) - (q === null);
      return sign * (p < q ? -1 : p > q ? 1 : 0);
    });
  if (!shown.length) return `${yearTabs}<p class="empty">No animals match “${esc(query)}”.</p>`;

  return `
    ${yearTabs}
    <div class="sort-select">
      <label>Sort by
        <select id="sold-sort-by">
          ${SOLD_COLUMNS.map((c) => `<option value="${c.key}" ${c.key === soldSort.key ? 'selected' : ''}>${c.label}</option>`).join('')}
        </select>
      </label>
      <button class="btn" type="button" id="sold-sort-dir">${soldSort.dir === 'asc' ? 'Lowest first' : 'Highest first'}</button>
    </div>
    <table class="cards">
      <thead><tr>
        <th>Tag</th><th>Breed</th>
        ${SOLD_COLUMNS.map((c) => `<th ${c.num ? 'class="num"' : ''} ${c.key === soldSort.key ? `aria-sort="${soldSort.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sold-sort="${c.key}">${c.label}</button></th>`).join('')}
      </tr></thead>
      <tbody>
        ${shown.map(({ a, date, days, gain, price, pricePerKg, profit }) => `
          <tr>
            <td class="title"><a class="row-link" href="#animal/${esc(a.id)}">${esc(a.tag)}</a></td>
            <td data-label="Breed">${esc(breedLabel(a))}</td>
            <td data-label="Sold">${fmtDate(date)}</td>
            <td class="num" data-label="Days on farm">${fmtInt(days)}</td>
            <td class="num" data-label="Gain">${fmtAdg(gain)}</td>
            <td class="num" data-label="Price">${fmtMoney(price)}</td>
            <td class="num" data-label="€/kg">${fmtPrice(pricePerKg)}</td>
            <td class="num ${profit < 0 ? 'neg' : 'pos'}" data-label="Profit">${fmtMoney(profit)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// Add form, or edit form when `arg` is an animal id.
export function renderAnimalForm(el, { state, arg }) {
  const existing = arg ? state.animals.find((a) => a.id === arg) : null;
  if (arg && !existing) {
    el.innerHTML = `<p class="empty">That animal no longer exists. <a href="#herd">Back to herd</a>.</p>`;
    return;
  }
  const v = existing ?? { purchaseDate: todayISO() };
  // Card codes, plus any other codes already used in the herd.
  const used = state.animals.flatMap((a) => [a.breed, a.damBreed]).filter(Boolean).sort();
  const breeds = [...new Set([...breedOptions(), ...used])];
  const locations = locationsOf(state.animals);
  const back = existing ? `#animal/${existing.id}` : '#herd';

  el.innerHTML = `
    <div class="page-head"><h1>${existing ? `Edit ${esc(existing.tag)}` : 'Add animal'}</h1></div>
    <form class="card form-grid" novalidate>
      <label>Tag number
        <input name="tag" required autocomplete="off" autocapitalize="characters" value="${esc(v.tag)}">
      </label>
      <label>Date of birth
        <input name="dob" type="date" required max="${todayISO()}" value="${esc(v.dob)}">
      </label>
      <label>Breed
        <input name="breed" required list="breeds" autocomplete="off" autocapitalize="characters" placeholder="Card code, e.g. AAX" value="${esc(v.breed)}">
      </label>
      <label>Dam breed
        <input name="damBreed" required list="breeds" autocomplete="off" autocapitalize="characters" placeholder="Card code, e.g. FR" value="${esc(v.damBreed)}">
      </label>
      <label>Purchase date
        <input name="purchaseDate" type="date" required max="${todayISO()}" value="${esc(v.purchaseDate)}">
      </label>
      <label>Weight at purchase (kg)
        <input name="purchaseWeight" type="number" inputmode="decimal" min="1" step="0.5" required value="${esc(v.purchaseWeight)}">
      </label>
      <label>Cost (€)
        <input name="cost" type="number" inputmode="decimal" min="0" step="0.01" required value="${esc(v.cost)}">
      </label>
      <label>Location <span class="muted">(optional)</span>
        <select name="location">
          <option value="">No location</option>
          ${locations.map((l) => `<option value="${esc(l)}" ${l === v.location ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          <option value="${NEW_LOCATION}">New location…</option>
        </select>
      </label>
      <label id="new-location" hidden>New location name
        <input name="newLocation" autocomplete="off" placeholder="e.g. Home shed">
      </label>
      <div class="field" role="group" aria-label="Wintered">Wintered <span class="muted">(optional)</span>
        <div class="tabs">
          <button type="button" data-wintered="" aria-pressed="${!v.wintered}">No</button>
          <button type="button" data-wintered="yes" aria-pressed="${Boolean(v.wintered)}">Yes</button>
        </div>
        <input type="hidden" name="wintered" value="${v.wintered ? 'yes' : ''}">
      </div>
      <datalist id="breeds">${breeds.map((b) => `<option value="${esc(b)}">${esc(breedName(b))}</option>`).join('')}</datalist>
      <p class="form-error" role="alert" hidden></p>
      <div class="actions">
        <button class="btn primary" type="submit">${existing ? 'Save changes' : 'Add animal'}</button>
        <a class="btn" href="${back}">Cancel</a>
      </div>
    </form>`;

  const form = el.querySelector('form');
  form.elements.location.addEventListener('change', (e) => {
    const adding = e.target.value === NEW_LOCATION;
    form.querySelector('#new-location').hidden = !adding;
    if (adding) form.elements.newLocation.focus();
  });
  form.querySelectorAll('[data-wintered]').forEach((btn) =>
    btn.addEventListener('click', () => {
      form.elements.wintered.value = btn.dataset.wintered;
      form.querySelectorAll('[data-wintered]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    }),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const addingLocation = f.location === NEW_LOCATION;
    const typed = f.newLocation.trim();
    // A new name that only differs in capitals from an existing location reuses that one.
    // Not named `location`: that would hide window.location, which the redirect below needs.
    const place = addingLocation
      ? locations.find((l) => l.toLowerCase() === typed.toLowerCase()) ?? typed
      : f.location;
    const data = {
      tag: f.tag.trim().toUpperCase(),
      dob: f.dob,
      breed: toBreedCode(f.breed),
      damBreed: toBreedCode(f.damBreed),
      purchaseDate: f.purchaseDate,
      purchaseWeight: positive(f.purchaseWeight),
      cost: positive(f.cost),
      location: place,
      wintered: f.wintered === 'yes',
    };

    const firstLater = [...(existing?.weighIns ?? []).map((w) => w.date), existing?.sale?.date]
      .filter(Boolean)
      .sort()[0];
    // A typed date that does not exist (e.g. 29 February in a non-leap year) reads back as empty.
    const badDate = ['dob', 'purchaseDate'].find((name) => form.elements[name].validity.badInput);
    let error = null;
    if (badDate) error = `${badDate === 'dob' ? 'Date of birth' : 'Purchase date'} is not a real date. Check the day and month.`;
    else if (!data.tag ||!data.dob || !data.breed || !data.damBreed || !data.purchaseDate) error = 'Fill in every field.';
    else if (data.purchaseWeight === null) error = 'Enter the weight at purchase in kg.';
    else if (data.cost === null) error = 'Enter the cost in euro.';
    else if (addingLocation && !place) error = 'Enter a name for the new location, or choose No location.';
    else if (data.dob > data.purchaseDate) error = 'Date of birth cannot be after the purchase date.';
    else if (data.purchaseDate > todayISO()) error = 'Purchase date cannot be in the future.';
    else if (firstLater && data.purchaseDate > firstLater) error = `Purchase date cannot be after a recorded weight (${fmtDate(firstLater)}).`;
    else if (state.animals.some((a) => a.id !== existing?.id && a.tag.toUpperCase() === data.tag)) error = `Tag ${data.tag} is already in the herd.`;
    showError(form, error);
    if (error) return;

    if (existing) {
      const { done } = await updateAnimal(state.user.uid, existing.id, data);
      reportWrite(done);
      location.hash = `#animal/${existing.id}`;
    } else {
      const { id, done } = await addAnimal(state.user.uid, { ...data, weighIns: [], sale: null });
      reportWrite(done);
      location.hash = `#animal/${id}`;
    }
  });
}
