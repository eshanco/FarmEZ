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

const mean = (values) => {
  const nums = values.filter((v) => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
};

export function renderInsights(el, { state }) {
  const sold = state.animals.filter((a) => a.sale);
  if (!sold.length) {
    el.innerHTML = `
      <div class="page-head"><h1>Insights</h1></div>
      <p class="empty">Insights appear once you have recorded a sale. They compare breeds on weight gain, price and profit.</p>`;
    return;
  }

  const stats = sold.map((a) => ({ a, s: saleStats(a) }));
  const ranked = stats.filter((x) => x.s.profitPerDay !== null).sort((x, y) => y.s.profitPerDay - x.s.profitPerDay);
  // Up to five each, never listing the same animal as both best and worst.
  const topN = Math.min(5, Math.floor(ranked.length / 2));

  el.innerHTML = `
    <div class="page-head"><h1>Insights</h1></div>
    <section class="tiles">
      <div class="tile"><span>Animals sold</span><strong>${sold.length}</strong></div>
      <div class="tile"><span>Avg gain</span><strong>${fmtAdg(mean(stats.map((x) => x.s.adg)))}</strong></div>
      <div class="tile"><span>Avg price</span><strong>${fmtPrice(mean(stats.map((x) => x.s.pricePerKg)))}/kg</strong></div>
      <div class="tile"><span>Avg profit</span><strong>${fmtMoney(mean(stats.map((x) => x.s.profit)))}</strong></div>
    </section>

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

  const groupsEl = el.querySelector('#groups');
  const draw = () => {
    groupsEl.innerHTML = [
      ['By breed', (a) => a.breed],
      ['By dam breed', (a) => a.damBreed],
      ['By breed × dam breed', (a) => `${a.breed} × ${a.damBreed}`],
    ].map(([title, keyFn]) => groupTable(title, groupStats(state.animals, keyFn))).join('');
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
