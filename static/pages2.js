/* Trees & Ensembles  and Discovery  */

/* ---- decision tree as SVG; the path of one chosen country-year is highlighted ---- */
function drawTree(t) {
  const W = 246, H = 112, GX = 18, GY = 50; let leaf = 0, maxd = 0;
  const lay = (n, d) => { n.d = d; maxd = Math.max(maxd, d); if (n.left) { lay(n.left, d + 1); lay(n.right, d + 1); n.x = (n.left.x + n.right.x) / 2; } else n.x = leaf++; };
  lay(t, 0);
  const width = leaf * (W + GX) + GX, height = (maxd + 1) * (H + GY) + 10;
  const tint = f => f >= .5 ? `rgba(35,134,91,${.08 + (f - .5) * .5})` : `rgba(162,59,75,${.08 + (.5 - f) * .5})`;
  let out = '', links = '', hot = '';
  const draw = n => {
    const x = GX + n.x * (W + GX), y = 6 + n.d * (H + GY); n.cx = x + W / 2; n.cy = y;
    [n.left, n.right].forEach((c, i) => {
      if (!c) return; draw(c);
      const d = `M${n.cx},${y + H} C${n.cx},${y + H + 22} ${c.cx},${c.cy - 22} ${c.cx},${c.cy}`, on = n.on && c.on;
      const seg = `<path d="${d}" stroke="${on ? OCHRE : '#cbd2d9'}" fill="none" stroke-width="${on ? 3 : 1.2}"/><text x="${(n.cx + c.cx) / 2 + (i ? 8 : -8)}" y="${y + H + 20}" fill="${on ? OCHRE : MUTE}" font-size="13" font-weight="${on ? 600 : 400}" text-anchor="${i ? 'start' : 'end'}">${i ? 'no' : 'yes'}</text>`;
      if (on) hot += seg; else links += seg;
    });
    const head = n.rule ? esc(n.rule) : 'leaf', clr = n.cls === 'good' ? GOOD : TERRA;
    const dir = n.on && n.val != null && n.left ? `<text x="${x + W / 2}" y="${y + 106}" text-anchor="middle" fill="${OCHRE}" font-size="12.5" font-weight="600">this country: ${n.val.toFixed(2)} → ${n.left.on ? 'yes' : 'no'}</text>` : '';
    out += `<g><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="5" fill="${n.on ? '#eff1ed' : '#fff'}" stroke="${n.on ? OCHRE : '#cbd2d9'}" stroke-width="${n.on ? 2.2 : 1}"/><rect x="${x}" y="${y}" width="${W}" height="${H}" rx="5" fill="${tint(n.frac)}"/>
      <text x="${x + W / 2}" y="${y + 24}" text-anchor="middle" fill="${INK}" font-size="14" font-weight="600">${head.length > 34 ? head.slice(0, 33) + '…' : head}</text>
      <text x="${x + W / 2}" y="${y + 46}" text-anchor="middle" fill="${INK2}" font-size="12.5">impurity ${n.impurity.toFixed(3)} · ${n.samples} samples</text>
      <text x="${x + W / 2}" y="${y + 66}" text-anchor="middle" fill="${INK2}" font-size="12.5">not good ${n.value[0]} · good ${n.value[1]}</text>
      <text x="${x + W / 2}" y="${y + 88}" text-anchor="middle" fill="${clr}" font-size="14.5" font-weight="600">${n.cls}${n.more ? '  …' : ''}</text>${dir}</g>`;
  };
  draw(t);
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${links}${hot}${out}</svg>`;
}
function regionTraces(r, z) {
  const tr = [{ type: 'heatmap', x: r.gx, y: r.gy, z, colorscale: REGION_SCALE, zmin: 0, zmax: 1, showscale: false, hoverinfo: 'skip' }];
  [[0, 'not good', TERRA], [1, 'good', GOOD]].forEach(([l, n, c]) => { const ix = r.pts.label.map((x, i) => x === l ? i : -1).filter(i => i >= 0); tr.push(dots(n, ix.map(i => r.pts.x[i]), ix.map(i => r.pts.y[i]), c, .8, 4)); });
  return tr;
}
const regLay = r => ({ xaxis: { title: { text: r.fx }, range: [r.gx[0], r.gx[r.gx.length - 1]] }, yaxis: { title: { text: r.fy }, range: [r.gy[0], r.gy[r.gy.length - 1]] } });

PAGES.trees = root => {
  const FE = pickOpts(META.feature_keys, nice);
  mountPage(root, {
    head: { icon: 'trees', eyebrow: 'Machine learning · Trees and ensembles', title: 'Decisions you can follow', lede: 'Decision trees, support-vector machines and ensembles classify whether a country-year reaches the life-expectancy target. See the path one country takes, the regions each model carves out, and why many trees beat one.' },
    globals: [{ id: 'thr', label: 'Target: life expectancy at least (years)', type: 'range', min: 55, max: 80, value: 70 }],
    tabs: [
      { label: 'Decision tree', controls: [{ id: 'criterion', label: 'Split criterion', type: 'seg', options: ['gini', 'entropy'], value: 'gini' }, { id: 'depth', label: 'Maximum depth', type: 'range', min: 1, max: 20, value: 4 },
        { id: 'ccp', label: 'Pruning strength (ccp_alpha)', type: 'range', min: 0, max: .03, step: .001, value: 0, fmt: v => (+v).toFixed(3) },
        { id: 'country', label: 'Follow this country', type: 'select', options: META.country_list, value: 'Nigeria' }, { id: 'year', label: 'Year', type: 'range', min: META.year_min, max: META.year_max, value: META.year_max - 4 }],
      render: async (v, el) => {
        const r = await api('tree', { thr: v.thr, criterion: v.criterion, depth: v.depth, ccp: v.ccp, country: v.country, year: v.year }), S = r.sample;
        const [a, ha] = pdiv(), [c, hc] = pdiv();
        el.innerHTML = stats(['Train accuracy', fmt(r.train)], ['Test accuracy', fmt(r.test), 'on unseen countries'], ['Leaves', r.leaves], ['Depth used', r.depth])
          + (S ? note(`<b>${esc(S.country)} ${S.year}</b> (life expectancy ${fmt(S.life, 1)}) takes the highlighted path: at each node it answers one question about its own value and goes yes or no, ending in a leaf that says <b>${S.pred_good ? 'good' : 'not good'}</b> (${S.pred_good === S.truly_good ? 'correct' : 'wrong, it is actually ' + (S.truly_good ? 'good' : 'not good')}).`, S.pred_good === S.truly_good ? 'ok' : 'warn') : '')
          + `<div class="treebox">${drawTree(r.tree)}</div><p class="sub" style="margin-top:6px">Top three levels shown. Shading shows the share of "good" country-years in each node.</p>`
          + `<div class="grid g2" style="margin-top:20px">${fig(ha, 'Importance = total impurity reduction a feature achieves across all its splits. Wealth and the number of physicians dominate.')}${fig(hc, 'Pruning removes weak branches. Training accuracy falls as the tree shrinks, while test accuracy peaks at a moderate penalty; choose that point.')}</div>`;
        plot(a, [{ type: 'bar', orientation: 'h', x: r.importance.map(o => o.value), y: r.importance.map(o => o.feature), marker: { color: BURG } }], { margin: { l: 170 }, xaxis: { title: { text: 'Importance' } } });
        plot(c, [{ x: r.prune.map(o => o.alpha), y: r.prune.map(o => o.train), name: 'training', mode: 'lines+markers', line: { width: 2.2, color: SLATE }, marker: { size: 4 } }, { x: r.prune.map(o => o.alpha), y: r.prune.map(o => o.test), name: 'test', mode: 'lines+markers', line: { width: 2.2, color: TERRA }, marker: { size: 4 }, text: r.prune.map(o => o.leaves + ' leaves'), hovertemplate: 'penalty %{x:.4f}<br>accuracy %{y:.3f}<br>%{text}<extra></extra>' }], { xaxis: { title: { text: 'Pruning penalty (larger = smaller tree)' } }, yaxis: { title: { text: 'Accuracy' } } });
      } },
      { label: 'Feature space', controls: [{ id: 'fx', label: 'x-axis feature', type: 'select', options: FE, value: 'log_gdp_per_capita' }, { id: 'fy', label: 'y-axis feature', type: 'select', options: FE, value: 'physicians_per_1000' }, { id: 'depth', label: 'Maximum depth', type: 'range', min: 1, max: 14, value: 3 }],
      render: async (v, el) => {
        const r = await api('regions', { thr: v.thr, fx: v.fx, fy: v.fy, depth: v.depth }); const [a, ha] = pdiv('tall'); const over = r.acc_dt_train - r.acc_dt > .06;
        el.innerHTML = stats(['Depth', r.depth], ['Train accuracy', fmt(r.acc_dt_train), 'two features'], ['Test accuracy', fmt(r.acc_dt), over ? 'gap suggests overfitting' : '', over ? 'down' : ''])
          + fig(ha, '<b>A tree cuts the plane into rectangles.</b> Every split is a straight, axis-parallel line, so each region is a box that predicts its majority class (green: good, red: not good). Depth 1 is a single cut; deeper trees draw smaller boxes that begin to trace individual points.');
        plot(a, regionTraces(r, r.dt_z), regLay(r));
      } },
      { label: 'Support vector machine', controls: [{ id: 'kernel', label: 'Kernel', type: 'seg', options: ['linear', 'poly', 'rbf', 'sigmoid'], value: 'linear' }, { id: 'logC', label: 'Margin softness, log10(C)', type: 'range', min: -2, max: 3, step: .5, value: 0, fmt: v => (+v).toFixed(1) },
        { id: 'loggamma', label: 'log10(gamma)', type: 'range', min: -3, max: 1, step: .5, value: -1, fmt: v => (+v).toFixed(1), show: s => s.kernel !== 'linear' }, { id: 'degree', label: 'Polynomial degree', type: 'range', min: 2, max: 5, value: 3, show: s => s.kernel === 'poly' },
        { id: 'fx', label: 'x-axis feature', type: 'select', options: FE, value: 'log_gdp_per_capita' }, { id: 'fy', label: 'y-axis feature', type: 'select', options: FE, value: 'basic_sanitation_pct' }],
      render: async (v, el) => {
        const r = await api('svm', { thr: v.thr, kernel: v.kernel, logC: v.logC, loggamma: v.loggamma, degree: v.degree, fx: v.fx, fy: v.fy }); const [a, ha] = pdiv('tall');
        el.innerHTML = stats(['Support vectors', r.n_sv, `${pct(r.n_sv / r.n, 0)} of ${r.n} training points`], ['Accuracy, these 2 features', fmt(r.acc2)], ['Accuracy, all 10 features', fmt(r.acc_all)])
          + fig(ha, '<b>The solid line is the decision boundary; dashed lines are the margin.</b> Circled points, the support vectors, are the only ones that define the boundary: all others could be removed without changing it. A small C gives a wide, forgiving margin with many support vectors; a large C narrows the margin to fit every point. Kernels bend the boundary.');
        const lv = (l, dash, w) => ({ type: 'contour', x: r.x, y: r.y, z: r.z, contours: { start: l, end: l, size: 1, coloring: 'lines' }, colorscale: [[0, INK], [1, INK]], line: { color: INK, width: w, dash }, showscale: false, hoverinfo: 'skip', showlegend: false });
        const tr = [{ type: 'contour', x: r.x, y: r.y, z: r.z, colorscale: REGION_SCALE, zmin: -3, zmax: 3, contours: { coloring: 'heatmap', start: -3, end: 3, size: .5 }, line: { width: 0 }, showscale: false, hoverinfo: 'skip' }, lv(-1, 'dash', 1.2), lv(0, 'solid', 2.6), lv(1, 'dash', 1.2)];
        [[1, 'good', GOOD], [0, 'not good', TERRA]].forEach(([l, n, c]) => { const ix = r.pts.label.map((x, i) => x === l ? i : -1).filter(i => i >= 0); tr.push(dots(n, ix.map(i => r.pts.x[i]), ix.map(i => r.pts.y[i]), c, .65, 4)); });
        tr.push({ type: 'scatter', mode: 'markers', name: 'support vectors', x: r.sv.x, y: r.sv.y, marker: { symbol: 'circle-open', size: 10, color: INK, line: { color: INK, width: 1.2 } }, hoverinfo: 'skip' });
        plot(a, tr, { xaxis: { title: { text: r.fx }, range: [r.x[0], r.x[r.x.length - 1]] }, yaxis: { title: { text: r.fy }, range: [r.y[0], r.y[r.y.length - 1]] } });
      } },
      { label: 'Ensembles', controls: [{ id: 'fx', label: 'x-axis feature', type: 'select', options: FE, value: 'log_gdp_per_capita' }, { id: 'fy', label: 'y-axis feature', type: 'select', options: FE, value: 'physicians_per_1000' }, { id: 'depth', label: 'Single-tree depth', type: 'range', min: 2, max: 16, value: 10 }],
      render: async (v, el) => {
        el.innerHTML = note('Training seven ensembles (about 30 seconds the first time).'); const [r, g] = await Promise.all([api('ens', { thr: v.thr }), api('regions', { thr: v.thr, fx: v.fx, fy: v.fy, depth: v.depth, rf: 1 })]);
        const [p1, h1] = pdiv('tall'), [p2, h2] = pdiv('tall'), [a, ha] = pdiv('tall'); const FC = { single: SLATE, bagging: BURG, boosting: OCHRE, combining: PLUM }, rows = [...r.rows].sort((x, y) => x.test - y.test);
        el.innerHTML = section('One tree against a forest', 'The same two features, the same data.') + `<div class="grid g2">${fig(h1, `<b>Single tree, depth ${g.depth}.</b> Jagged boxes that chase individual points: ${fmt(g.acc_dt_train)} on training data but ${fmt(g.acc_dt)} on new countries.`)}${fig(h2, `<b>Random forest, 80 trees.</b> Averaging trees grown on random subsamples gives a smoother boundary and ${fmt(g.acc_rf)} on new countries.`)}</div>`
          + section('Seven ensembles on all ten features', 'Bagging averages many models to cut variance, boosting fits models in sequence to cut bias, and stacking or voting combines different learners.') + fig(ha, 'Each row is one model: the hollow marker is training accuracy, the filled marker is test accuracy. A long line between them means overfitting; the best models keep it short.');
        plot(p1, regionTraces(g, g.dt_z), regLay(g)); plot(p2, regionTraces(g, g.rf_z), regLay(g));
        plot(a, [{ type: 'scatter', mode: 'lines', x: rows.flatMap(o => [o.train, o.test, null]), y: rows.flatMap(o => [o.model, o.model, null]), line: { color: '#cbd2d9', width: 2 }, hoverinfo: 'skip', showlegend: false },
          { type: 'scatter', mode: 'markers', name: 'training accuracy', x: rows.map(o => o.train), y: rows.map(o => o.model), marker: { symbol: 'circle-open', size: 11, color: rows.map(o => FC[o.family]), line: { width: 2, color: rows.map(o => FC[o.family]) } } },
          { type: 'scatter', mode: 'markers+text', name: 'test accuracy', x: rows.map(o => o.test), y: rows.map(o => o.model), text: rows.map(o => fmt(o.test)), textposition: 'middle left', textfont: { size: 13, color: INK2 }, marker: { size: 11, color: rows.map(o => FC[o.family]) } }],
          { xaxis: { title: { text: 'Accuracy' }, range: [.82, 1.0] }, margin: { l: 200 } });
      } },
      { label: 'Tuning', controls: [{ id: 'mode', label: 'Search strategy', type: 'seg', options: [['grid', 'Grid search (decision tree)'], ['random', 'Randomised search (random forest)']], value: 'grid' }],
      render: async (v, el) => {
        el.innerHTML = `<p class="sub" style="margin-bottom:12px">Hyper-parameters are chosen by cross-validation on whole held-out countries, never on the test set.</p><button class="btn primary" id="tn-go">Run search</button><div id="tn-out" style="margin-top:18px"></div>`;
        $('#tn-go', el).onclick = async e => {
          e.target.disabled = true; e.target.textContent = 'Searching'; const out = $('#tn-out', el); out.innerHTML = note('Running cross-validated search.');
          try {
            const r = await api('tune', { thr: v.thr, mode: v.mode }); const [h, hh] = pdiv();
            out.innerHTML = stats(['Best parameters', `<span style="font-size:15px">${esc(JSON.stringify(r.best))}</span>`], ['Default model, test accuracy', fmt(r.default_acc)], ['Tuned model, test accuracy', fmt(r.tuned_acc), `${r.tuned_acc - r.default_acc >= 0 ? '+' : ''}${fmt(r.tuned_acc - r.default_acc)} vs default`, r.tuned_acc >= r.default_acc ? 'up' : 'down'])
              + `<div style="margin-top:18px">${r.heat ? fig(hh, 'Cross-validated accuracy for every combination tried. The brightest cell is the winner.') : table([{ k: 'rank', label: 'Rank' }, { k: 'mean', label: 'CV accuracy', num: 1 }, { k: 'std', label: 'Std', num: 1 }, { k: 'params', label: 'Parameters' }], r.table, { max: ['mean'] })}</div>`;
            if (r.heat) plot(h, [{ type: 'heatmap', x: r.heat.x.map(String), y: r.heat.y.map(String), z: r.heat.z, colorscale: SEQ, text: r.heat.z.map(row => row.map(z => z.toFixed(3))), texttemplate: '%{text}', colorbar: { thickness: 10, outlinewidth: 0, title: { text: 'CV accuracy' } } }], { xaxis: { title: { text: 'Minimum samples per leaf' }, type: 'category' }, yaxis: { title: { text: 'Maximum depth' }, type: 'category' } });
          } catch (err) { out.innerHTML = note('Search failed: ' + esc(err.message), 'bad'); }
          e.target.disabled = false; e.target.textContent = 'Run search';
        };
      } }]
  });
};

/* ======================================================================= DISCOVERY */
const clusterColor = l => l === '-1' ? MUTE : COLORS[(+l) % COLORS.length];
const dendroColor = c => c === 'C0' ? '#9aa6b6' : COLORS[(+c.slice(1) - 1) % COLORS.length];
PAGES.disc = root => {
  mountPage(root, {
    head: { icon: 'disc', eyebrow: 'Machine learning · Unsupervised learning', title: 'Structure without labels', lede: 'No target is given here. The algorithms group countries, reduce many indicators to a few axes, flag outliers and mine if-then rules on their own.' },
    globals: [{ id: 'year', label: 'Snapshot year', type: 'range', min: META.year_min, max: META.year_max, value: META.year_max - 2 }],
    tabs: [
      { label: 'Clustering', controls: [{ id: 'algo', label: 'Algorithm', type: 'seg', options: [['kmeans', 'K-means'], ['hier', 'Hierarchical'], ['dbscan', 'DBSCAN']], value: 'kmeans' },
        { id: 'k', label: 'Clusters (k)', type: 'range', min: 2, max: 10, value: 4, show: s => s.algo !== 'dbscan' }, { id: 'linkage', label: 'Linkage', type: 'select', options: ['ward', 'complete', 'average', 'single'], value: 'ward', show: s => s.algo === 'hier' },
        { id: 'region', label: 'Dendrogram region', type: 'select', options: META.regions, value: META.regions.includes('South Asia') ? 'South Asia' : META.regions[0], show: s => s.algo === 'hier' },
        { id: 'eps', label: 'Neighbourhood radius (eps)', type: 'range', min: .3, max: 3, step: .05, value: 1.2, fmt: v => (+v).toFixed(2), show: s => s.algo === 'dbscan' }, { id: 'ms', label: 'Minimum points (min_samples)', type: 'range', min: 2, max: 15, value: 4, show: s => s.algo === 'dbscan' }],
      render: async (v, el) => {
        const r = await api('disc/cluster', { algo: v.algo, k: v.k, linkage: v.linkage, region: v.region, eps: v.eps, ms: v.ms, year: v.year });
        const [a, ha] = pdiv('short'), [b, hb] = pdiv('short'), [c, hc] = pdiv('tall'), [d, hd] = pdiv('tall'), [e, he] = pdiv('tall');
        const P = r.points, cl = [...new Set(P.cluster)].sort((x, y) => +x - +y);
        const intro = { kmeans: 'K-means places k centres, assigns every country to its nearest centre, moves each centre to the mean of its countries, and repeats until nothing changes. The crosses below are the final centroids.', hier: 'Hierarchical clustering starts with every country alone and repeatedly merges the two closest groups. The dendrogram is that merge history; cutting it with a horizontal line yields k clusters.', dbscan: 'DBSCAN grows clusters from dense regions. A point is core if at least min_samples points lie within eps; border points are near a core point; the rest are noise. No k is needed and clusters can take any shape.' }[v.algo];
        el.innerHTML = `<p class="sub" style="max-width:80ch">${intro}</p>`
          + (r.elbow ? `<div class="grid g2" style="margin-top:14px">${fig(ha, 'Inertia falls as k grows; look for the elbow where it stops dropping quickly.')}${fig(hb, 'Silhouette measures how well separated the clusters are; higher is better.')}</div>` : '')
          + (r.dendro ? `<div style="margin-top:14px">${fig(hc, `Merge history for ${esc(r.dendro.region)}. The dashed line cuts the tree into ${r.dendro.k} clusters; branches below it are coloured by cluster, single countries above it stand alone.`)}</div>` : '')
          + `<div style="margin-top:14px">${stats(r.inertia != null && ['Inertia', fmt(r.inertia, 0), 'within-cluster squared distance'], r.silhouette != null && ['Silhouette', fmt(r.silhouette), 'higher is better'], r.kinds && ['Core · border · noise', `${r.kinds.core} · ${r.kinds.border} · ${r.kinds.noise}`, `${r.nclusters} clusters found`])}</div>`
          + `<div class="grid g2" style="margin-top:14px">${fig(hd, `Countries projected onto the first two principal components (together ${((r.evr[0] + r.evr[1]) * 100).toFixed(0)}% of the variance).`)}${fig(he, 'The same clusters on the map: they largely follow income and region without being told either.')}</div>`
          + section('What each cluster is', 'Mean values per cluster: use them to name the groups.') + table([{ k: 'cluster', label: 'Cluster' }, { k: 'life_expectancy', label: 'Life expectancy', d: 1 }, { k: 'infant_mortality_per_1000', label: 'Infant mortality', d: 1 }, { k: 'gdp_per_capita_usd', label: 'GDP per person', d: 0 }, { k: 'basic_sanitation_pct', label: 'Sanitation %', d: 1 }, { k: 'physicians_per_1000', label: 'Physicians /1000', d: 1 }, { k: 'countries', label: 'Countries', f: x => x, num: 1 }], r.profiles);
        if (r.elbow) {
          plot(a, [{ x: r.elbow.map(o => o.k), y: r.elbow.map(o => o.inertia), mode: 'lines+markers', line: { width: 2.2, color: BURG } }], { xaxis: { dtick: 1, title: { text: 'k' } }, yaxis: { title: { text: 'Inertia' } }, shapes: [vline(v.k, OCHRE)] });
          plot(b, [{ x: r.elbow.map(o => o.k), y: r.elbow.map(o => o.silhouette), mode: 'lines+markers', line: { width: 2.2, color: TEAL } }], { xaxis: { dtick: 1, title: { text: 'k' } }, yaxis: { title: { text: 'Silhouette' } }, shapes: [vline(v.k, OCHRE)] });
        }
        if (r.dendro) { const D = r.dendro; plot(c, D.icoord.map((x, i) => ({ x, y: D.dcoord[i], mode: 'lines', line: { color: dendroColor(D.colors[i]), width: 2.2 }, hoverinfo: 'skip', showlegend: false })),
          { xaxis: { tickvals: D.labels.map((_, i) => 10 * i + 5), ticktext: D.labels, tickangle: -60, showgrid: false }, yaxis: { title: { text: 'Merge distance' } }, margin: { b: 130 }, shapes: D.cut != null ? [hline(D.cut, OCHRE, 'dash', 1.6)] : [], annotations: D.cut != null ? [{ xref: 'paper', x: 1, y: D.cut, text: `cut = ${D.cut.toFixed(2)}`, showarrow: false, xanchor: 'right', yanchor: 'bottom', font: { color: OCHRE } }] : [] }); }
        const tr = [];
        if (v.algo === 'dbscan') [['core', 'circle', 9, .9], ['border', 'circle', 6, .6], ['noise', 'x', 9, .9]].forEach(([kd, sym, sz, op]) => { const ix = P.kind.map((x, i) => x === kd ? i : -1).filter(i => i >= 0); tr.push({ type: 'scattergl', mode: 'markers', name: `${kd} (${ix.length})`, x: ix.map(i => P.pc1[i]), y: ix.map(i => P.pc2[i]), text: ix.map(i => `${P.country[i]} · cluster ${P.cluster[i]}`), marker: { symbol: sym, size: sz, opacity: op, color: ix.map(i => kd === 'noise' ? MUTE : clusterColor(P.cluster[i])), line: { color: '#fff', width: kd === 'noise' ? 2 : .5 } }, hovertemplate: '<b>%{text}</b><extra></extra>' }); });
        else cl.forEach(l => { const ix = P.cluster.map((x, i) => x === l ? i : -1).filter(i => i >= 0); tr.push({ type: 'scattergl', mode: 'markers', name: 'cluster ' + l, x: ix.map(i => P.pc1[i]), y: ix.map(i => P.pc2[i]), text: ix.map(i => P.country[i]), marker: { color: clusterColor(l), size: 9, opacity: .8, line: { color: '#fff', width: .6 } }, hovertemplate: '<b>%{text}</b><extra></extra>' }); });
        if (r.centroids) tr.push({ type: 'scatter', mode: 'markers+text', name: 'centroids', x: r.centroids.pc1, y: r.centroids.pc2, text: r.centroids.size.map((n, i) => `${i} (${n})`), textposition: 'top center', textfont: { color: INK, size: 14 }, marker: { symbol: 'x', size: 16, color: r.centroids.pc1.map((_, i) => clusterColor(String(i))), line: { color: INK, width: 2.5 } } });
        plot(d, tr, { xaxis: { title: { text: 'Principal component 1' } }, yaxis: { title: { text: 'Principal component 2' } } });
        const n = cl.length, idx = Object.fromEntries(cl.map((l, i) => [l, i])), cs = [].concat(...cl.map((l, i) => [[i / n, clusterColor(l)], [(i + 1) / n, clusterColor(l)]]));
        plot(e, [{ type: 'choropleth', locations: P.iso3, z: P.cluster.map(l => idx[l] + .5), zmin: 0, zmax: n, colorscale: cs, showscale: false, text: P.country, customdata: P.cluster, hovertemplate: '<b>%{text}</b><br>cluster %{customdata}<extra></extra>', marker: { line: { color: '#eff1ed', width: .5 } } }], { margin: { l: 0, r: 0, t: 10, b: 0 }, geo: { bgcolor: 'rgba(0,0,0,0)', showframe: false, showcoastlines: false, projection: { type: 'natural earth' }, landcolor: '#e3e7eb', showcountries: false } });
      } },
      { label: 'Principal components', render: async (v, el) => {
        const r = await api('disc/pca', { year: v.year }); const [a, ha] = pdiv(), [b, hb] = pdiv('tall');
        el.innerHTML = stats(['Components for 95% of variance', `${r.n95} of ${r.ev.length}`], ['First two components', pct(r.ev[0] + r.ev[1], 0), 'of all variance']) + `<div class="grid g12" style="margin-top:18px">${fig(ha, 'Share of the data\'s variance carried by each component. A few axes hold most of the information in thirteen indicators.')}${fig(hb, '<b>PC1 is a development axis.</b> Life expectancy, sanitation, physicians and income point one way; infant mortality and birth rate point the other. Arrows pointing in the same direction are correlated indicators.')}</div>`;
        const lab = r.ev.map((_, i) => 'PC' + (i + 1));
        plot(a, [{ type: 'bar', x: lab, y: r.ev, name: 'per component', marker: { color: BURG } }, { x: lab, y: r.cum, name: 'cumulative', mode: 'lines+markers', line: { color: OCHRE, width: 2.2 } }], { yaxis: { tickformat: '.0%' }, margin: { t: 44 } });
        const P = r.points, tr = INCOME_ORDER.map(g => { const ix = P.income.map((x, i) => x === g ? i : -1).filter(i => i >= 0); return { type: 'scattergl', mode: 'markers', name: g, x: ix.map(i => P.pc1[i]), y: ix.map(i => P.pc2[i]), text: ix.map(i => P.country[i]), marker: { color: INCOME[g], size: 8, opacity: .75 }, hovertemplate: '<b>%{text}</b><extra></extra>' }; });
        const ann = []; r.loadings.forEach(o => { ann.push({ x: o.pc1 * 5, y: o.pc2 * 5, ax: 0, ay: 0, xref: 'x', yref: 'y', axref: 'x', ayref: 'y', showarrow: true, arrowhead: 2, arrowsize: .9, arrowcolor: INK2, arrowwidth: 1.3 }, { x: o.pc1 * 5.6, y: o.pc2 * 5.6, text: o.feature, showarrow: false, font: { size: 12.5, color: INK2 } }); });
        plot(b, tr, { annotations: ann, xaxis: { title: { text: 'PC1' } }, yaxis: { title: { text: 'PC2' } } });
      } },
      { label: 'Anomalies', controls: [{ id: 'cont', label: 'Expected anomalies', type: 'range', min: .5, max: 5, step: .5, value: 1.5, fmt: v => (+v).toFixed(1) + '%' }, { id: 'country', label: 'Series to smooth', type: 'select', options: META.country_list, value: META.country_list.includes('Rwanda') ? 'Rwanda' : META.country_list[0] }, { id: 'win', label: 'Smoothing window (years)', type: 'range', min: 3, max: 11, step: 2, value: 5 }],
      render: async (v, el) => {
        const r = await api('disc/anomaly', { cont: v.cont, country: v.country, win: v.win }); const [a, ha] = pdiv('tall'), [b, hb] = pdiv();
        el.innerHTML = fig(ha, `<b>Isolation Forest</b> separates points with random cuts; unusual points are isolated in very few cuts. The ${r.n} highlighted country-years are the most isolated: look for wars, genocides, epidemics and data errors.`)
          + section('Most extreme country-years') + table([{ k: 'country', label: 'Country' }, { k: 'year', label: 'Year', f: x => x }, { k: 'life_expectancy', label: 'Life expectancy', d: 1 }, { k: 'infant_mortality_per_1000', label: 'Infant mortality', d: 1 }, { k: 'death_rate_per_1000', label: 'Death rate', d: 1 }, { k: 'score', label: 'Anomaly score', d: 2 }], r.top.slice(0, 10))
          + section('Noise reduction', 'A rolling median shows the trend; points far from it are flagged.') + fig(hb);
        const s = r.scatter, T = [false, true].map(f => { const ix = s.anomaly.map((x, i) => x === f ? i : -1).filter(i => i >= 0); return { type: 'scattergl', mode: 'markers', name: f ? 'anomaly' : 'normal', x: ix.map(i => s.x[i]), y: ix.map(i => s.y[i]), text: ix.map(i => `${s.country[i]} ${s.year[i]}`), marker: { color: f ? TERRA : '#cbd2d9', size: f ? 8 : 5, opacity: f ? .95 : .5 }, hovertemplate: '%{text}<extra></extra>' }; });
        plot(a, T, { xaxis: { title: { text: 'log GDP per person' } }, yaxis: { title: { text: 'Life expectancy (years)' } } });
        const S_ = r.series, fi = S_.flag.map((x, i) => x ? i : -1).filter(i => i >= 0);
        plot(b, [{ x: S_.year, y: S_.raw, name: 'reported', mode: 'lines+markers', line: { color: '#cbd2d9', width: 1.5 }, marker: { size: 4 } }, { x: S_.year, y: S_.smooth, name: `rolling median (${v.win} yr)`, mode: 'lines', line: { color: BURG, width: 2.8 } }, { x: fi.map(i => S_.year[i]), y: fi.map(i => S_.raw[i]), name: 'flagged', mode: 'markers', marker: { color: TERRA, size: 11, symbol: 'x' } }], { title: `${r.country}: life expectancy`, yaxis: { title: { text: 'Years' } } });
      } },
      { label: 'Association rules', controls: [{ id: 'y0', label: 'From year', type: 'range', min: META.year_min, max: META.year_max, value: 2000 }, { id: 'y1', label: 'To year', type: 'range', min: META.year_min, max: META.year_max, value: META.year_max },
        { id: 'support', label: 'Minimum support', type: 'range', min: .02, max: .5, step: .01, value: .08, fmt: v => (+v).toFixed(2) }, { id: 'conf', label: 'Minimum confidence', type: 'range', min: .3, max: 1, step: .05, value: .8, fmt: v => (+v).toFixed(2) }, { id: 'lift', label: 'Minimum lift', type: 'range', min: 1, max: 3, step: .1, value: 1.3, fmt: v => (+v).toFixed(1) }],
      render: async (v, el) => {
        const r = await api('disc/apriori', { y0: Math.min(v.y0, v.y1), y1: Math.max(v.y0, v.y1), support: v.support, conf: v.conf, lift: v.lift, only: 1 });
        if (!r.rules.length) { el.innerHTML = note('No rules at these thresholds. Lower the minimum support, confidence or lift.', 'warn'); return; }
        const mx = Math.max(...r.rules.map(o => o.lift));
        el.innerHTML = `<p class="sub" style="max-width:80ch;margin-bottom:12px">Apriori finds combinations that occur together. Each indicator is split into low, mid and high terciles. <b>Support</b> is how common a pattern is, <b>confidence</b> is how often "then" follows "if", and <b>lift</b> above 1 means "if" raises the odds beyond chance. ${r.itemsets} frequent patterns gave ${r.total} rules; those ending in infant mortality or life expectancy are shown.</p>`
          + table([{ k: 'rule', label: 'If … then …' }, { k: 'support', label: 'Support', num: 1 }, { k: 'confidence', label: 'Confidence', num: 1 }, { k: 'lift', label: 'Lift', num: 1, f: x => `<span style="display:inline-block;width:${Math.round(x / mx * 70)}px;height:6px;background:var(--good);border-radius:2px;margin-right:8px;vertical-align:middle"></span>${x.toFixed(2)}` }], r.rules.slice(0, 25))
          + note('Treat these as associations, not causes. Some rules are trivial (spending per person follows income); the informative ones link services such as sanitation or physicians to outcomes.');
      } }]
  });
};
