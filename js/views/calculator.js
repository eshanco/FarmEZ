import { priceTable } from '../calc.js';
import { fmtMoney, fmtPrice, positive } from '../util.js';

let lastWeight = '';

// `arg` is an optional weight in kg, e.g. #calculator/530.
export function renderCalculator(el, { arg }) {
  if (arg && positive(arg) !== null) lastWeight = String(positive(arg));

  el.innerHTML = `
    <div class="page-head"><h1>Price calculator</h1></div>
    <section class="card narrow">
      <label>Weight (kg)
        <input id="calc-weight" type="number" inputmode="decimal" min="1" step="1" placeholder="e.g. 530" value="${lastWeight}">
      </label>
      <div id="calc-out"></div>
    </section>`;

  const input = el.querySelector('#calc-weight');
  const out = el.querySelector('#calc-out');
  const draw = () => {
    const kg = positive(input.value);
    if (kg === null) {
      out.innerHTML = `<p class="hint">Enter a weight to see what it is worth from €3.00 to €7.00 per kg.</p>`;
      return;
    }
    out.innerHTML = `
      <table class="price-table">
        <thead><tr><th>€/kg</th><th class="num">${kg} kg is worth</th></tr></thead>
        <tbody>
          ${priceTable(kg).map((r) => `
            <tr class="${Number.isInteger(r.pricePerKg) ? 'whole' : ''}">
              <td>${fmtPrice(r.pricePerKg)}</td>
              <td class="num">${Number.isInteger(r.total) ? fmtMoney(r.total) : fmtPrice(r.total)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  };
  input.addEventListener('input', () => {
    lastWeight = input.value;
    draw();
  });
  draw();
}
