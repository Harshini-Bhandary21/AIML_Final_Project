/* Home, Regression Lab (Unit 3), Classification Lab (Unit 4) */
const PAGES = {};

/* ======================================================================= HOME */
PAGES.home = root => {
  const m = META;
  const d10 = m.mean_le_delta;
  const kpis = `<div class="grid g4">${kpi('Country-year rows', `<span data-c="${m.rows}">0</span>`)}${kpi('Countries', `<span data-c="${m.countries}">0</span>`)}${kpi('Latest year', m.year_max)}
    ${kpi(`Mean life expectancy (${m.year_max})`, `<span data-c="${m.mean_le}" data-d="1">0</span> yrs`, `${d10 >= 0 ? '▲' : '▼'} ${Math.abs(d10).toFixed(1)} vs 10y ago`, d10 >= 0 ? 'up' : 'down')}</div>`;
  const units = [['reg', 'Unit 3', 'Regression Lab', 'Linear, polynomial, Ridge / Lasso / ElasticNet, K-fold CV.', '📈'], ['clf', 'Unit 4', 'Classification Lab', 'Naive Bayes, Logistic Regression, KNN, ROC-AUC.', '🎯'],
    ['trees', 'Unit 5', 'Trees & Ensembles', 'Decision trees, SVM kernels, boosting, stacking, tuning.', '🌳'], ['disc', 'Unit 6', 'Discovery Lab', 'Clustering, PCA, anomalies and association rules.', '🔭'],
    ['search', 'Unit 2', 'AI Search Playground', 'A*, BFS, CSP, minimax on health logistics.', '🧭'], ['expert', 'Unit 1', 'Expert System & Chatbot', 'Rule-based reasoning and an ask-the-data chatbot.', '🧠']];
  const pre = kpis + section('Jump into a lab') + `<div class="unitrow">${units.map(u => `<div class="card ucard" data-go="${u[0]}"><div class="e">${u[4]}</div><div class="u">${u[1]}</div><div class="t">${u[2]}</div><div class="d">${u[3]}</div></div>`).join('')}</div>` + section('Data & models');
  mountPage(root, {
    hero: { badge: 'AIML · 2304322T · Third-year B.Tech', title: 'SDG-3 AIML Studio', sub: 'Good Health & Well-being, explored with every idea from the AIML syllabus - regression, classification, ensembles, clustering, AI search and expert systems - on live World Bank data for 200+ countries.', chips: ['🌍 World Bank API', '📈 55 years', '🧪 15 indicators', '🤖 6 syllabus units'] },
    pre,
    tabs: [
      { label: '🔄 Live API refresh', render: async (v, el) => {
        const info = (await api('meta')).source;
        el.innerHTML = `<div class="card"><h3>Pull fresh data from the World Bank API</h3>
          <div class="sub">Current source: <b>${esc(info.source)}</b>${info.fetched_at ? ` · fetched ${esc(info.fetched_at)}` : ''}</div>
          <p>One click downloads all 15 SDG-3 indicators for every country (1970 → this year), re-runs the cleaning and feature-engineering recipe, and every model page retrains on the new data. Takes 1-4 minutes - the World Bank API is slow.</p>
          <div class="row"><button class="btn primary" id="rf-go">🔄 Fetch latest data &amp; retrain</button><button class="btn" id="rf-reset" ${META.live ? '' : 'disabled'}>↩️ Back to static CSV snapshot</button></div>
          <div class="progress" id="rf-bar" style="display:none"><i></i></div><div id="rf-msg" class="sub"></div></div>`;
        const poll = async () => {
          const s = await api('refresh/status');
          $('#rf-bar i', el).style.width = (s.progress * 100) + '%'; $('#rf-msg', el).textContent = s.error ? '❌ ' + s.error : s.msg;
          if (s.running) return setTimeout(poll, 1200);
          $('#rf-go', el).disabled = false;
          if (s.done) { toast('Data refreshed - reloading…'); setTimeout(() => location.reload(), 900); }
          else if (s.error) toast('Refresh failed - existing data untouched.', true);
        };
        $('#rf-go', el).onclick = async () => { $('#rf-go', el).disabled = true; $('#rf-bar', el).style.display = ''; await api('refresh/start', {}, 'POST'); poll(); };
        $('#rf-reset', el).onclick = async () => { await api('refresh/reset', {}, 'POST'); location.reload(); };
        const s0 = await api('refresh/status'); if (s0.running) { $('#rf-go', el).disabled = true; $('#rf-bar', el).style.display = ''; poll(); }
      } },
      { label: '🏋️ Retrain & benchmark', render: async (v, el) => {
        const lr = (await api('meta')).last_run;
        el.innerHTML = `<div class="card"><h3>Retrain the headline models and compare with the previous run</h3><div class="sub">Country-grouped split. Classification target: life expectancy ≥ 70.</div>
          <button class="btn primary" id="bm-go">🏋️ Retrain now</button><div id="bm-out" style="margin-top:14px"></div></div>`;
        const show = rows => $('#bm-out', el).innerHTML = table([{ k: 'model', label: 'Model' }, { k: 'metric', label: 'Metric' }, { k: 'now', label: 'Now', d: 4 }, { k: 'prev', label: 'Previous run', d: 4 }, { k: 'delta', label: 'Δ', f: v => v == null ? '—' : `<span style="color:${v >= 0 ? '#34d399' : '#fb7185'}">${v >= 0 ? '+' : ''}${v.toFixed(4)}</span>` }], rows);
        if (lr) show(Object.entries(lr.results).flatMap(([k, o]) => Object.entries(o).map(([m, x]) => ({ model: k, metric: m, now: x }))));
        $('#bm-go', el).onclick = async e => { e.target.disabled = true; e.target.textContent = 'Training…'; const r = await api('benchmark', {}, 'POST'); show(r.rows); e.target.disabled = false; e.target.textContent = '🏋️ Retrain now'; toast(`Trained on ${r.rows_used.toLocaleString()} rows`); };
      } },
      { label: '🌍 World explorer', controls: [
        { id: 'ind', label: 'Indicator', type: 'select', options: pickOpts(META.indicators, nice), value: 'life_expectancy' },
        { id: 'year', label: 'Year', type: 'range', min: META.year_min, max: META.year_max, value: META.year_max },
        { id: 'c1', label: 'Country 1', type: 'select', options: META.country_list, value: 'India' }, { id: 'c2', label: 'Country 2', type: 'select', options: META.country_list, value: 'China' },
        { id: 'c3', label: 'Country 3', type: 'select', options: META.country_list, value: 'United States' }, { id: 'c4', label: 'Country 4', type: 'select', options: META.country_list, value: 'Nigeria' }],
      render: async (v, el) => {
        const [mp, tr, gr] = await Promise.all([api('map', { indicator: v.ind, year: v.year }), api('trend', { indicator: v.ind, countries: [v.c1, v.c2, v.c3, v.c4].join('|') }), api('group', { indicator: v.ind })]);
        const [a, ha] = pdiv('tall'), [b, hb] = pdiv(), [c, hc] = pdiv(), [d, hd] = pdiv('tall');
        el.innerHTML = `<div class="card">${ha}</div><div class="grid g2" style="margin-top:16px"><div class="card">${hb}</div><div class="card">${hc}</div></div><div class="card" style="margin-top:16px">${hd}</div>`;
        plot(a, [{ type: 'choropleth', locations: mp.iso3, z: mp.value, text: mp.country, colorscale: SEQ, marker: { line: { color: 'rgba(255,255,255,.18)', width: .4 } }, colorbar: { title: { text: nice(v.ind) }, thickness: 12, len: .7, outlinewidth: 0 }, hovertemplate: '<b>%{text}</b><br>%{z:.2f}<extra></extra>' }],
          { title: `${nice(v.ind)}, ${v.year}`, margin: { l: 0, r: 0, t: 44, b: 0 }, geo: { bgcolor: 'rgba(0,0,0,0)', showframe: false, showcoastlines: false, projection: { type: 'natural earth' }, landcolor: '#1a2342', showcountries: false, showlakes: false } });
        plot(b, Object.entries(tr).map(([k, o], i) => ({ x: o.year, y: o.value, name: k, mode: 'lines', line: { width: 3 } })), { title: `${nice(v.ind)} over time`, yaxis: { title: { text: nice(v.ind) } } });
        plot(c, INCOME_ORDER.filter(g => gr[g]).map(g => ({ x: gr[g].year, y: gr[g].value, name: g, mode: 'lines', line: { width: 3, color: INCOME[g] } })), { title: `By income group (mean)` });
        plot(d, INCOME_ORDER.map(g => { const ix = mp.income.map((x, i) => x === g ? i : -1).filter(i => i >= 0); return { type: 'scattergl', mode: 'markers', name: g, x: ix.map(i => mp.gdp[i]), y: ix.map(i => mp.le[i]), text: ix.map(i => mp.country[i]), marker: { size: ix.map(i => Math.max(6, Math.sqrt(mp.pop[i] / 1e6) * 2.2)), color: INCOME[g], opacity: .75, line: { color: 'rgba(255,255,255,.4)', width: .5 } }, hovertemplate: '<b>%{text}</b><br>GDP/cap $%{x:,.0f}<br>life exp %{y:.1f}<extra></extra>' }; }),
          { title: `Preston curve, ${v.year}: wealth vs life expectancy (bubble = population)`, xaxis: { type: 'log', title: { text: 'GDP per capita (US$, log)' } }, yaxis: { title: { text: 'Life expectancy' } } });
      } },
      { label: '📚 Syllabus map', render: async (v, el) => {
        el.innerHTML = `<div class="card">${table([{ k: 'u', label: 'Unit' }, { k: 't', label: 'Syllabus topics' }, { k: 'p', label: 'Where in this app' }], [
          { u: '1', t: 'Reasoning, rule-based systems, expert systems, chatbot & prompt engineering', p: 'Expert System & Chatbot' }, { u: '2', t: 'BFS/DFS/A*/greedy/hill-climbing, CSP, minimax & alpha-beta', p: 'AI Search Playground' },
          { u: '3', t: 'Simple / multiple / polynomial regression, MSE-RMSE-MAE-R², Ridge-Lasso-ElasticNet, K-fold CV', p: 'Regression Lab' }, { u: '4', t: 'Naive Bayes, Logistic Regression, KNN, accuracy-precision-recall-F1-ROC', p: 'Classification Lab' },
          { u: '5', t: 'Decision trees, SVM kernels, bagging / boosting / stacking, AdaBoost, tuning', p: 'Trees & Ensembles' }, { u: '6', t: 'Apriori, K-means / hierarchical / DBSCAN, PCA, anomaly detection', p: 'Discovery Lab' }])}</div>`;
      } }],
    after: r => $$('[data-go]', r).forEach(c => c.onclick = () => go(c.dataset.go))
  });
  $$('[data-c]', root).forEach(e => countUp(e, +e.dataset.c, +(e.dataset.d || 0)));
};
