/* Shared toolkit: api client, Plotly theme, control builder, page/tab framework, small HTML helpers */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#2dd4bf', '#c084fc', '#f97316'];
const INCOME = { 'Low income': '#fb7185', 'Lower middle income': '#fbbf24', 'Upper middle income': '#22d3ee', 'High income': '#34d399' };
const INCOME_ORDER = ['Low income', 'Lower middle income', 'Upper middle income', 'High income'];
const SEQ = [[0, '#1e1b4b'], [.35, '#6d28d9'], [.7, '#22d3ee'], [1, '#a7f3d0']];
let META = null, UID = 0;
const uid = () => 'p' + (++UID);
const fmt = (x, d = 3) => x == null || Number.isNaN(+x) ? '—' : (+x).toFixed(d);
const pct = (x, d = 1) => x == null ? '—' : (100 * x).toFixed(d) + '%';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nice = k => (META && META.features[k]) || k;

async function api(path, params = {}, method = 'GET', body) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  const r = await fetch('/api/' + path + (qs ? '?' + qs : ''), { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json();
}

function toast(msg, err = false, ms = 4500) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* ---------------- Plotly ---------------- */
const AX = { gridcolor: 'rgba(255,255,255,.07)', zerolinecolor: 'rgba(255,255,255,.15)', linecolor: 'rgba(255,255,255,.15)', automargin: true };
const BASE = {
  paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { family: 'Inter, system-ui, sans-serif', color: '#cbd5e1', size: 12 },
  colorway: COLORS, margin: { l: 55, r: 20, t: 44, b: 48 }, xaxis: { ...AX }, yaxis: { ...AX },
  legend: { orientation: 'h', yanchor: 'bottom', y: 1.02, x: 0, bgcolor: 'rgba(0,0,0,0)', font: { size: 11 } }, hoverlabel: { bgcolor: '#121a30', bordercolor: '#22d3ee', font: { color: '#e2e8f0' } },
  title: { font: { size: 14, color: '#e2e8f0' }, x: .01 }
};
function merge(a, b) {
  const o = { ...a };
  for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') ? merge(a[k], b[k]) : b[k];
  return o;
}
function plot(el, data, layout = {}, cfg = {}) {
  if (typeof el === 'string') el = $('#' + el);
  if (layout.title && typeof layout.title === 'string') layout = { ...layout, title: { text: layout.title } };
  // IMPORTANT: Plotly writes axis state back into the layout object, so never share nested objects between charts
  const L = merge(structuredClone(BASE), structuredClone(layout));
  const hasTitle = !!(layout.title && layout.title.text);
  if (!layout.margin || layout.margin.t === undefined) L.margin.t = hasTitle ? 78 : 40;
  L.title = { ...L.title, y: .97, yanchor: 'top' };
  return Plotly.react(el, data, L, { displayModeBar: false, responsive: true, ...cfg });
}
const byIncome = (rows, f) => INCOME_ORDER.map(g => ({ g, idx: rows.income.map((x, i) => x === g ? i : -1).filter(i => i >= 0) })).filter(o => o.idx.length).map(o => f(o.g, o.idx));

/* ---------------- HTML helpers ---------------- */
const kpi = (l, v, d, cls = '') => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div>${d ? `<span class="d ${cls}">${d}</span>` : ''}</div>`;
const note = (t, cls = '') => `<div class="note ${cls}">${t}</div>`;
const section = t => `<div class="section">${t}</div>`;
const pdiv = (cls = '') => { const id = uid(); return [id, `<div id="${id}" class="plot ${cls}"></div>`]; };
function table(cols, rows, opt = {}) {
  const best = {};
  (opt.max || []).forEach(k => best[k] = Math.max(...rows.map(r => +r[k])));
  (opt.min || []).forEach(k => best[k] = Math.min(...rows.map(r => +r[k])));
  return `<div class="tblwrap"><table class="tbl"><thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => {
    const v = r[c.k]; const txt = c.f ? c.f(v, r) : (typeof v === 'number' ? fmt(v, c.d ?? 3) : esc(v));
    const cl = [(typeof v === 'number' || c.num) ? 'n' : '', best[c.k] !== undefined && +v === best[c.k] ? 'best' : ''].join(' ');
    return `<td class="${cl}">${txt}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function countUp(el, to, dec = 0, ms = 900) {
  const t0 = performance.now(); const f = t => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = (to * e).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);
}

/* ---------------- controls ---------------- */
function controls(host, defs, onChange, cls = '') {
  host.className = 'ctl ' + cls; host.innerHTML = '';
  const state = {}, els = {};
  let timer;
  const fire = () => { refresh(); clearTimeout(timer); timer = setTimeout(() => onChange && onChange({ ...state }), 220); };
  const refresh = () => defs.forEach(d => { if (d.show) els[d.id].style.display = d.show(state) ? '' : 'none'; });
  defs.forEach(d => {
    state[d.id] = d.value;
    const f = document.createElement('div'); f.className = 'fld'; els[d.id] = f;
    const lab = `<label>${d.label}${d.type === 'range' ? `<output>${(d.fmt || (v => v))(d.value)}</output>` : ''}</label>`;
    if (d.type === 'range') {
      f.innerHTML = lab + `<input type="range" min="${d.min}" max="${d.max}" step="${d.step || 1}" value="${d.value}">`;
      const inp = $('input', f), out = $('output', f);
      inp.addEventListener('input', () => { state[d.id] = +inp.value; out.textContent = (d.fmt || (v => v))(+inp.value); fire(); });
    } else if (d.type === 'select') {
      const opts = d.options.map(o => Array.isArray(o) ? o : [o, o]);
      f.innerHTML = lab + `<select>${opts.map(([v, l]) => `<option value="${esc(v)}" ${v == d.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      $('select', f).addEventListener('change', e => { state[d.id] = e.target.value; fire(); });
    } else if (d.type === 'seg') {
      const opts = d.options.map(o => Array.isArray(o) ? o : [o, o]);
      f.innerHTML = lab + `<div class="seg">${opts.map(([v, l]) => `<button data-v="${esc(v)}" class="${v == d.value ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
      $$('button', f).forEach(b => b.addEventListener('click', () => { $$('button', f).forEach(x => x.classList.remove('on')); b.classList.add('on'); state[d.id] = b.dataset.v; fire(); }));
    } else if (d.type === 'check') {
      f.innerHTML = `<label class="chk"><input type="checkbox" ${d.value ? 'checked' : ''}><span>${d.label}</span></label>`;
      $('input', f).addEventListener('change', e => { state[d.id] = e.target.checked ? 1 : 0; fire(); });
      state[d.id] = d.value ? 1 : 0;
    } else if (d.type === 'number') {
      f.innerHTML = lab + `<input type="number" min="${d.min}" max="${d.max}" value="${d.value}">`;
      $('input', f).addEventListener('input', e => { state[d.id] = +e.target.value; fire(); });
    }
    host.appendChild(f);
  });
  refresh();
  return { get: () => ({ ...state }) };
}

/* ---------------- page / tab framework ---------------- */
function heroHTML(h) {
  return `<div class="hero"><div class="badge">${h.badge}</div><h1>${h.title}</h1><p>${h.sub}</p><div class="chips">${(h.chips || []).map(c => `<span class="chip">${c}</span>`).join('')}</div></div>`;
}
function mountPage(root, cfg) {
  root.innerHTML = heroHTML(cfg.hero) + (cfg.pre || '') + `<div class="gctl"></div><div class="tabs"></div><div class="panes"></div>`;
  const tabsEl = $('.tabs', root), panes = $('.panes', root);
  const stale = {}, token = {};
  let active = 0, gc = null;
  const panesEls = cfg.tabs.map((t, i) => {
    const p = document.createElement('div'); p.className = 'pane'; p.innerHTML = '<div class="lctl"></div><div class="body"></div>'; panes.appendChild(p);
    const b = document.createElement('div'); b.className = 'tab'; b.innerHTML = t.label; tabsEl.appendChild(b);
    b.addEventListener('click', () => select(i));
    stale[i] = true; t._lc = null;
    return { p, b };
  });
  const vals = t => ({ ...(gc ? gc.get() : {}), ...(t._lc ? t._lc.get() : {}) });
  async function renderTab(i) {
    const t = cfg.tabs[i], { p } = panesEls[i], body = $('.body', p), my = token[i] = (token[i] || 0) + 1;
    stale[i] = false; p.classList.add('loading');
    try { await t.render(vals(t), body, my === token[i]); }
    catch (e) { console.error(e); body.innerHTML = note('Something went wrong: ' + esc(e.message), 'bad'); }
    finally { if (my === token[i]) p.classList.remove('loading'); }
  }
  function select(i) {
    active = i; panesEls.forEach((o, j) => { o.p.classList.toggle('on', j === i); o.b.classList.toggle('on', j === i); });
    if (stale[i]) renderTab(i);
    else $$('.plot', panesEls[i].p).forEach(el => { try { Plotly.Plots.resize(el); } catch (e) { } });
  }
  if (cfg.globals && cfg.globals.length) { gc = controls($('.gctl', root), cfg.globals, () => { cfg.tabs.forEach((_, i) => stale[i] = true); renderTab(active); }); }
  else $('.gctl', root).remove();
  cfg.tabs.forEach((t, i) => {
    if (t.controls) t._lc = controls($('.lctl', panesEls[i].p), t.controls, () => renderTab(i), 'slim');
    else $('.lctl', panesEls[i].p).remove();
  });
  select(0);
  if (cfg.after) cfg.after(root);
}
const pickOpts = (arr, f = x => x) => arr.map(x => [x, f(x)]);
