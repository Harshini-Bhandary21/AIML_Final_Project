/* Shared toolkit: api client, chart theme, control builder, page/tab framework, small HTML helpers */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---- palette (mirrors the CSS tokens): burgundy and beige, one cool counterpoint ---- */
const INK = '#14243a', INK2 = '#4a5a70', MUTE = '#778397', BURG = '#356ae6', TEAL = '#23865b', OCHRE = '#d69a36', TERRA = '#c8553d', GOOD = '#23865b', PLUM = '#9aa6b6', SLATE = '#6b7a90';
const COLORS = ['#356ae6', '#e4802f', '#1f9d8f', '#7b5cd6', '#d64550', '#4f9a2f', '#c2468b', '#c98a14'];
const INCOME = { 'Low income': '#c8553d', 'Lower middle income': '#d69a36', 'Upper middle income': '#279c91', 'High income': '#356ae6' };
const INCOME_ORDER = ['Low income', 'Lower middle income', 'Upper middle income', 'High income'];
const SEQ = [[0, '#e7f0eb'], [.25, '#b4dad3'], [.5, '#5fb8ad'], [.75, '#279c91'], [1, '#0f4f4a']];            // sequential (light = low)
const DIV = [[0, TERRA], [.5, '#fafbf8'], [1, TEAL]];                                                      // diverging (correlation)
const REGION_SCALE = [[0, '#d2def9'], [.5, '#eff1ed'], [1, '#bfe0ce']];                                    // "not good" -> "good" backgrounds
let META = null, UID = 0;
const uid = () => 'p' + (++UID);
const fmt = (x, d = 3) => x == null || Number.isNaN(+x) ? '-' : (+x).toFixed(d);
const pct = (x, d = 1) => x == null ? '-' : (100 * x).toFixed(d) + '%';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nice = k => (META && META.features[k]) || k;

async function api(path, params = {}, method = 'GET', body) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  const r = await fetch('/api/' + path + (qs ? '?' + qs : ''), { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}
function toast(msg, err = false, ms = 5000) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}

/* ---- Plotly theme ---- */
const AX = { gridcolor: '#eceff1', zerolinecolor: '#e3e7eb', linecolor: '#e3e7eb', tickcolor: 'rgba(0,0,0,0)', automargin: true, ticks: 'outside', ticklen: 6 };
const REDUCED_ = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const BASE = {
  paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { family: "Arial, Helvetica, sans-serif", color: INK2, size: 14 },
  transition: { duration: REDUCED_ ? 0 : 450, easing: 'cubic-in-out' }, colorway: COLORS, margin: { l: 56, r: 22, t: 30, b: 48 }, xaxis: { ...AX }, yaxis: { ...AX },
  legend: { orientation: 'h', yanchor: 'bottom', y: 1.02, x: 0, bgcolor: 'rgba(0,0,0,0)', font: { size: 14 } },
  hoverlabel: { bgcolor: '#14243a', bordercolor: '#14243a', font: { color: '#ffffff', size: 14, family: "Arial, Helvetica, sans-serif" } },
  title: { font: { size: 16, color: INK, family: "Arial, Helvetica, sans-serif" }, x: .005 }
};
function merge(a, b) {
  const o = { ...a };
  for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') ? merge(a[k], b[k]) : b[k];
  return o;
}
function plot(el, data, layout = {}, cfg = {}) {
  if (typeof el === 'string') el = $('#' + el);
  if (layout.title && typeof layout.title === 'string') layout = { ...layout, title: { text: layout.title } };
  const L = merge(structuredClone(BASE), structuredClone(layout));       // Plotly writes axis state back into the layout, so never share nested objects
  const hasTitle = !!(layout.title && layout.title.text);
  if (!layout.margin || layout.margin.t === undefined) L.margin.t = hasTitle ? 92 : 38;
  L.title = { ...L.title, y: .97, yanchor: 'top' };
  return Plotly.react(el, data, L, { displayModeBar: false, responsive: true, ...cfg });
}
const byIncome = (rows, f) => INCOME_ORDER.map(g => ({ g, idx: rows.income.map((x, i) => x === g ? i : -1).filter(i => i >= 0) })).filter(o => o.idx.length).map(o => f(o.g, o.idx));

/* ---- HTML helpers ---- */
const kpi = (l, v, d, cls = '') => `<div class="stat"><span class="l">${l}</span><span class="v">${v}</span>${d ? `<span class="d ${cls}">${d}</span>` : ''}</div>`;
const stats = (...items) => `<div class="stats">${items.filter(Boolean).map(i => kpi(...i)).join('')}</div>`;
const note = (t, cls = '') => `<p class="aside ${cls}">${t}</p>`;
const section = (t, sub) => `<h2 class="sec">${t}</h2>${sub ? `<p class="sec-sub">${sub}</p>` : ''}`;
const pdiv = (cls = '') => { const id = uid(); return [id, `<div id="${id}" class="plot ${cls}"></div>`]; };
const fig = (inner, cap) => `<figure class="fig">${inner}${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
function table(cols, rows, opt = {}) {
  const best = {};
  (opt.max || []).forEach(k => best[k] = Math.max(...rows.map(r => +r[k])));
  (opt.min || []).forEach(k => best[k] = Math.min(...rows.map(r => +r[k])));
  return `<div class="tblwrap"><table class="tbl"><thead><tr>${cols.map(c => `<th${c.num ? ' style="text-align:right"' : ''}>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => {
    const v = r[c.k]; const txt = c.f ? c.f(v, r) : (typeof v === 'number' ? fmt(v, c.d ?? 3) : esc(v));
    const cl = [(typeof v === 'number' || c.num) ? 'n' : '', best[c.k] !== undefined && +v === best[c.k] ? 'best' : ''].join(' ');
    return `<td class="${cl}">${txt}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function countUp(el, to, dec = 0, ms = 1200) {
  const t0 = performance.now(); const f = t => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = (to * e).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);
}

/* ---- controls ---- */
function controls(host, defs, onChange, cls = '') {
  host.className = 'ctl ' + cls; host.innerHTML = '';
  const state = {}, els = {}; let timer;
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

/* ---- research figure tools: numbered captions, source line, PNG / SVG / CSV download ---- */
function download(name, text, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }
function plotCSV(gd) {
  const rows = [['series', 'x', 'y', 'z']];
  (gd.data || []).forEach((t, i) => {
    const name = t.name || `trace ${i + 1}`;
    if (['heatmap', 'contour'].includes(t.type) && t.z) t.z.forEach((r, yi) => r.forEach((z, xi) => rows.push([name, t.x ? t.x[xi] : xi, t.y ? t.y[yi] : yi, z])));
    else if (t.type === 'choropleth') (t.locations || []).forEach((l, k) => rows.push([name, l, t.text ? t.text[k] : '', t.z[k]]));
    else if (t.type === 'box') (t.y || []).forEach(v => rows.push([name, '', v, '']));
    else if (t.type === 'histogram') (t.x || []).forEach(v => rows.push([name, v, '', '']));
    else if (t.type === 'indicator') rows.push([name, '', t.value, '']);
    else if (t.x || t.y) { const n = Math.max(t.x ? t.x.length : 0, t.y ? t.y.length : 0); for (let k = 0; k < n; k++) { const x = t.x ? t.x[k] : '', y = t.y ? t.y[k] : ''; if (x === null && y === null) continue; rows.push(t.orientation === 'h' ? [name, y, x, ''] : [name, x, y, '']); } }
  });
  return rows.map(r => r.map(c => { c = c == null ? '' : String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\n');
}
const FIG_SOURCE = { live: 'WHO, World Bank, disease.sh, Open-Meteo (live)', fund: 'World Bank data and model estimates', default: 'World Bank Open Data' };
function foldNotes(scope) {
  $$('p.aside', scope).forEach(p => {
    if (p.dataset.fold || p.textContent.length < 230 || p.querySelector('details,button,input,a.btn')) return; p.dataset.fold = 1;
    const html = p.innerHTML, i = html.search(/[.;:] /); if (i < 40 || i > 200) return;
    p.innerHTML = html.slice(0, i + 1) + `<details class="capmore"><summary>Read more</summary><div>${html.slice(i + 2)}</div></details>`;
  });
}
function decorateFigures(scope, slug, tab) {
  foldNotes(scope);
  let n = 0; const t = (tab || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  $$('figure.fig', scope).forEach(f => {
    const gd = $('.plot', f); if (!gd || f.dataset.fig) return;
    f.dataset.fig = ++n; if (!REDUCED_) gd.classList.add('wipe');
    let cap = $('figcaption', f); if (!cap) { cap = document.createElement('figcaption'); f.appendChild(cap); }
    if (cap.textContent.trim()) cap.insertAdjacentHTML('afterbegin', `<span class="fignum">Figure ${n}.</span> `);
    if (cap.textContent.length > 230 && !cap.querySelector('details')) { const html = cap.innerHTML, i = html.search(/[.;] /); if (i > 40) { cap.innerHTML = html.slice(0, i + 1) + `<details class="capmore"><summary>Read more</summary><div>${html.slice(i + 2)}</div></details>`; } }
    const base = `sdg3-${slug}${t ? '-' + t : ''}-fig${n}`, bar = document.createElement('div'); bar.className = 'figtools';
    bar.innerHTML = `<span>Source: ${FIG_SOURCE[slug] || FIG_SOURCE.default} (<a href="#methods" data-go="methods">methods</a>)</span><span style="margin-left:auto">Download</span><button data-f="png">PNG</button><button data-f="svg">SVG</button><button data-f="csv">Data (CSV)</button>`;
    bar.addEventListener('click', async e => {
      const a = e.target.closest('a[data-go]'); if (a) { e.preventDefault(); return go('methods'); }
      const b = e.target.closest('button'); if (!b) return; const fmt_ = b.dataset.f;
      if (fmt_ === 'csv') return download(base + '.csv', plotCSV(gd), 'text/csv');
      const w = Math.max(900, gd.offsetWidth), h = Math.max(520, gd.offsetHeight);
      try { await Plotly.relayout(gd, { paper_bgcolor: '#ffffff' }); await Plotly.downloadImage(gd, { format: fmt_, width: w, height: h, scale: fmt_ === 'png' ? 3 : 1, filename: base }); }
      finally { Plotly.relayout(gd, { paper_bgcolor: 'rgba(0,0,0,0)' }); }
    });
    cap.appendChild(bar);
  });
}
/* ---- page head + tab framework ---- */

const _P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  reg: '<path d="M3 20h18"/><path d="M4 16l5-5 4 3 7-8"/><circle cx="9" cy="11" r="1"/><circle cx="13" cy="14" r="1"/>',
  clf: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="15" r="3"/><path d="M4 20L20 4"/>',
  trees: '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v4M12 11H6v6M12 11h6v6"/>',
  disc: '<circle cx="7" cy="8" r="2.5"/><circle cx="17" cy="7" r="2.5"/><circle cx="12" cy="17" r="2.5"/><path d="M9 9l2 6M15 9l-2 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M21 21l-5.5-5.5"/>',
  expert: '<path d="M12 3a6 6 0 0 0-3 11v3h6v-3a6 6 0 0 0-3-11z"/><path d="M9.5 21h5"/>',
  live: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  fund: '<path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/>',
  methods: '<path d="M9 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-10V3"/><path d="M8 3h8"/>',
  cite: '<path d="M7 7h4v6a4 4 0 0 1-4 4"/><path d="M15 7h4v6a4 4 0 0 1-4 4"/>'
};
const ico = k => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${_P[k] || _P.live}</svg>`;
function headHTML(h) {
  return `<header class="head ${h.home ? 'home' : ''} ${h.dark || ''}"><div class="headgrid"><div class="headtext"><div class="eyebrow">${h.eyebrow}</div><div class="titlerow">${h.icon ? `<span class="ico">${ico(h.icon)}</span>` : ''}<h1>${h.title}</h1></div><p class="lede">${h.lede}</p>${h.extra || ''}</div>${h.art ? `<div class="headart">${h.art}</div>` : ''}</div></header>`;
}
let CREDITS = {};
const credit = k => CREDITS[k] ? `<a href="${esc(CREDITS[k].source)}" target="_blank" rel="noopener">${esc(CREDITS[k].author)}, ${esc(CREDITS[k].license)}</a>` : '';
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function mountPage(root, cfg) {
  root.innerHTML = headHTML(cfg.head) + (cfg.pre || '') + `<div class="gctl"></div><div class="tabs" role="tablist"></div><div class="panes"></div>`;
  const tabsEl = $('.tabs', root), panes = $('.panes', root); const stale = {}, token = {}; let active = 0, gc = null;
  const panesEls = cfg.tabs.map((t, i) => {
    const p = document.createElement('div'); p.className = 'pane'; p.innerHTML = '<div class="lctl"></div><div class="body"></div>'; panes.appendChild(p);
    const b = document.createElement('div'); b.className = 'tab'; b.setAttribute('role', 'tab'); b.tabIndex = 0; b.textContent = t.label; tabsEl.appendChild(b);
    b.addEventListener('click', () => select(i)); b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
    stale[i] = true; t._lc = null; return { p, b };
  });
  const vals = t => ({ ...(gc ? gc.get() : {}), ...(t._lc ? t._lc.get() : {}) });
  async function renderTab(i) {
    const t = cfg.tabs[i], { p } = panesEls[i], body = $('.body', p), my = token[i] = (token[i] || 0) + 1;
    stale[i] = false; p.classList.add('loading');
    try { await t.render(vals(t), body, my === token[i]); decorateFigures(body, root.id.replace('page-', ''), t.label); }
    catch (e) { console.error(e); body.innerHTML = note('Something went wrong: ' + esc(e.message), 'bad'); }
    finally { if (my === token[i]) p.classList.remove('loading'); }
  }
  function select(i) {
    active = i; panesEls.forEach((o, j) => { o.p.classList.toggle('on', j === i); o.b.classList.toggle('on', j === i); o.b.setAttribute('aria-selected', j === i); });
    if (stale[i]) renderTab(i); else $$('.plot', panesEls[i].p).forEach(el => { try { Plotly.Plots.resize(el); } catch (e) { } });
  }
  if (cfg.globals && cfg.globals.length) gc = controls($('.gctl', root), cfg.globals, () => { cfg.tabs.forEach((_, i) => stale[i] = true); renderTab(active); });
  else $('.gctl', root).remove();
  cfg.tabs.forEach((t, i) => { if (t.controls) t._lc = controls($('.lctl', panesEls[i].p), t.controls, () => renderTab(i), 'slim'); else $('.lctl', panesEls[i].p).remove(); });
  if (cfg.tabs.length < 2) tabsEl.style.display = 'none';
  select(0); if (cfg.after) cfg.after(root);
}
const pickOpts = (arr, f = x => x) => arr.map(x => [x, f(x)]);
