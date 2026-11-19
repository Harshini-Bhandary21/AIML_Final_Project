/* Trees & Ensembles (Unit 5), Discovery Lab (Unit 6): each algorithm shows its own signature picture */

/* ---------- decision-tree SVG, with the path of one chosen country-year highlighted ---------- */
function drawTree(t) {
  const W = 196, H = 96, GX = 16, GY = 44; let leaf = 0, maxd = 0;
  const lay = (n, d) => { n.d = d; maxd = Math.max(maxd, d); if (n.left) { lay(n.left, d + 1); lay(n.right, d + 1); n.x = (n.left.x + n.right.x) / 2; } else n.x = leaf++; };
  lay(t, 0);
  const width = leaf * (W + GX) + GX, height = (maxd + 1) * (H + GY) + 10;
  const col = f => { const a = [251, 113, 133], b = [52, 211, 153]; return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * f)).join(',')})`; };
  let out = '', links = '', onpath = '';
  const draw = n => {
    const x = GX + n.x * (W + GX), y = 6 + n.d * (H + GY);
    n.cx = x + W / 2; n.cy = y;
    [n.left, n.right].forEach((c, i) => {
      if (!c) return; draw(c);
      const d = `M${n.cx},${y + H} C${n.cx},${y + H + 22} ${c.cx},${c.cy - 22} ${c.cx},${c.cy}`, hot = n.on && c.on;
      (hot ? onpath : links); const seg = `<path d="${d}" stroke="${hot ? '#fbbf24' : '#64748b'}" fill="none" stroke-width="${hot ? 4 : 1.6}"/><text x="${(n.cx + c.cx) / 2 + (i ? 8 : -8)}" y="${y + H + 19}" fill="${hot ? '#fbbf24' : '#94a3b8'}" font-size="${hot ? 12 : 10}" font-weight="${hot ? 800 : 400}" text-anchor="${i ? 'start' : 'end'}">${i ? 'no' : 'yes'}</text>`;
      if (hot) onpath += seg; else links += seg;
    });
    const head = n.rule ? esc(n.rule) : 'leaf';
    const dir = n.on && n.val != null && n.left ? `<text x="${x + W / 2}" y="${y + 90}" text-anchor="middle" fill="#fbbf24" font-size="11" font-weight="700">this country: ${n.val.toFixed(2)} → ${n.left.on ? 'yes' : 'no'}</text>` : '';
    out += `<g><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="12" fill="${col(n.frac)}" fill-opacity="${n.on ? .35 : .18}" stroke="${n.on ? '#fbbf24' : col(n.frac)}" stroke-width="${n.on ? 3.5 : 1.4}"/>
      <text x="${x + W / 2}" y="${y + 20}" text-anchor="middle" fill="#e2e8f0" font-size="11" font-weight="700">${head.length > 34 ? head.slice(0, 33) + '…' : head}</text>
      <text x="${x + W / 2}" y="${y + 38}" text-anchor="middle" fill="#cbd5e1" font-size="10.5">impurity ${n.impurity.toFixed(3)} · samples ${n.samples}</text>
      <text x="${x + W / 2}" y="${y + 55}" text-anchor="middle" fill="#cbd5e1" font-size="10.5">not good ${n.value[0]} | good ${n.value[1]}</text>
      <text x="${x + W / 2}" y="${y + 74}" text-anchor="middle" fill="${col(n.frac)}" font-size="12" font-weight="800">${n.cls}${n.more ? '  ⋯' : ''}</text>${dir}</g>`;
  };
  draw(t);
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${links}${onpath}${out}</svg>`;
}

const REGMAP = [[0, 'rgb(251,113,133)'], [.5, 'rgb(27,37,67)'], [1, 'rgb(52,211,153)']];
function regionTraces(r, z, name) {
  const tr = [{ type: 'heatmap', x: r.gx, y: r.gy, z, colorscale: REGMAP, zmin: 0, zmax: 1, opacity: .6, showscale: false, hoverinfo: 'skip' }];
  [[0, 'not good', RD], [1, 'good', GR]].forEach(([l, n, c]) => { const ix = r.pts.label.map((x, i) => x === l ? i : -1).filter(i => i >= 0); tr.push(dots(n, ix.map(i => r.pts.x[i]), ix.map(i => r.pts.y[i]), c, .75, 4)); });
  return tr;
}
const regLay = (r, title) => ({ title, xaxis: { title: { text: r.fx }, range: [r.gx[0], r.gx[r.gx.length - 1]] }, yaxis: { title: { text: r.fy }, range: [r.gy[0], r.gy[r.gy.length - 1]] } });

PAGES.trees = root => {
  const FE = pickOpts(META.feature_keys, nice);
  mountPage(root, {
    hero: { badge: 'Unit 5 · Linear & decision models', title: 'Trees, SVMs & Ensembles', sub: 'See the tree a country falls through, the rectangles it carves out of the feature space, the SVM margin and its support vectors, and why a forest is smoother than a single tree.', chips: ['decision path', 'feature-space regions', 'margin & support vectors', 'tree vs forest', 'tuning'] },
    globals: [{ id: 'thr', label: "'Good' means life expectancy ≥ (years)", type: 'range', min: 55, max: 80, value: 70 }],
    tabs: [
      { label: 'Decision tree', controls: [{ id: 'criterion', label: 'Split criterion', type: 'seg', options: ['gini', 'entropy'], value: 'gini' }, { id: 'depth', label: 'max_depth', type: 'range', min: 1, max: 20, value: 4 },
        { id: 'ccp', label: 'Pruning strength (ccp_alpha)', type: 'range', min: 0, max: .03, step: .001, value: 0, fmt: v => (+v).toFixed(3) },
        { id: 'country', label: 'Follow this country down the tree', type: 'select', options: META.country_list, value: 'Nigeria' }, { id: 'year', label: 'Year', type: 'range', min: META.year_min, max: META.year_max, value: META.year_max - 4 }],
      render: async (v, el) => {
        const r = await api('tree', { thr: v.thr, criterion: v.criterion, depth: v.depth, ccp: v.ccp, country: v.country, year: v.year });
        const [a, ha] = pdiv(), [b, hb] = pdiv(), [c, hc] = pdiv('tall'); const S = r.sample;
        el.innerHTML = `<div class="grid g4">${kpi('Train accuracy', fmt(r.train))}${kpi('Test accuracy', fmt(r.test))}${kpi('Leaves', r.leaves)}${kpi('Depth used', r.depth)}</div>
          ${S ? note(`<b>${esc(S.country)} ${S.year}</b> (life expectancy ${fmt(S.life, 1)}) is sent down the tree: at every node it answers one question about its own numbers and follows <b style="color:#fbbf24">yes / no</b> (gold path). It lands in a leaf that says <b>${S.pred_good ? 'GOOD' : 'NOT GOOD'}</b> - ${S.pred_good === S.truly_good ? '✔ correct' : '✘ wrong (it is actually ' + (S.truly_good ? 'good' : 'not good') + ')'}.`, S.pred_good === S.truly_good ? 'ok' : 'warn') : ''}
          <div class="section">The tree (top 3 levels) - colour = share of "good" countries in the node</div><div class="treebox">${drawTree(r.tree)}</div>
          <div class="grid g2" style="margin-top:16px"><div class="card">${ha}</div><div class="card"><h3>Gini vs. entropy - the split criterion</h3><div class="sub">A node is "pure" when it holds only one class. Both measures are 0 for a pure node and largest at a 50/50 mix; the tree picks the split that lowers them most.</div>
            <div class="fld"><label>Share of 'good' in a node, p<output id="pv">0.50</output></label><input type="range" id="pr" min="0.01" max="0.99" step="0.01" value="0.5"></div><div class="latex" id="gl"></div>${hb}</div></div>
          <div class="section">Pruning path</div>${note('Cost-complexity pruning cuts weak branches. Train accuracy falls as the tree shrinks; <b>test accuracy is highest at a moderate alpha</b> - pick that.')}<div class="card">${hc}</div>`;
        const imp = r.importance; plot(a, [{ type: 'bar', orientation: 'h', x: imp.map(o => o.value), y: imp.map(o => o.feature), marker: { color: CY } }], { title: 'Feature importance (total impurity reduction)', margin: { l: 170 } });
        const ps = Array.from({ length: 199 }, (_, i) => (i + 1) / 200), G = ps.map(p => 1 - p * p - (1 - p) ** 2), En = ps.map(p => -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)));
        const upd = p => { const g = 1 - p * p - (1 - p) ** 2, e = -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)); $('#pv', el).textContent = p.toFixed(2); $('#gl', el).innerHTML = `Gini = 1 − p² − (1−p)² = ${g.toFixed(3)}<br>Entropy = −Σ p log₂ p = ${e.toFixed(3)}`; Plotly.relayout(b, { shapes: [{ type: 'line', x0: p, x1: p, yref: 'paper', y0: 0, y1: 1, line: { color: '#fff', dash: 'dot' } }] }); };
        plot(b, [lineTr('Gini', ps, G, CY), lineTr('Entropy', ps, En, VI)], { xaxis: { title: { text: 'p' } } }); upd(.5); $('#pr', el).oninput = e => upd(+e.target.value);
        const pr = r.prune; plot(c, [{ x: pr.map(o => o.alpha), y: pr.map(o => o.train), name: 'train', mode: 'lines+markers', line: { width: 3 } }, { x: pr.map(o => o.alpha), y: pr.map(o => o.test), name: 'test', mode: 'lines+markers', line: { width: 3 }, text: pr.map(o => o.leaves + ' leaves'), hovertemplate: 'α %{x:.4f}<br>acc %{y:.3f}<br>%{text}<extra></extra>' }], { xaxis: { title: { text: 'ccp_alpha (bigger = more pruning)' } }, yaxis: { title: { text: 'accuracy' } } });
      } },
      { label: 'Feature-space regions', controls: [{ id: 'fx', label: 'x-axis feature', type: 'select', options: FE, value: 'log_gdp_per_capita' }, { id: 'fy', label: 'y-axis feature', type: 'select', options: FE, value: 'physicians_per_1000' },
        { id: 'depth', label: 'max_depth', type: 'range', min: 1, max: 14, value: 3 }, { id: 'criterion', label: 'Criterion', type: 'seg', options: ['gini', 'entropy'], value: 'gini' }],
      render: async (v, el) => {
        const r = await api('regions', { thr: v.thr, fx: v.fx, fy: v.fy, depth: v.depth, criterion: v.criterion }); const [a, ha] = pdiv('tall');
        el.innerHTML = `${note('<b>What a decision tree really does:</b> every split is a straight, axis-parallel cut, so a tree carves the feature plane into <b>rectangles</b> and gives each rectangle the majority class. This is that partition for two features. Depth 1 = one cut; deeper = more, smaller rectangles that start fitting single points (overfitting).')}
          <div class="grid g3">${kpi('Depth', r.depth)}${kpi('Train accuracy (2 features)', fmt(r.acc_dt_train))}${kpi('Test accuracy (2 features)', fmt(r.acc_dt), r.acc_dt_train - r.acc_dt > .06 ? 'gap → overfitting' : '', r.acc_dt_train - r.acc_dt > .06 ? 'down' : 'up')}</div><div class="card" style="margin-top:14px">${ha}</div>`;
        plot(a, regionTraces(r, r.dt_z), regLay(r, `Decision-tree regions (depth ${r.depth}) - green = predicts GOOD, red = predicts NOT GOOD`));
      } },
      { label: 'Support Vector Machine', controls: [{ id: 'kernel', label: 'Kernel', type: 'seg', options: ['linear', 'poly', 'rbf', 'sigmoid'], value: 'linear' }, { id: 'logC', label: 'log10(C)  (margin softness)', type: 'range', min: -2, max: 3, step: .5, value: 0, fmt: v => (+v).toFixed(1) },
        { id: 'loggamma', label: 'log10(gamma)', type: 'range', min: -3, max: 1, step: .5, value: -1, fmt: v => (+v).toFixed(1), show: s => s.kernel !== 'linear' }, { id: 'degree', label: 'poly degree', type: 'range', min: 2, max: 5, value: 3, show: s => s.kernel === 'poly' },
        { id: 'fx', label: 'x-axis feature', type: 'select', options: FE, value: 'log_gdp_per_capita' }, { id: 'fy', label: 'y-axis feature', type: 'select', options: FE, value: 'basic_sanitation_pct' }],
      render: async (v, el) => {
        const r = await api('svm', { thr: v.thr, kernel: v.kernel, logC: v.logC, loggamma: v.loggamma, degree: v.degree, fx: v.fx, fy: v.fy }); const [a, ha] = pdiv('tall');
        el.innerHTML = `${note('<b>SVM in one picture:</b> the solid white line is the decision boundary; the dashed lines are the <b>margin</b> (±1). The <b>circled points - the support vectors - are the only ones that define the boundary</b>; every other point could be deleted without changing it. Small C = wide, forgiving margin (many support vectors); large C = narrow margin that bends to fit every point. Kernels bend the line.')}
          <div class="card">${ha}</div><div class="grid g3" style="margin-top:16px">${kpi('Support vectors', r.n_sv, `${pct(r.n_sv / r.n, 0)} of ${r.n} training points`)}${kpi('Test accuracy · these 2 features', fmt(r.acc2))}${kpi('Test accuracy · all 10 features', fmt(r.acc_all))}</div>
          <div class="section">Kernel comparison (all features)</div>${table([{ k: 'kernel', label: 'Kernel' }, { k: 'test_acc', label: 'Test accuracy' }, { k: 'support_vectors', label: 'Support vectors', f: x => x }, { k: 'fit_s', label: 'Fit seconds', d: 2 }], r.kernels, { max: ['test_acc'] })}`;
        const lv = (l, dash, name, w) => ({ type: 'contour', x: r.x, y: r.y, z: r.z, contours: { start: l, end: l, size: 1, coloring: 'lines' }, colorscale: [[0, '#ffffff'], [1, '#ffffff']], line: { color: '#ffffff', width: w, dash }, showscale: false, hoverinfo: 'skip', name, showlegend: false });
        const tr = [{ type: 'contour', x: r.x, y: r.y, z: r.z, colorscale: [[0, 'rgb(251,113,133)'], [.5, 'rgb(27,37,67)'], [1, 'rgb(52,211,153)']], zmin: -3, zmax: 3, contours: { coloring: 'heatmap', start: -3, end: 3, size: .5 }, line: { width: 0 }, opacity: .6, showscale: false, hoverinfo: 'skip' }, lv(-1, 'dash', 'margin', 1.6), lv(0, 'solid', 'boundary', 3.5), lv(1, 'dash', 'margin', 1.6)];
        [[1, 'good', GR], [0, 'not good', RD]].forEach(([l, n, c]) => { const ix = r.pts.label.map((x, i) => x === l ? i : -1).filter(i => i >= 0); tr.push(dots(n, ix.map(i => r.pts.x[i]), ix.map(i => r.pts.y[i]), c, .6, 4)); });
        tr.push({ type: 'scatter', mode: 'markers', name: 'support vectors', x: r.sv.x, y: r.sv.y, marker: { symbol: 'circle-open', size: 11, color: '#fff', line: { color: '#fff', width: 1.6 } }, hoverinfo: 'skip' });
        plot(a, tr, { title: `SVM (${v.kernel} kernel): boundary, margin and support vectors`, xaxis: { title: { text: r.fx }, range: [r.x[0], r.x[r.x.length - 1]] }, yaxis: { title: { text: r.fy }, range: [r.y[0], r.y[r.y.length - 1]] } });
      } },
      { label: 'Ensembles', controls: [{ id: 'fx', label: 'x-axis feature', type: 'select', options: FE, value: 'log_gdp_per_capita' }, { id: 'fy', label: 'y-axis feature', type: 'select', options: FE, value: 'physicians_per_1000' }, { id: 'depth', label: 'Single-tree depth', type: 'range', min: 2, max: 16, value: 10 }],
      render: async (v, el) => {
        el.innerHTML = note('Training 7 ensembles on first run (about 30 s)…'); const [r, g] = await Promise.all([api('ens', { thr: v.thr }), api('regions', { thr: v.thr, fx: v.fx, fy: v.fy, depth: v.depth, rf: 1 })]);
        const [a, ha] = pdiv('tall'), [b, hb] = pdiv(), [p1, h1] = pdiv('tall'), [p2, h2] = pdiv('tall');
        const FC = { single: GREY, bagging: CY, boosting: PK, combining: VI }; const rows = [...r.rows].sort((x, y) => x.test - y.test);
        el.innerHTML = `<div class="section">Why an ensemble? One tree vs a forest of 80 trees, same two features</div>${note('A single deep tree draws <b>jagged rectangles that chase individual points</b> (high variance: train accuracy ≫ test). A random forest <b>averages many trees</b> grown on random subsamples, so its boundary is smooth and generalises better - that is bagging.')}
          <div class="grid g4" style="margin-bottom:12px">${kpi(`Single tree (depth ${g.depth})`, `${fmt(g.acc_dt)}`, `train ${fmt(g.acc_dt_train)}`)}${kpi('Random forest', fmt(g.acc_rf), `train ${fmt(g.acc_rf_train)}`)}</div>
          <div class="grid g2"><div class="card">${h1}</div><div class="card">${h2}</div></div>
          <div class="section">All ensembles, all 10 features</div><div class="grid g3" style="margin-bottom:12px"><div class="note"><b>Bagging</b> – many models on bootstrap samples, averaged → lowers variance.</div><div class="note"><b>Boosting</b> – models in sequence, each fixing the last one's mistakes → lowers bias.</div><div class="note"><b>Stacking / Voting</b> – a meta-model or vote combines different learners.</div></div>
          <div class="card">${ha}</div>${table([{ k: 'model', label: 'Model' }, { k: 'family', label: 'Family' }, { k: 'train', label: 'Train acc' }, { k: 'test', label: 'Test acc' }, { k: 'f1', label: 'F1' }, { k: 'auc', label: 'ROC-AUC' }, { k: 'fit_s', label: 'Fit s', d: 1 }], r.rows, { max: ['test', 'f1', 'auc'] })}
          <div class="section">Boosting: each added weak learner</div><div class="card">${hb}</div>`;
        plot(p1, regionTraces(g, g.dt_z), regLay(g, `Single tree (depth ${g.depth})`)); plot(p2, regionTraces(g, g.rf_z), regLay(g, 'Random forest (80 trees)'));
        plot(a, [{ type: 'bar', orientation: 'h', x: rows.map(o => o.test), y: rows.map(o => o.model), marker: { color: rows.map(o => FC[o.family]) }, text: rows.map(o => fmt(o.test)), textposition: 'outside', hovertemplate: '%{y}<br>%{x:.3f}<extra></extra>' }], { title: 'Test accuracy on unseen countries', xaxis: { range: [.8, .9] }, margin: { l: 190 } });
        plot(b, Object.entries(r.stage).map(([k, y]) => ({ x: y.map((_, i) => i + 1), y, name: k, mode: 'lines', line: { width: 3 } })), { xaxis: { title: { text: 'boosting rounds (weak learners added)' } }, yaxis: { title: { text: 'test accuracy' } } });
      } },
      { label: 'Hyper-parameter tuning', controls: [{ id: 'mode', label: 'Search strategy', type: 'seg', options: [['grid', 'GridSearchCV (decision tree)'], ['random', 'RandomizedSearchCV (random forest)']], value: 'grid' }],
      render: async (v, el) => {
        el.innerHTML = `${note('Hyper-parameters are chosen by <b>cross-validation on whole held-out countries</b>, never on the test set.')}<button class="btn primary" id="tn-go">▶ Run search</button><div id="tn-out" style="margin-top:16px"></div>`;
        $('#tn-go', el).onclick = async e => {
          e.target.disabled = true; e.target.textContent = 'Searching…'; const out = $('#tn-out', el); out.innerHTML = note('Running cross-validated search…');
          try {
            const r = await api('tune', { thr: v.thr, mode: v.mode }); const [h, hh] = pdiv();
            out.innerHTML = `<div class="grid g3">${kpi('Best params', `<span style="font-size:1rem">${esc(JSON.stringify(r.best))}</span>`)}${kpi('Default model · test acc', fmt(r.default_acc))}${kpi('Tuned model · test acc', fmt(r.tuned_acc), `${r.tuned_acc - r.default_acc >= 0 ? '+' : ''}${fmt(r.tuned_acc - r.default_acc)}`, r.tuned_acc >= r.default_acc ? 'up' : 'down')}</div>
              ${r.heat ? `<div class="card" style="margin-top:16px">${hh}</div>` : table([{ k: 'rank', label: 'Rank' }, { k: 'mean', label: 'Mean CV acc' }, { k: 'std', label: 'Std' }, { k: 'params', label: 'Params' }], r.table, { max: ['mean'] })}`;
            if (r.heat) plot(h, [{ type: 'heatmap', x: r.heat.x.map(String), y: r.heat.y.map(String), z: r.heat.z, colorscale: SEQ, text: r.heat.z.map(row => row.map(z => z.toFixed(3))), texttemplate: '%{text}', colorbar: { thickness: 10, outlinewidth: 0, title: { text: 'CV acc' } } }], { title: 'GridSearch: CV accuracy for every combination', xaxis: { title: { text: 'min_samples_leaf' }, type: 'category' }, yaxis: { title: { text: 'max_depth' }, type: 'category' } });
          } catch (err) { out.innerHTML = note('Search failed: ' + esc(err.message), 'bad'); }
          e.target.disabled = false; e.target.textContent = '▶ Run search';
        };
      } }]
  });
};

/* ======================================================================= DISCOVERY */
const clusterColor = l => l === '-1' ? GREY : COLORS[(+l) % COLORS.length];
const dendroColor = c => c === 'C0' ? '#64748b' : COLORS[(+c.slice(1) - 1) % COLORS.length];
PAGES.disc = root => {
  mountPage(root, {
    hero: { badge: 'Unit 6 · Unsupervised learning', title: 'Discovery Lab', sub: 'No labels here - the algorithms look for structure on their own: centroids, a cut dendrogram, dense regions with noise, hidden axes, outliers and if-then rules.', chips: ['K-means centroids', 'dendrogram cut', 'DBSCAN core / border / noise', 'PCA · LDA', 'anomalies', 'Apriori'] },
    globals: [{ id: 'year', label: 'Snapshot year (clustering & PCA)', type: 'range', min: META.year_min, max: META.year_max, value: META.year_max - 2 }],
    tabs: [
      { label: 'Clustering', controls: [{ id: 'algo', label: 'Algorithm', type: 'seg', options: [['kmeans', 'K-means'], ['hier', 'Hierarchical'], ['dbscan', 'DBSCAN']], value: 'kmeans' },
        { id: 'k', label: 'Clusters (k)', type: 'range', min: 2, max: 10, value: 4, show: s => s.algo !== 'dbscan' }, { id: 'linkage', label: 'Linkage', type: 'select', options: ['ward', 'complete', 'average', 'single'], value: 'ward', show: s => s.algo === 'hier' },
        { id: 'region', label: 'Dendrogram region', type: 'select', options: META.regions, value: META.regions.includes('South Asia') ? 'South Asia' : META.regions[0], show: s => s.algo === 'hier' },
        { id: 'eps', label: 'eps (neighbourhood radius)', type: 'range', min: .3, max: 3, step: .05, value: 1.2, fmt: v => (+v).toFixed(2), show: s => s.algo === 'dbscan' }, { id: 'ms', label: 'min_samples', type: 'range', min: 2, max: 15, value: 4, show: s => s.algo === 'dbscan' }],
      render: async (v, el) => {
        const r = await api('disc/cluster', { algo: v.algo, k: v.k, linkage: v.linkage, region: v.region, eps: v.eps, ms: v.ms, year: v.year });
        const [a, ha] = pdiv(), [b, hb] = pdiv(), [c, hc] = pdiv('tall'), [d, hd] = pdiv('tall'), [e, he] = pdiv('tall');
        const P = r.points, cl = [...new Set(P.cluster)].sort((x, y) => +x - +y), pcv = `${(r.evr[0] * 100).toFixed(0)}% + ${(r.evr[1] * 100).toFixed(0)}% of variance`;
        const intro = { kmeans: `<b>K-means:</b> pick k centres, assign every country to its nearest centre, move each centre to the mean of its countries, repeat until stable. The <b>X markers are the final centroids</b>. The elbow (where inertia stops dropping fast) and the silhouette (peak = best separated) help choose k.`,
          hier: `<b>Hierarchical (agglomerative):</b> start with every country alone and repeatedly merge the two closest groups. The <b>dendrogram</b> is the merge history - height = distance at which groups joined. <b>Cutting it with a horizontal line gives k clusters</b> (the dashed line; colours = the groups below it).`,
          dbscan: `<b>DBSCAN:</b> a point is <b>core</b> if ≥ min_samples points lie within radius eps; <b>border</b> points are within eps of a core point but not core themselves; everything else is <b>noise</b> (×). No k needed - clusters are dense regions of any shape.` }[v.algo];
        el.innerHTML = `${note(intro)}
          ${r.elbow ? `<div class="grid g2"><div class="card">${ha}</div><div class="card">${hb}</div></div>` : ''}${r.dendro ? `<div class="card">${hc}</div>` : ''}
          <div class="grid g4" style="margin:12px 0">${r.inertia != null ? kpi('Inertia (within-cluster SS)', fmt(r.inertia, 0)) : ''}${r.silhouette != null ? kpi('Silhouette', fmt(r.silhouette), '−1 bad · +1 well separated') : ''}${r.kinds ? kpi('Core · border · noise', `${r.kinds.core} · ${r.kinds.border} · ${r.kinds.noise}`, `${r.nclusters} clusters found`) : ''}</div>
          <div class="grid g2"><div class="card">${hd}</div><div class="card">${he}</div></div><div class="section">Cluster profiles (mean values) - read these to name each cluster</div>
          ${table([{ k: 'cluster', label: 'Cluster' }, { k: 'life_expectancy', label: 'Life exp.', d: 1 }, { k: 'infant_mortality_per_1000', label: 'Infant mort.', d: 1 }, { k: 'gdp_per_capita_usd', label: 'GDP p.c.', d: 0 }, { k: 'basic_sanitation_pct', label: 'Sanitation %', d: 1 }, { k: 'physicians_per_1000', label: 'Physicians', d: 1 }, { k: 'countries', label: 'Countries', f: x => x }], r.profiles)}`;
        if (r.elbow) {
          plot(a, [{ x: r.elbow.map(o => o.k), y: r.elbow.map(o => o.inertia), mode: 'lines+markers', line: { width: 3 } }], { title: 'Elbow: where does inertia stop falling fast?', xaxis: { dtick: 1, title: { text: 'k' } }, yaxis: { title: { text: 'inertia' } }, shapes: [{ type: 'line', x0: v.k, x1: v.k, yref: 'paper', y0: 0, y1: 1, line: { color: GOLD, dash: 'dot' } }] });
          plot(b, [{ x: r.elbow.map(o => o.k), y: r.elbow.map(o => o.silhouette), mode: 'lines+markers', line: { width: 3, color: PK } }], { title: 'Silhouette: higher = tighter, better separated', xaxis: { dtick: 1, title: { text: 'k' } }, shapes: [{ type: 'line', x0: v.k, x1: v.k, yref: 'paper', y0: 0, y1: 1, line: { color: GOLD, dash: 'dot' } }] });
        }
        if (r.dendro) {
          const D = r.dendro; const tr = D.icoord.map((x, i) => ({ x, y: D.dcoord[i], mode: 'lines', line: { color: dendroColor(D.colors[i]), width: 2.4 }, hoverinfo: 'skip', showlegend: false }));
          plot(c, tr, { title: `Dendrogram - ${D.region}: cut at the dashed line → ${D.k} clusters`, xaxis: { tickvals: D.labels.map((_, i) => 10 * i + 5), ticktext: D.labels, tickangle: -60, showgrid: false }, yaxis: { title: { text: 'merge distance' } }, margin: { b: 140 },
            shapes: D.cut != null ? [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: D.cut, y1: D.cut, line: { color: GOLD, dash: 'dash', width: 2 } }] : [], annotations: D.cut != null ? [{ xref: 'paper', x: 1, y: D.cut, text: `cut = ${D.cut.toFixed(2)}`, showarrow: false, xanchor: 'right', yanchor: 'bottom', font: { color: GOLD } }] : [] });
        }
        const tr = [];
        if (v.algo === 'dbscan') {
          [['core', 'circle', 9, .9], ['border', 'circle', 6, .6], ['noise', 'x', 9, .9]].forEach(([kd, sym, sz, op]) => { const ix = P.kind.map((x, i) => x === kd ? i : -1).filter(i => i >= 0); tr.push({ type: 'scattergl', mode: 'markers', name: `${kd} (${ix.length})`, x: ix.map(i => P.pc1[i]), y: ix.map(i => P.pc2[i]), text: ix.map(i => `${P.country[i]} · cluster ${P.cluster[i]}`), marker: { symbol: sym, size: sz, opacity: op, color: ix.map(i => kd === 'noise' ? GREY : clusterColor(P.cluster[i])), line: { color: '#0b1020', width: kd === 'noise' ? 2 : .5 } }, hovertemplate: '<b>%{text}</b><extra></extra>' }); });
        } else cl.forEach(l => { const ix = P.cluster.map((x, i) => x === l ? i : -1).filter(i => i >= 0); tr.push({ type: 'scattergl', mode: 'markers', name: 'cluster ' + l, x: ix.map(i => P.pc1[i]), y: ix.map(i => P.pc2[i]), text: ix.map(i => P.country[i]), marker: { color: clusterColor(l), size: 9, opacity: .8, line: { color: '#0b1020', width: .5 } }, hovertemplate: '<b>%{text}</b><extra></extra>' }); });
        if (r.centroids) tr.push({ type: 'scatter', mode: 'markers+text', name: 'centroids', x: r.centroids.pc1, y: r.centroids.pc2, text: r.centroids.size.map((n, i) => `${i} (${n})`), textposition: 'top center', textfont: { color: '#fff', size: 12 }, marker: { symbol: 'x', size: 18, color: r.centroids.pc1.map((_, i) => clusterColor(String(i))), line: { color: '#fff', width: 3 } } });
        plot(d, tr, { title: `Countries in PCA space (${pcv})`, xaxis: { title: { text: 'PC1' } }, yaxis: { title: { text: 'PC2' } } });
        const n = cl.length, idx = Object.fromEntries(cl.map((l, i) => [l, i])), cs = [].concat(...cl.map((l, i) => [[i / n, clusterColor(l)], [(i + 1) / n, clusterColor(l)]]));
        plot(e, [{ type: 'choropleth', locations: P.iso3, z: P.cluster.map(l => idx[l] + .5), zmin: 0, zmax: n, colorscale: cs, showscale: false, text: P.country, customdata: P.cluster, hovertemplate: '<b>%{text}</b><br>cluster %{customdata}<extra></extra>', marker: { line: { color: 'rgba(255,255,255,.15)', width: .4 } } }],
          { title: 'Clusters on the map', margin: { l: 0, r: 0, t: 78, b: 0 }, geo: { bgcolor: 'rgba(0,0,0,0)', showframe: false, showcoastlines: false, projection: { type: 'natural earth' }, landcolor: '#1a2342', showcountries: false } });
      } },
      { label: 'PCA & LDA', render: async (v, el) => {
        const r = await api('disc/pca', { year: v.year }); const [a, ha] = pdiv(), [b, hb] = pdiv('tall'), [c, hc] = pdiv('tall');
        el.innerHTML = `${note('<b>PCA</b> finds new axes (principal components) ordered by how much of the data\'s variance they capture. The scree plot shows how few axes carry most of the information; the biplot shows countries on the first two axes with each original feature as an arrow (same direction = correlated).')}
          <div class="grid g21"><div class="card">${ha}</div><div><div class="grid" style="gap:12px">${kpi('Components for 95% variance', `${r.n95} of ${r.ev.length}`)}${kpi('PC1 + PC2 together', pct(r.ev[0] + r.ev[1], 0))}</div></div></div>
          <div class="section">Biplot</div><div class="card">${hb}</div>${note('PC1 is a "development" axis: life expectancy, sanitation, physicians and GDP point one way; infant mortality and birth rate the other.')}
          <div class="section">Feature loadings</div>${table([{ k: 'feature', label: 'Feature' }, { k: 'pc1', label: 'PC1', d: 2 }, { k: 'pc2', label: 'PC2', d: 2 }], r.loadings)}
          <div class="section">LDA - the supervised cousin</div>${note('PCA ignores labels and maximises variance. <b>LDA</b> uses the income-group labels and picks axes that best <i>separate</i> them.')}<div class="card">${hc}</div>`;
        const lab = r.ev.map((_, i) => 'PC' + (i + 1));
        plot(a, [{ type: 'bar', x: lab, y: r.ev, name: 'variance explained', marker: { color: CY } }, { x: lab, y: r.cum, name: 'cumulative', mode: 'lines+markers', line: { color: PK, width: 3 } }], { title: 'Scree plot', yaxis: { tickformat: '.0%' } });
        const P = r.points, tr = INCOME_ORDER.map(g => { const ix = P.income.map((x, i) => x === g ? i : -1).filter(i => i >= 0); return { type: 'scattergl', mode: 'markers', name: g, x: ix.map(i => P.pc1[i]), y: ix.map(i => P.pc2[i]), text: ix.map(i => P.country[i]), marker: { color: INCOME[g], size: 8, opacity: .8 }, hovertemplate: '<b>%{text}</b><extra></extra>' }; });
        const ann = []; r.loadings.forEach(o => { ann.push({ x: o.pc1 * 5, y: o.pc2 * 5, ax: 0, ay: 0, xref: 'x', yref: 'y', axref: 'x', ayref: 'y', showarrow: true, arrowhead: 2, arrowcolor: '#e2e8f0', arrowwidth: 1.5 }, { x: o.pc1 * 5.5, y: o.pc2 * 5.5, text: o.feature, showarrow: false, font: { size: 10, color: '#cbd5e1' } }); });
        plot(b, tr, { annotations: ann, xaxis: { title: { text: 'PC1' } }, yaxis: { title: { text: 'PC2' } } });
        const L = r.lda; plot(c, INCOME_ORDER.map(g => { const ix = L.income.map((x, i) => x === g ? i : -1).filter(i => i >= 0); return { type: 'scattergl', mode: 'markers', name: g, x: ix.map(i => L.x[i]), y: ix.map(i => L.y[i]), text: ix.map(i => L.country[i]), marker: { color: INCOME[g], size: 8, opacity: .8 }, hovertemplate: '<b>%{text}</b><extra></extra>' }; }), { xaxis: { title: { text: 'LD1' } }, yaxis: { title: { text: 'LD2' } } });
      } },
      { label: 'Anomaly detection', controls: [{ id: 'cont', label: 'Contamination (% anomalies)', type: 'range', min: .5, max: 5, step: .5, value: 1.5, fmt: v => (+v).toFixed(1) + '%' }, { id: 'country', label: 'Noise reduction: country', type: 'select', options: META.country_list, value: META.country_list.includes('Rwanda') ? 'Rwanda' : META.country_list[0] }, { id: 'win', label: 'Rolling-median window', type: 'range', min: 3, max: 11, step: 2, value: 5 }],
      render: async (v, el) => {
        const r = await api('disc/anomaly', { cont: v.cont, country: v.country, win: v.win }); const [a, ha] = pdiv('tall'), [b, hb] = pdiv();
        el.innerHTML = `${note('<b>Isolation Forest</b> isolates points with random cuts: a weird point is separated from the rest in very few cuts. Red dots are the most isolated country-years - look for wars, genocides, epidemics and data errors.')}<div class="card">${ha}</div>
          <div class="section">${r.n} anomalous country-years - most extreme first</div>${table([{ k: 'country', label: 'Country' }, { k: 'year', label: 'Year', f: x => x }, { k: 'life_expectancy', label: 'Life exp.', d: 1 }, { k: 'infant_mortality_per_1000', label: 'Infant mort.', d: 1 }, { k: 'death_rate_per_1000', label: 'Death rate', d: 1 }, { k: 'score', label: 'Anomaly score', d: 2 }], r.top)}
          <div class="section">Noise reduction - smooth a series and flag points far from the trend</div><div class="card">${hb}</div>`;
        const s = r.scatter, T = [false, true].map(f => { const ix = s.anomaly.map((x, i) => x === f ? i : -1).filter(i => i >= 0); return { type: 'scattergl', mode: 'markers', name: f ? 'anomaly' : 'normal', x: ix.map(i => s.x[i]), y: ix.map(i => s.y[i]), text: ix.map(i => `${s.country[i]} ${s.year[i]}`), marker: { color: f ? RD : GREY, size: f ? 8 : 5, opacity: f ? .95 : .35 }, hovertemplate: '%{text}<extra></extra>' }; });
        plot(a, T, { title: 'Anomalies (red) in wealth vs life-expectancy space', xaxis: { title: { text: 'log GDP per capita' } }, yaxis: { title: { text: 'Life expectancy' } } });
        const S_ = r.series, fi = S_.flag.map((x, i) => x ? i : -1).filter(i => i >= 0);
        plot(b, [{ x: S_.year, y: S_.raw, name: 'raw', mode: 'lines+markers', line: { color: GREY } }, { x: S_.year, y: S_.smooth, name: `rolling median (${v.win})`, mode: 'lines', line: { color: GR, width: 3.5 } }, { x: fi.map(i => S_.year[i]), y: fi.map(i => S_.raw[i]), name: 'outlier vs trend', mode: 'markers', marker: { color: RD, size: 13, symbol: 'x' } }], { title: `${r.country}: life expectancy`, yaxis: { title: { text: 'years' } } });
      } },
      { label: 'Association rules (Apriori)', controls: [{ id: 'y0', label: 'From year', type: 'range', min: META.year_min, max: META.year_max, value: 2000 }, { id: 'y1', label: 'To year', type: 'range', min: META.year_min, max: META.year_max, value: META.year_max },
        { id: 'support', label: 'min support', type: 'range', min: .02, max: .5, step: .01, value: .08, fmt: v => (+v).toFixed(2) }, { id: 'conf', label: 'min confidence', type: 'range', min: .3, max: 1, step: .05, value: .8, fmt: v => (+v).toFixed(2) },
        { id: 'lift', label: 'min lift', type: 'range', min: 1, max: 3, step: .1, value: 1.3, fmt: v => (+v).toFixed(1) }, { id: 'only', label: 'Only rules ending in infant-mortality / life-exp', type: 'check', value: 1 }],
      render: async (v, el) => {
        const r = await api('disc/apriori', { y0: Math.min(v.y0, v.y1), y1: Math.max(v.y0, v.y1), support: v.support, conf: v.conf, lift: v.lift, only: v.only }); const [a, ha] = pdiv('tall');
        if (!r.rules.length) { el.innerHTML = note('No rules at these thresholds - lower min support / confidence / lift.', 'warn'); return; }
        el.innerHTML = `${note('Each indicator is cut into Low / Mid / High terciles. <b>Support</b> = how common · <b>Confidence</b> = P(then | if) · <b>Lift</b> &gt; 1 = the "if" raises the odds beyond chance. Beware trivial rules (health spend per capita ⇒ GDP): association is not causation - the interesting rules link <i>services</i> to <i>outcomes</i>.')}
          <div class="sub">${r.itemsets} frequent itemsets → <b>${r.total}</b> rules (${r.rules.length} shown)</div><div class="card">${ha}</div><div class="section">Rules</div>${table([{ k: 'rule', label: 'Rule' }, { k: 'support', label: 'Support' }, { k: 'confidence', label: 'Confidence' }, { k: 'lift', label: 'Lift', d: 2 }], r.rules, { max: ['lift'] })}`;
        plot(a, [{ type: 'scatter', mode: 'markers', x: r.rules.map(o => o.support), y: r.rules.map(o => o.confidence), text: r.rules.map(o => o.rule), marker: { size: r.rules.map(o => 8 + o.lift * 4), color: r.rules.map(o => o.lift), colorscale: SEQ, showscale: true, colorbar: { title: { text: 'lift' }, thickness: 10, outlinewidth: 0 }, opacity: .85, line: { color: '#fff', width: .5 } }, hovertemplate: '%{text}<br>support %{x:.3f} · conf %{y:.3f}<extra></extra>' }], { title: 'Rules: support vs confidence (colour = lift)', xaxis: { title: { text: 'support' } }, yaxis: { title: { text: 'confidence' } } });
      } }]
  });
};
