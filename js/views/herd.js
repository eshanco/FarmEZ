import { adg, daysBetween, expectedAdg, latestWeight, projectedWeight, recentPricePerKg, saleStats } from '../calc.js';
import { breedName, breedOptions, toBreedCode } from '../breeds.js';
import { addAnimal, updateAnimal } from '../db.js';
import { getSetting } from '../settings.js';
import {
  esc, fmtAdg, fmtDate, fmtInt, fmtKg, fmtMoney, fmtPrice, positive, reportWrite, showError, todayISO,
} from '../util.js';

let tab = 'farm';
let query = '';
// Sale date chosen on the Selling tab this session; '' means not chosen yet.
let sellDate = '';
let sellDateTimer;

// An animal is lined up for sale when it carries a sellingDate and has not been sold.
const isSelling = (a) => !a.sale && Boolean(a.sellingDate);
const byTag = (x, y) => x.tag.localeCompare(y.tag, undefined, { numeric: true });

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

function farmList(onFarm, all) {
  if (!onFarm.length) {
    return `<p class="empty">No animals on the farm yet. <a href="#new">Add the first one</a>.</p>`;
  }
  const today = todayISO();
  const price = getSetting('pricePerKg') ?? recentPricePerKg(all);
  const manualAdg = getSetting('manualAdg');

  const rows = onFarm
    .map((a) => {
      const exp = expectedAdg(a, all, manualAdg);
      const weight = exp.value !== null ? projectedWeight(a, exp.value, today) : latestWeight(a).kg;
      return { a, exp, weight, value: price !== null ? weight * price : null };
    })
    .sort((x, y) => byTag(x.a, y.a));
  const shown = rows.filter((r) => matches(r.a));
  if (!shown.length) return `<p class="empty">No animals match “${esc(query)}”.</p>`;

  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const summary = price !== null
    ? `Estimated herd value today <strong>${fmtMoney(total)}</strong> at ${fmtPrice(price)}/kg`
    : 'Enter a €/kg on any animal to see estimated values.';

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
    rowsEl.innerHTML = sellingRows(selling, state.animals, saleDate());
    rowsEl.querySelectorAll('[data-unsell]').forEach((btn) =>
      btn.addEventListener('click', () => save(btn.dataset.unsell, { sellingDate: null })),
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

function sellingRows(selling, all, date) {
  if (!selling.length) {
    return `<p class="empty">No animals lined up for sale. Press <strong>Add from herd</strong> to pick the ones you are selling.</p>`;
  }
  const price = getSetting('pricePerKg') ?? recentPricePerKg(all);
  const manualAdg = getSetting('manualAdg');
  const rows = selling
    .map((a) => {
      const exp = expectedAdg(a, all, manualAdg);
      const weight = exp.value !== null ? projectedWeight(a, exp.value, date) : latestWeight(a).kg;
      const value = price !== null ? weight * price : null;
      return { a, weight, value, margin: value !== null ? value - a.cost : null };
    })
    .sort((x, y) => byTag(x.a, y.a));
  const shown = rows.filter((r) => matches(r.a));
  if (!shown.length) return `<p class="empty">No animals match “${esc(query)}”.</p>`;

  const sum = (key) => rows.reduce((total, r) => total + (r[key] ?? 0), 0);
  const summary = price !== null
    ? `${rows.length} to sell on ${fmtDate(date)}: estimated value <strong>${fmtMoney(sum('value'))}</strong>, margin <strong>${fmtMoney(sum('margin'))}</strong> at ${fmtPrice(price)}/kg`
    : 'Enter a €/kg on any animal to see estimated values.';

  return `
    <p class="summary">${summary}</p>
    <table class="cards">
      <thead><tr>
        <th>Tag</th><th>Breed</th><th class="num">Est. weight</th>
        <th class="num">Est. value</th><th class="num">Est. margin</th><th></th>
      </tr></thead>
      <tbody>
        ${shown.map(({ a, weight, value, margin }) => `
          <tr>
            <td class="title"><a class="row-link" href="#animal/${esc(a.id)}">${esc(a.tag)}</a></td>
            <td data-label="Breed">${esc(breedLabel(a))}</td>
            <td class="num" data-label="Est. weight">${fmtKg(weight)}</td>
            <td class="num" data-label="Est. value">${fmtMoney(value)}</td>
            <td class="num ${margin !== null && margin < 0 ? 'neg' : ''}" data-label="Est. margin">${fmtMoney(margin)}</td>
            <td class="num row-action"><button class="btn small" type="button" data-unsell="${esc(a.id)}" aria-label="Remove ${esc(a.tag)} from selling">Remove</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function soldList(sold) {
  if (!sold.length) return `<p class="empty">No sales recorded yet. Open an animal to record its sale.</p>`;
  const shown = sold.filter(matches).sort((x, y) => (x.sale.date < y.sale.date ? 1 : -1));
  if (!shown.length) return `<p class="empty">No animals match “${esc(query)}”.</p>`;

  return `
    <table class="cards">
      <thead><tr>
        <th>Tag</th><th>Breed</th><th>Sold</th><th class="num">Days on farm</th>
        <th class="num">Gain</th><th class="num">Price</th><th class="num">€/kg</th><th class="num">Profit</th>
      </tr></thead>
      <tbody>
        ${shown.map((a) => {
          const s = saleStats(a);
          return `
          <tr>
            <td class="title"><a class="row-link" href="#animal/${esc(a.id)}">${esc(a.tag)}</a></td>
            <td data-label="Breed">${esc(breedLabel(a))}</td>
            <td data-label="Sold">${fmtDate(a.sale.date)}</td>
            <td class="num" data-label="Days on farm">${fmtInt(s.days)}</td>
            <td class="num" data-label="Gain">${fmtAdg(adg(a))}</td>
            <td class="num" data-label="Price">${fmtMoney(a.sale.price)}</td>
            <td class="num" data-label="€/kg">${fmtPrice(s.pricePerKg)}</td>
            <td class="num ${s.profit < 0 ? 'neg' : 'pos'}" data-label="Profit">${fmtMoney(s.profit)}</td>
          </tr>`;
        }).join('')}
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
      <datalist id="breeds">${breeds.map((b) => `<option value="${esc(b)}">${esc(breedName(b))}</option>`).join('')}</datalist>
      <p class="form-error" role="alert" hidden></p>
      <div class="actions">
        <button class="btn primary" type="submit">${existing ? 'Save changes' : 'Add animal'}</button>
        <a class="btn" href="${back}">Cancel</a>
      </div>
    </form>`;

  const form = el.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const data = {
      tag: f.tag.trim().toUpperCase(),
      dob: f.dob,
      breed: toBreedCode(f.breed),
      damBreed: toBreedCode(f.damBreed),
      purchaseDate: f.purchaseDate,
      purchaseWeight: positive(f.purchaseWeight),
      cost: positive(f.cost),
    };

    const firstLater = [...(existing?.weighIns ?? []).map((w) => w.date), existing?.sale?.date]
      .filter(Boolean)
      .sort()[0];
    let error = null;
    if (!data.tag || !data.dob || !data.breed || !data.damBreed || !data.purchaseDate) error = 'Fill in every field.';
    else if (data.purchaseWeight === null) error = 'Enter the weight at purchase in kg.';
    else if (data.cost === null) error = 'Enter the cost in euro.';
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
