import { adg, groupStats, saleStats } from '../calc.js';
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
// Purchase year the page is limited to, or 'all'.
let year = 'all';

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
  const animals = year === 'all' ? state.animals : state.animals.filter((a) => boughtIn(a) === year);
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
    </div>
    <section class="tiles">
      <div class="tile"><span>Animals sold</span><strong>${sold.length}</strong></div>
      <div class="tile"><span>Avg gain</span><strong>${fmtAdg(mean(stats.map((x) => x.s.adg)))}</strong></div>
      <div class="tile"><span>Avg price</span><strong>${fmtPrice(mean(stats.map((x) => x.s.pricePerKg)))}/kg</strong></div>
      <div class="tile"><span>Avg profit</span><strong>${fmtMoney(mean(stats.map((x) => x.s.profit)))}</strong></div>
    </section>

    ${locationGain(animals)}

    <label class="sort-select">Sort groups by
      <select id="sort-by">
        ${COLUMNS.map((c) => `<option value="${c.key}" ${c.key === sortKey ? 'selected' : ''}>${c.label}</option>`).join('')}
      </select>
    </label>

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

  const groupsEl = el.querySelector('#groups');
  // Location is optional, so its table only appears once a sold animal has one.
  const byLocation = sold.some((a) => a.location) ? [['By location', (a) => a.location || 'No location']] : [];
  const draw = () => {
    groupsEl.innerHTML = [
      ['By breed', (a) => a.breed],
      ['By dam breed', (a) => a.damBreed],
      ['By breed × dam breed', (a) => `${a.breed} × ${a.damBreed}`],
      ...byLocation,
    ].map(([title, keyFn]) => groupTable(title, groupStats(animals, keyFn))).join('');
    groupsEl.querySelectorAll('[data-sort]').forEach((btn) =>
      btn.addEventListener('click', () => {
        sortKey = btn.dataset.sort;
        el.querySelector('#sort-by').value = sortKey;
        draw();
      }),
    );
  };
  el.querySelector('#sort-by').addEventListener('change', (e) => {
    sortKey = e.target.value;
    draw();
  });
  draw();
}

// Average daily gain per location, best first, over every animal with a known gain.
function locationGain(animals) {
  const groups = new Map();
  for (const a of animals) {
    const gain = adg(a);
    if (gain === null) continue;
    const label = (a.location ?? '').trim() || 'No location';
    const key = label.toLowerCase();
    if (!groups.has(key)) groups.set(key, { label, gains: [] });
    groups.get(key).gains.push(gain);
  }
  const rows = [...groups.values()]
    .map((g) => ({ label: g.label, count: g.gains.length, gain: mean(g.gains) }))
    .sort((x, y) => y.gain - x.gain);
  const located = rows.some((r) => r.label !== 'No location');

  return `
    <section class="card">
      <h2>Weight gain by location</h2>
      ${located ? `
      <table class="cards">
        <thead><tr><th>Location</th><th class="num">Animals</th><th class="num">Avg gain/day</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td class="title">${esc(r.label)}</td>
              <td class="num" data-label="Animals">${fmtInt(r.count)}</td>
              <td class="num" data-label="Avg gain/day">${fmtAdg(r.gain)}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p class="hint">Give your sold animals a location (Edit on the animal\'s page) to compare weight gain here.</p>'}
    </section>`;
}

function groupTable(title, groups) {
  const rows = [...groups].sort((a, b) => (b[sortKey] ?? -Infinity) - (a[sortKey] ?? -Infinity));
  return `
    <section class="card">
      <h2>${title}</h2>
      <table class="cards">
        <thead><tr>
          <th>Group</th>
          ${COLUMNS.map((c) => `<th class="num" ${c.key === sortKey ? 'aria-sort="descending"' : ''}><button type="button" data-sort="${c.key}">${c.label}</button></th>`).join('')}
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
