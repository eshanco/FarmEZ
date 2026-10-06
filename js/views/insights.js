import { groupStats, saleStats } from '../calc.js';
import { esc, fmtAdg, fmtInt, fmtMoney, fmtPrice } from '../util.js';

const COLUMNS = [
  { key: 'count', label: 'Sold', fmt: fmtInt },
  { key: 'adg', label: 'Avg gain', fmt: fmtAdg },
  { key: 'days', label: 'Avg days', fmt: fmtInt },
  { key: 'pricePerKg', label: 'Avg €/kg', fmt: fmtPrice },
  { key: 'profit', label: 'Avg profit', fmt: fmtMoney },
  { key: 'profitPerDay', label: 'Profit/day', fmt: fmtPrice },
];

let sortKey = 'profitPerDay';
let sortDir = 'desc';
// Purchase year the page is limited to, or 'all'.
let year = 'all';
// 'all', 'no' (not wintered) or 'yes' (wintered).
let wintering = 'all';
const WINTERING = [['all', 'All'], ['no', 'Not wintered'], ['yes', 'Wintered']];

// Picking the column already sorted on flips the direction; a new column starts highest first.
const nextDir = (sameColumn, dir) => (sameColumn && dir === 'desc' ? 'asc' : 'desc');

// Sorts by a numeric column in the given direction, keeping rows with no figure at the bottom.
function sortRows(rows, key, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[key] === null || b[key] === null) return (a[key] === null) - (b[key] === null);
    return sign * (a[key] - b[key]);
  });
}

const sortHead = (key, label, active, dir) =>
  `<th class="num" ${active ? `aria-sort="${dir === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${key}">${label}</button></th>`;

const mean = (values) => {
  const nums = values.filter((v) => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
};

export function renderInsights(el, { state }) {
  const everSold = state.animals.filter((a) => a.sale);
  if (!everSold.length) {
    el.innerHTML = `
      <div class="page-head"><h1>Insights</h1></div>
      <p class="empty">Insights appear once you have recorded a sale. They compare breeds and locations on weight gain, price and profit.</p>`;
    return;
  }

  const boughtIn = (a) => a.purchaseDate.slice(0, 4);
  // Only years with a sold animal get a tab, since the figures come from sales.
  const years = [...new Set(everSold.map(boughtIn))].sort().reverse();
  if (!years.includes(year)) year = 'all';
  // The wintering tabs only appear once a sold animal has been marked as wintered.
  const anyWintered = everSold.some((a) => a.wintered);
  if (!anyWintered) wintering = 'all';
  const animals = state.animals.filter((a) =>
    (year === 'all' || boughtIn(a) === year)
    && (wintering === 'all' || Boolean(a.wintered) === (wintering === 'yes')));
  const sold = animals.filter((a) => a.sale);

  const stats = sold.map((a) => ({ a, s: saleStats(a) }));
  const ranked = stats.filter((x) => x.s.profitPerDay !== null).sort((x, y) => y.s.profitPerDay - x.s.profitPerDay);
  // Up to five each, never listing the same animal as both best and worst.
  const topN = Math.min(5, Math.floor(ranked.length / 2));

  el.innerHTML = `
    <div class="page-head"><h1>Insights</h1></div>
    <div class="toolbar">
      <div class="tabs">
        ${['all', ...years].map((y) => `<button type="button" data-year="${y}" aria-pressed="${y === year}">${y === 'all' ? 'All' : y}</button>`).join('')}
      </div>
      ${anyWintered ? `
      <div class="tabs">
        ${WINTERING.map(([key, label]) => `<button type="button" data-wintering="${key}" aria-pressed="${key === wintering}">${label}</button>`).join('')}
      </div>` : ''}
    </div>
    <section class="tiles">
      <div class="tile"><span>Animals sold</span><strong>${sold.length}</strong></div>
      <div class="tile"><span>Avg gain</span><strong>${fmtAdg(mean(stats.map((x) => x.s.adg)))}</strong></div>
      <div class="tile"><span>Avg price</span><strong>${fmtPrice(mean(stats.map((x) => x.s.pricePerKg)))}/kg</strong></div>
      <div class="tile"><span>Avg profit</span><strong>${fmtMoney(mean(stats.map((x) => x.s.profit)))}</strong></div>
    </section>

    <div class="sort-select">
      <label>Sort groups by
        <select id="sort-by">
          ${COLUMNS.map((c) => `<option value="${c.key}" ${c.key === sortKey ? 'selected' : ''}>${c.label}</option>`).join('')}
        </select>
      </label>
      <button class="btn" type="button" id="sort-dir"></button>
    </div>

    <div id="groups"></div>

    ${ranked.length >= 2 ? `
    <section class="card">
      <h2>Best and worst animals</h2>
      <p class="hint">Ranked by profit per day on the farm.</p>
      <div class="two-col">
        ${rankList('Best', ranked.slice(0, topN))}
        ${rankList('Worst', ranked.slice(-topN).reverse())}
      </div>
    </section>` : ''}`;

  el.querySelectorAll('[data-year]').forEach((btn) =>
    btn.addEventListener('click', () => {
      year = btn.dataset.year;
      renderInsights(el, { state });
    }),
  );

  el.querySelectorAll('[data-wintering]').forEach((btn) =>
    btn.addEventListener('click', () => {
      wintering = btn.dataset.wintering;
      renderInsights(el, { state });
    }),
  );

  const groupsEl = el.querySelector('#groups');
  // Wintered animals are left out of the location figures: a winter indoors skews them.
  const outdoor = animals.filter((a) => !a.wintered);
  const tables = [
    ['By breed', (a) => a.breed],
    ['By dam breed', (a) => a.damBreed],
    ['By breed × dam breed', (a) => `${a.breed} × ${a.damBreed}`],
  ];
  if (sold.some((a) => a.wintered) && sold.some((a) => !a.wintered)) {
    tables.push(['Wintered vs not wintered', (a) => (a.wintered ? 'Wintered' : 'Not wintered')]);
  }
  // Location is optional, so its table only appears once a sold animal has one.
  if (outdoor.some((a) => a.sale && a.location)) {
    tables.push([
      'By location',
      (a) => a.location || 'No location',
      outdoor,
      sold.some((a) => a.wintered) ? 'Wintered animals are not counted here.' : '',
    ]);
  }
  const dirBtn = el.querySelector('#sort-dir');
  const draw = () => {
    dirBtn.textContent = sortDir === 'asc' ? 'Lowest first' : 'Highest first';
    groupsEl.innerHTML = sold.length
      ? tables.map(([title, keyFn, from = animals, note = '']) => groupTable(title, groupStats(from, keyFn), note)).join('')
      : '<p class="empty">No sold animals match these filters.</p>';
    groupsEl.querySelectorAll('[data-sort]').forEach((btn) =>
      btn.addEventListener('click', () => {
        sortDir = nextDir(btn.dataset.sort === sortKey, sortDir);
        sortKey = btn.dataset.sort;
        el.querySelector('#sort-by').value = sortKey;
        draw();
      }),
    );
  };
  el.querySelector('#sort-by').addEventListener('change', (e) => {
    sortKey = e.target.value;
    sortDir = 'desc';
    draw();
  });
  dirBtn.addEventListener('click', () => {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    draw();
  });
  draw();
}

function groupTable(title, groups, note) {
  const rows = sortRows(groups, sortKey, sortDir);
  return `
    <section class="card">
      <h2>${title}</h2>
      ${note ? `<p class="hint lead">${note}</p>` : ''}
      <table class="cards">
        <thead><tr>
          <th>Group</th>
          ${COLUMNS.map((c) => sortHead(c.key, c.label, c.key === sortKey, sortDir)).join('')}
        </tr></thead>
        <tbody>
          ${rows.map((g) => `
            <tr>
              <td class="title">${esc(g.label)}</td>
              ${COLUMNS.map((c) => `<td class="num" data-label="${c.label}">${c.fmt(g[c.key])}</td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </section>`;
}

function rankList(title, items) {
  return `
    <div>
      <h3>${title}</h3>
      <ol class="rank">
        ${items.map(({ a, s }) => `
          <li>
            <a href="#animal/${esc(a.id)}">${esc(a.tag)}</a>
            <span class="muted">${esc(a.breed)} × ${esc(a.damBreed)}</span>
            <span class="num ${s.profitPerDay < 0 ? 'neg' : ''}">${fmtPrice(s.profitPerDay)}/day</span>
          </li>`).join('')}
      </ol>
    </div>`;
}
