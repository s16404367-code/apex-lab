// APEX LAB — tiny DOM helpers (no framework; keeps the bundle zero-dependency).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export const fmtN = (v, d = 0) => (isFinite(v) ? v.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—');
export const fmtPct = (v, d = 1) => (isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(d) + '%' : '—');
export const fmtS = (v, d = 2) => (isFinite(v) ? v.toFixed(d) + ' s' : '—');

export function sliderRow({ label, min, max, step, value, unit, onInput, desc, precision = 2 }) {
  const num = h('input', { type: 'number', class: 'num-input', min, max, step, value: (+value).toFixed(precision === 0 ? 0 : Math.min(precision, 3)) });
  const range = h('input', { type: 'range', min, max, step, value });
  const valLabel = h('span', { class: 'param-val' }, (+value).toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : 2) + (unit ? ' ' + unit : ''));
  const apply = (v) => {
    const nv = Math.max(min, Math.min(max, parseFloat(v)));
    if (isNaN(nv)) return;
    valLabel.textContent = nv.toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : 2) + (unit ? ' ' + unit : '');
    onInput(nv);
  };
  range.addEventListener('input', () => { num.value = range.value; apply(range.value); });
  num.addEventListener('change', () => { range.value = num.value; apply(num.value); });
  const row = h('div', { class: 'param-row' + (desc ? ' has-desc' : '') },
    h('label', { class: 'param-label', title: desc || '' }, label),
    range, num, valLabel
  );
  row.update = (v) => {
    range.value = v; num.value = (+v).toFixed(precision === 0 ? 0 : Math.min(precision, 3));
    valLabel.textContent = (+v).toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : 2) + (unit ? ' ' + unit : '');
  };
  return row;
}

export function badge(text, kind = '') {
  return h('span', { class: 'badge ' + kind }, text);
}

export function panel(title, ...children) {
  return h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, title), ...children);
}

/** Download helper. */
export function download(filename, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
