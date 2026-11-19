/* Regression Lab (Unit 3) and Classification Lab (Unit 4): every algorithm gets its OWN signature picture. */
const GREY = '#64748b', CY = '#22d3ee', PK = '#f472b6', GR = '#34d399', RD = '#fb7185', GOLD = '#fbbf24', VI = '#a78bfa';
const dots = (name, x, y, color, op = .6, size = 6, extra = {}) => ({ type: 'scattergl', mode: 'markers', name, x, y, marker: { color, opacity: op, size }, ...extra });
const lineTr = (name, x, y, color, w = 3, extra = {}) => ({ type: 'scatter', mode: 'lines', name, x, y, line: { color, width: w }, ...extra });
const kpis4 = (a, b, c, d) => `<div class="grid g4">${[a, b, c, d].map(k => kpi(...k)).join('')}</div>`;

/* ======================================================================= REGRESSION */
PAGES.reg = root => {
  const FE = pickOpts(META.feature_keys, nice);
  const MODELS = [['Simple linear (1 feature)', 'Simple linear'], ['Polynomial (1 feature)', 'Polynomial'], ['Multiple linear', 'Multiple linear'], ['Ridge', 'Ridge'], ['Lasso', 'Lasso'], ['Elastic Net', 'Elastic Net'], ['KNN regressor', 'KNN regressor'], ['Decision-tree regressor', 'Decision-tree regressor']];
  const one = s => /^(Simple|Polynomial|KNN|Decision)/.test(s.model), reg = s => ['Ridge', 'Lasso', 'Elastic Net'].includes(s.model);
  mountPage(root, {
    hero: { badge: 'Unit 3 · Regression', title: 'Regression Lab', sub: 'Pick an algorithm and see its own signature picture: the fitted line with its errors, the polynomial curve, the neighbours KNN averages, the splits of a regression tree, or how Ridge / Lasso shrink the coefficients.', chips: ['MSE · RMSE · MAE · R²', 'line · curve · neighbours · splits · shrinkage', 'K-fold CV'] },
    globals: [
      { id: 'target', label: 'Target to predict', type: 'select', options: [['life_expectancy', 'Life expectancy (years)'], ['infant_mortality_per_1000', 'Infant mortality (per 1000)']], value: 'life_expectancy' },
      { id: 'model', label: 'Algorithm', type: 'select', options: MODELS, value: 'Simple linear (1 feature)' },
      { id: 'feature', label: 'Input feature x', type: 'select', options: FE, value: 'log_gdp_per_capita', show: one },
      { id: 'degree', label: 'Polynomial degree', type: 'range', min: 1, max: 12, value: 3, show: s => s.model.startsWith('Polynomial') },
      { id: 'k', label: 'k (neighbours averaged)', type: 'range', min: 1, max: 60, value: 7, show: s => s.model.startsWith('KNN') },
      { id: 'qpct', label: 'Query x (percentile of the data)', type: 'range', min: 2, max: 98, value: 30, show: s => s.model.startsWith('KNN') },
      { id: 'depth', label: 'max_depth', type: 'range', min: 1, max: 12, value: 3, show: s => s.model.startsWith('Decision') },
      { id: 'logalpha', label: 'log10(alpha)  - regularisation strength', type: 'range', min: -3, max: 2, step: .1, value: -.5, fmt: v => (+v).toFixed(1), show: reg },
      { id: 'l1', label: 'l1_ratio (0 = Ridge, 1 = Lasso)', type: 'range', min: .05, max: .95, step: .05, value: .5, fmt: v => (+v).toFixed(2), show: s => s.model === 'Elastic Net' }],
    tabs: [
      { label: 'The fit', render: async (v, el) => {
        const r = await api('reg/fit', v), te = r.metrics.test, tr = r.metrics.train;
        const [a, ha] = pdiv('tall'), [b, hb] = pdiv();
        const head = kpis4(['Test R²', fmt(te.R2)], ['Test RMSE', fmt(te.RMSE), 'typical error'], ['Test MAE', fmt(te.MAE)], ['Train R²', fmt(tr.R2), tr.R2 - te.R2 > .08 ? 'gap → overfitting' : 'no big gap', tr.R2 - te.R2 > .08 ? 'down' : 'up']);
        if (r.single) {
          const X = r.feature_label, ttl = { 'Simple linear': `Simple linear regression:  ŷ = b₀ + b₁ · x`, 'Polynomial': `Polynomial regression (degree ${v.degree})`, 'KNN': `KNN regression: ŷ = average of the ${v.k} nearest neighbours`, 'Decision': `Regression tree (depth ${v.depth}): a step function` }[v.model.split(' ')[0] === 'Simple' ? 'Simple linear' : v.model.split(' ')[0]];
          let extra = '', tr_ = [dots('training data', r.train.x, r.train.y, GREY, .22, 4), dots('test data', r.test.x, r.test.y, CY, .55, 6, { text: r.test.country.map((c, i) => `${c} ${r.test.year[i]}`), hovertemplate: '%{text}<br>x %{x:.2f} · y %{y:.1f}<extra></extra>' })];
          const lay = { title: ttl, xaxis: { title: { text: X } }, yaxis: { title: { text: nice(v.target) } }, shapes: [] };
          if (v.model.startsWith('Simple')) {
            const L = r.line, sg = r.segments, sx = [], sy = [];
            sg.x.forEach((x, i) => { sx.push(x, x, null); sy.push(sg.y[i], sg.yhat[i], null); });
            tr_.push({ type: 'scatter', mode: 'lines', x: L.x, y: L.y.map(y => y + r.rmse_test), line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
              { type: 'scatter', mode: 'lines', x: L.x, y: L.y.map(y => y - r.rmse_test), fill: 'tonexty', fillcolor: 'rgba(34,211,238,.10)', line: { width: 0 }, name: `± RMSE band (${fmt(r.rmse_test, 1)})`, hoverinfo: 'skip' },
              { type: 'scatter', mode: 'lines', x: sx, y: sy, line: { color: PK, width: 1.6 }, name: 'residuals: actual − line', hoverinfo: 'skip' });
            extra = `<div class="card latex" style="margin-top:16px">ŷ = ${fmt(r.equation.b0, 2)} ${r.equation.b1 >= 0 ? '+' : '−'} ${fmt(Math.abs(r.equation.b1), 2)} · x<div class="sub" style="font-style:normal;font-family:Inter">x = ${esc(X)}. Least squares picks the line that minimises the sum of the squared pink segments. One unit of x moves the prediction by ${fmt(r.equation.b1, 2)}.</div></div>`;
          }
          if (v.model.startsWith('KNN')) {
            const K = r.knn; lay.shapes.push({ type: 'line', x0: K.qx, x1: K.qx, yref: 'paper', y0: 0, y1: 1, line: { color: '#fff', dash: 'dot', width: 1.5 } });
            tr_.push(dots(`${K.k} nearest neighbours`, K.nx, K.ny, 'rgba(0,0,0,0)', 1, 15, { marker: { symbol: 'circle-open', size: 16, color: GOLD, line: { color: GOLD, width: 2.5 } } }),
              { type: 'scatter', mode: 'markers+text', name: 'prediction', x: [K.qx], y: [K.pred], text: [`ŷ = ${K.pred.toFixed(1)}`], textposition: 'top right', textfont: { color: '#fff', size: 13 }, marker: { symbol: 'star', size: 20, color: PK, line: { color: '#fff', width: 1.5 } } });
            extra = note(`<b>How KNN predicts:</b> at x = ${K.qx.toFixed(2)} (white dotted line) it finds the ${K.k} training points closest in x (gold rings) and returns the <b>mean of their y-values: ${K.pred.toFixed(1)}</b> (pink star). The wiggly curve is that average computed at every x - small k follows noise, large k smooths it. Move <i>Query x</i> and <i>k</i> above.`);
          }
          if (v.model.startsWith('Decision')) { r.tree.splits.forEach(sx => lay.shapes.push({ type: 'line', x0: sx, x1: sx, yref: 'paper', y0: 0, y1: 1, line: { color: 'rgba(167,139,250,.55)', dash: 'dot', width: 1.2 } }));
            extra = note(`<b>How a regression tree predicts:</b> it cuts x at ${r.tree.splits.length} thresholds (violet dotted lines) and predicts the <b>mean y inside each of the ${r.tree.leaves} regions</b> - hence a staircase. Deeper trees = more, narrower steps (overfitting).`); }
          if (v.model.startsWith('Poly')) extra = note(`<b>Degree ${v.degree}:</b> test R² ${fmt(te.R2)} vs train R² ${fmt(tr.R2)}. Use the <i>Polynomial degree</i> tab to see where more flexibility stops helping.`);
          tr_.push(lineTr(v.model.startsWith('KNN') ? `KNN fit (k=${v.k})` : v.model.startsWith('Decision') ? 'tree fit' : v.model.startsWith('Poly') ? `degree-${v.degree} curve` : 'regression line', r.line.x, r.line.y, '#fff', 3.5, v.model.startsWith('Decision') || v.model.startsWith('KNN') ? { line: { color: '#fff', width: 3, shape: v.model.startsWith('Decision') ? 'hv' : 'linear' } } : {}));
          el.innerHTML = `${head}<div class="sub" style="margin:8px 0">${r.n_obs.toLocaleString()} country-years where <b>${esc(X)}</b> was really observed (imputed values are excluded so they don't create fake vertical stripes).</div><div class="card">${ha}</div>${extra}`;
          plot(a, tr_, lay);
        } else {
          const s = r.scatter, c = [...r.coef].sort((x, y) => x.value - y.value), isReg = !!r.coef_ols;
          el.innerHTML = `${head}${isReg && v.model === 'Lasso' ? note(`<b>Lasso</b> has set <b>${r.zeroed}</b> of ${r.coef.length} coefficients <b>exactly to 0</b> - it dropped those features entirely (automatic feature selection).`) : ''}
            <div class="grid g2" style="margin-top:14px"><div class="card">${hb}</div><div class="card">${ha}</div></div>
            ${isReg ? note(`<b>Shrinkage:</b> grey = ordinary least squares, coloured = ${esc(v.model)} at alpha = ${(10 ** v.logalpha).toPrecision(2)}. Bigger alpha pulls every bar toward 0 (Ridge: smoothly, Lasso: some hit 0). The <i>Regularisation path</i> tab shows all alphas.`) : note('Multiple linear regression: one coefficient per feature (all standardised, so bar lengths are comparable). Positive = raises the predicted value.')}`;
          const ols = isReg ? Object.fromEntries(r.coef_ols.map(o => [o.feature, o.value])) : null;
          plot(b, [...(isReg ?[{ type: 'bar', orientation: 'h', name: 'OLS (no penalty)', y: c.map(o => o.feature), x: c.map(o => ols[o.feature]), marker: { color: 'rgba(148,163,184,.45)' } }] : []),
            { type: 'bar', orientation: 'h', name: v.model, y: c.map(o => o.feature), x: c.map(o => o.value), marker: { color: c.map(o => o.value === 0 ? RD : o.value > 0 ? CY : PK) } }], { title: isReg ? `${v.model}: coefficients vs OLS` : 'Coefficients (standardised)', barmode: 'group', margin: { l: 190 } });
          const lo = Math.min(...s.actual, ...s.pred), hi = Math.max(...s.actual, ...s.pred);
          plot(a, [...byIncome(s, (g, ix) => dots(g, ix.map(i => s.actual[i]), ix.map(i => s.pred[i]), INCOME[g], .5, 6, { text: ix.map(i => `${s.country[i]} ${s.year[i]}`), hovertemplate: '%{text}<br>actual %{x:.1f} · predicted %{y:.1f}<extra></extra>' })), lineTr('perfect prediction', [lo, hi], [lo, hi], '#fff', 2, { line: { color: '#fff', width: 2, dash: 'dash' } })],
            { title: 'Actual vs predicted (test countries)', margin: { t: 112 }, xaxis: { title: { text: 'Actual' } }, yaxis: { title: { text: 'Predicted' } } });
        }
      } },
      { label: 'Residual diagnostics', render: async (v, el) => {
        const r = await api('reg/fit', v); const [a, ha] = pdiv(), [b, hb] = pdiv();
        el.innerHTML = `${note('A good fit leaves residuals (actual − predicted) as a <b>flat, patternless cloud around 0</b>. A curve or funnel means the model is missing structure or the errors grow with the prediction.')}<div class="grid g2"><div class="card">${ha}</div><div class="card">${hb}</div></div><div class="section">Biggest misses</div>${table([{ k: 'country', label: 'Country' }, { k: 'year', label: 'Year', f: x => x }, { k: v.target, label: 'Actual', d: 2 }, { k: 'predicted', label: 'Predicted', d: 2 }, { k: 'residual', label: 'Residual', d: 2 }], r.worst)}`;
        plot(a, [dots('residual', r.resid.pred, r.resid.res, VI, .45, 5)], { title: 'Residuals vs fitted', shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0, y1: 0, line: { color: RD, dash: 'dash' } }], xaxis: { title: { text: 'Predicted' } }, yaxis: { title: { text: 'Actual − predicted' } } });
        plot(b, [{ type: 'histogram', x: r.resid.all, nbinsx: 50, marker: { color: CY } }], { title: 'Residual distribution (should be bell-shaped, centred on 0)' });
      } },
      { label: 'Regularisation path', controls: [{ id: 'method', label: 'Method', type: 'seg', options: ['Ridge', 'Lasso', 'Elastic Net'], value: 'Lasso' }], render: async (v, el) => {
        const r = await api('reg/path', { target: v.target, method: v.method }); const [a, ha] = pdiv('tall'), [b, hb] = pdiv();
        el.innerHTML = `${note('Each line is one feature\'s coefficient as the penalty alpha grows (standardised inputs). <b>Ridge</b> shrinks all lines smoothly toward 0; <b>Lasso</b> snaps lines to exactly 0 one by one - the order they die tells you which features matter least. The right chart picks alpha: test error is lowest at the dip.')}<div class="grid g2"><div class="card">${ha}</div><div class="card">${hb}</div></div>`;
        const cur = v.logalpha, vline = { type: 'line', x0: cur, x1: cur, yref: 'paper', y0: 0, y1: 1, line: { color: '#fff', dash: 'dot', width: 1.5 } };
        plot(a, Object.entries(r.coefs).map(([k, y]) => ({ x: r.alphas, y, name: k, mode: 'lines', line: { width: 2.5 } })), { title: `${v.method}: coefficient path`, xaxis: { type: 'log', title: { text: 'alpha (penalty strength)' } }, yaxis: { title: { text: 'coefficient' } }, legend: { orientation: 'v', y: 1, x: 1.02 }, margin: { r: 150 }, shapes: [vline] });
        plot(b, Object.entries(r.rmse).map(([k, y]) => ({ x: r.alphas, y, name: k, mode: 'lines', line: { width: 3 } })), { title: 'Test RMSE vs alpha: choose the lowest point', xaxis: { type: 'log', title: { text: 'alpha' } }, yaxis: { title: { text: 'test RMSE' } }, shapes: [vline] });
      } },
      { label: 'Polynomial degree (bias-variance)', render: async (v, el) => {
        const r = await api('reg/poly', { target: v.target, feature: v.feature }); const [a, ha] = pdiv('tall');
        el.innerHTML = `${note(`Polynomials of degree 1-10 on <b>${esc(nice(v.feature || 'log_gdp_per_capita'))}</b>. Train error only ever falls; test error falls then rises - <b>that U-shape is overfitting</b>. Lowest test error at degree <b>${r.best}</b>.`)}<div class="card">${ha}</div>`;
        plot(a, [{ x: r.rows.map(o => o.degree), y: r.rows.map(o => o.train), name: 'train RMSE', mode: 'lines+markers', line: { width: 3 } }, { x: r.rows.map(o => o.degree), y: r.rows.map(o => o.test), name: 'test RMSE', mode: 'lines+markers', line: { width: 3 } }], { xaxis: { title: { text: 'polynomial degree (model flexibility)' }, dtick: 1 }, yaxis: { title: { text: 'RMSE' } }, shapes: [{ type: 'line', x0: r.best, x1: r.best, yref: 'paper', y0: 0, y1: 1, line: { color: GR, dash: 'dot' } }] });
      } },
      { label: 'K-fold cross-validation', controls: [{ id: 'kf', label: 'Folds (K)', type: 'range', min: 3, max: 10, value: 5 }], render: async (v, el) => {
        const r = await api('reg/cv', { target: v.target, k: v.kf }); const [a, ha] = pdiv('tall');
        el.innerHTML = `${note(`The data is cut into ${v.kf} folds <b>by country</b>; each fold is held out once. The box shows how much R² varies from fold to fold - a model that is good only on lucky folds is not trustworthy.`)}<div class="card">${ha}</div>${table([{ k: 'model', label: 'Model' }, { k: 'mean', label: 'Mean R²' }, { k: 'std', label: 'Std across folds' }], r.summary.sort((x, y) => y.mean - x.mean), { max: ['mean'] })}`;
        plot(a, Object.entries(r.scores).map(([k, y], i) => ({ type: 'box', y, name: k, boxpoints: 'all', jitter: .4, marker: { color: COLORS[i] }, line: { color: COLORS[i] } })), { showlegend: false, yaxis: { title: { text: 'R² per fold' } } });
      } }]
  });
};

/* ======================================================================= CLASSIFICATION */
PAGES.clf = root => {
  const FE = pickOpts(META.feature_keys, nice);
  const cmap = [[0, 'rgb(251,113,133)'], [.5, 'rgb(27,37,67)'], [1, 'rgb(52,211,153)']];
  mountPage(root, {
    hero: { badge: 'Unit 4 · Probabilistic models', title: 'Classification Lab', sub: 'Is a country-year\'s life expectancy "good"? See how each algorithm decides: Naive Bayes multiplies Gaussians, logistic regression bends a sigmoid, KNN lets its neighbours vote.', chips: ['Gaussian likelihoods', 'sigmoid & odds', 'neighbours & vote', 'ROC-AUC'] },
    globals: [{ id: 'thr', label: "'Good' means life expectancy ≥ (years)", type: 'range', min: 55, max: 80, value: 70 }],
    tabs: [
      { label: 'Naive Bayes', controls: [{ id: 'feature', label: 'Evidence feature x', type: 'select', options: FE, value: 'basic_sanitation_pct' }, { id: 'xq', label: 'Try an observation (percentile of x)', type: 'range', min: 1, max: 99, value: 55 }],
      render: async (v, el) => {
        const r = await api('clf/nb', { thr: v.thr, feature: v.feature, xq: v.xq }), b = await api('clf/bayes', { thr: v.thr, feature: v.feature, q: .5 });
        const [a, ha] = pdiv('tall'), [c, hc] = pdiv();
        const P = (p) => (+p).toFixed(3);
        el.innerHTML = `${note(`<b>Naive Bayes in one picture:</b> for each class it fits a <b>Gaussian curve P(x | class)</b> to the data (bars = the real histogram). Bayes' theorem turns those curves + the class priors into the posterior <b>P(good | x)</b> (gold, right axis). The class is "good" wherever the gold curve is above 0.5.`)}
          <div class="grid g4">${kpi('Prior P(good)', P(r.prior[1]), `P(not good) = ${P(r.prior[0])}`)}${kpi('P(x | good)', P(r.lik1), `x = ${fmt(r.xq, 1)}`)}${kpi('P(x | not good)', P(r.lik0))}${kpi('Posterior P(good | x)', P(r.posterior), r.posterior >= .5 ? '→ predicted GOOD' : '→ predicted not good', r.posterior >= .5 ? 'up' : 'down')}</div>
          <div class="card latex" style="margin:14px 0">P(good | x) = ${P(r.lik1)} · ${P(r.prior[1])} / ( ${P(r.lik1)} · ${P(r.prior[1])} + ${P(r.lik0)} · ${P(r.prior[0])} ) = <b>${P(r.posterior)}</b></div>
          <div class="card">${ha}</div>
          ${note(`Using <b>only ${esc(r.feature)}</b> Naive Bayes classifies ${pct(r.acc_one)} of unseen countries correctly; with all 10 features (multiplying their likelihoods <i>as if independent</i>) ${pct(r.acc_all)}.`)}
          <div class="section">Is the "naive" independence assumption true?</div><div class="card">${hc}</div>${note('Naive Bayes multiplies one likelihood per feature, assuming features are independent <i>given the class</i>. Dark red/blue squares show strong dependence - the assumption is violated, which is why its probabilities are over-confident.')}`;
        const sh = [{ type: 'line', x0: r.xq, x1: r.xq, yref: 'paper', y0: 0, y1: 1, line: { color: '#fff', dash: 'dot', width: 2 } }];
        if (r.boundary != null) sh.push({ type: 'line', x0: r.boundary, x1: r.boundary, yref: 'paper', y0: 0, y1: 1, line: { color: GOLD, dash: 'dash', width: 2 } });
        plot(a, [{ type: 'bar', name: 'not good (data)', x: r.centers, y: r.hist0, marker: { color: RD }, opacity: .35 }, { type: 'bar', name: 'good (data)', x: r.centers, y: r.hist1, marker: { color: GR }, opacity: .35 },
          lineTr(`P(x | not good)  N(${fmt(r.mu[0], 1)}, ${fmt(r.sd[0], 1)})`, r.xs, r.pdf0, RD, 3), lineTr(`P(x | good)  N(${fmt(r.mu[1], 1)}, ${fmt(r.sd[1], 1)})`, r.xs, r.pdf1, GR, 3),
          lineTr('posterior P(good | x)', r.xs, r.post, GOLD, 3, { yaxis: 'y2', line: { color: GOLD, width: 3, dash: 'dot' } })],
          { barmode: 'overlay', title: `${r.feature}: two Gaussians → one decision`, xaxis: { title: { text: r.feature } }, yaxis: { title: { text: 'density' } }, yaxis2: { overlaying: 'y', side: 'right', range: [0, 1], title: { text: 'P(good | x)' }, showgrid: false }, margin: { r: 75, t: 78 }, shapes: sh,
            annotations: [{ x: r.xq, y: 1, yref: 'paper', text: 'your x', showarrow: false, yanchor: 'bottom', font: { color: '#fff' } }, ...(r.boundary != null ? [{ x: r.boundary, y: .96, yref: 'paper', text: `boundary ${fmt(r.boundary, 1)} ` , showarrow: false, xanchor: 'right', yanchor: 'top', font: { color: GOLD } }] : [])] });
        plot(c, [{ type: 'heatmap', z: b.corr.z, x: b.corr.labels, y: b.corr.labels, colorscale: 'RdBu', reversescale: true, zmin: -1, zmax: 1, colorbar: { thickness: 10, outlinewidth: 0 } }], { yaxis: { autorange: 'reversed' }, margin: { l: 170, b: 150 }, xaxis: { tickangle: -40 } });
      } },
      { label: 'Logistic regression', controls: [{ id: 'feature', label: 'Feature x', type: 'select', options: FE, value: 'log_gdp_per_capita' }, { id: 'logC', label: 'log10(C)  (weaker ← penalty → stronger)', type: 'range', min: -3, max: 3, step: .5, value: 0, fmt: v => (+v).toFixed(1) }],
      render: async (v, el) => {
        const r = await api('clf/logit', { thr: v.thr, feature: v.feature, logC: v.logC }); const [a, ha] = pdiv('tall'), [b, hb] = pdiv('tall');
        const jit = r.pts.y.map(y => y + (Math.random() - .5) * .09);
        el.innerHTML = `${note('<b>Logistic regression in one picture:</b> it fits an S-shaped <b>sigmoid  P(good | x) = 1 / (1 + e^−(b₀ + b₁x))</b> to the 0/1 outcomes (dots, jittered). The class flips where the curve crosses 0.5 - a <b>single threshold on x</b> (the gold line).')}
          <div class="grid g4">${kpi('Intercept b₀', fmt(r.b0, 2))}${kpi('Slope b₁', fmt(r.b1, 2), 'log-odds per unit of x')}${kpi('Odds × per +1 of x', '× ' + fmt(r.odds_per_unit, 2), 'e^b₁')}${kpi('Boundary x* (P = 0.5)', fmt(r.xstar, 2), v.feature.startsWith('log_gdp') ? `≈ $${Math.round(Math.exp(r.xstar)).toLocaleString()} GDP / person` : '')}</div>
          <div class="grid g2" style="margin-top:14px"><div class="card">${ha}</div><div class="card">${hb}</div></div>
          ${note(`Using only <b>${esc(r.feature)}</b> it gets ${pct(r.acc_one)} right on unseen countries; the full 10-feature model ${pct(r.acc_all)}. <b>Right chart:</b> e^coefficient of the full model = how many times the odds of "good" are multiplied by <i>+1 standard deviation</i> of that feature (1 = no effect).`)}`;
        plot(a, [dots('not good', r.pts.x.filter((_, i) => r.pts.y[i] === 0), jit.filter((_, i) => r.pts.y[i] === 0), RD, .45, 5), dots('good', r.pts.x.filter((_, i) => r.pts.y[i] === 1), jit.filter((_, i) => r.pts.y[i] === 1), GR, .45, 5), lineTr('P(good | x)', r.xs, r.p, '#fff', 4)],
          { title: `${r.feature}: the fitted sigmoid`, xaxis: { title: { text: r.feature } }, yaxis: { title: { text: 'P(good)' }, range: [-.12, 1.12] }, shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: .5, y1: .5, line: { color: 'rgba(255,255,255,.35)', dash: 'dash' } }, ...(r.xstar != null ? [{ type: 'line', x0: r.xstar, x1: r.xstar, yref: 'paper', y0: 0, y1: 1, line: { color: GOLD, width: 2, dash: 'dash' } }] : [])],
            annotations: r.xstar != null ? [{ x: r.xstar, y: .5, text: ` x* = ${fmt(r.xstar, 2)}`, showarrow: false, xanchor: 'left', yanchor: 'bottom', font: { color: GOLD } }] : [] });
        plot(b, [{ type: 'bar', orientation: 'h', y: r.odds.map(o => o.feature), x: r.odds.map(o => o.odds - 1), base: 1, marker: { color: r.odds.map(o => o.odds >= 1 ? GR : RD) }, text: r.odds.map(o => '×' + o.odds.toFixed(2)), textposition: 'outside', hovertemplate: '%{y}<br>odds × %{text}<extra></extra>' }],
          { title: 'Odds multiplier per +1 SD (all features)', margin: { l: 190 }, xaxis: { title: { text: 'odds ratio (1 = no effect)' } }, shapes: [{ type: 'line', x0: 1, x1: 1, yref: 'paper', y0: 0, y1: 1, line: { color: '#fff', width: 1.5 } }] });
      } },
      { label: 'KNN', controls: [{ id: 'fx', label: 'x-axis feature', type: 'select', options: FE, value: 'log_gdp_per_capita' }, { id: 'fy', label: 'y-axis feature', type: 'select', options: FE, value: 'basic_sanitation_pct' },
        { id: 'k', label: 'k (neighbours that vote)', type: 'range', min: 1, max: 50, value: 9 }, { id: 'country', label: 'Query country', type: 'select', options: META.country_list, value: 'India' }, { id: 'year', label: 'Query year', type: 'range', min: META.year_min, max: META.year_max, value: META.year_max - 4 }, { id: 'zoom', label: 'Zoom to the neighbourhood', type: 'check', value: 1 }],
      render: async (v, el) => {
        const r = await api('clf/knn2d', { thr: v.thr, k: v.k, fx: v.fx, fy: v.fy, country: v.country, year: v.year, zoom: v.zoom });
        if (r.error) { el.innerHTML = note(esc(r.error), 'warn'); return; }
        const [a, ha] = pdiv('tall'), [b, hb] = pdiv(), Q = r.query, nb = r.nb;
        el.innerHTML = `${note(`<b>KNN in one picture:</b> there is no training - to classify a point it looks at the <b>${r.k} closest labelled points</b> (white rings; the dashed ellipse is the radius that just contains them) and takes a <b>majority vote</b>. The coloured background shows what KNN would predict at every position. <i>${esc(Q.country)} is held out of the training data</i>, otherwise its own earlier years would be its neighbours.`)}
          <div class="grid g4">${kpi('Query point', `${esc(Q.country)} ${Q.year}`, `life exp. ${fmt(Q.life, 1)}`)}${kpi('Votes', `${r.votes_good} good · ${r.k - r.votes_good} not`, `need > ${r.k / 2} for "good"`)}${kpi('KNN says', r.pred_good ? 'GOOD' : 'NOT GOOD', Q.truly_good === r.pred_good ? '✔ correct' : '✘ wrong (truth: ' + (Q.truly_good ? 'good' : 'not good') + ')', Q.truly_good === r.pred_good ? 'up' : 'down')}${kpi('2-feature test accuracy', pct(r.acc2), `trained on ${Q.n_obs.toLocaleString()} rows`)}</div>
          <div class="card" style="margin-top:14px">${ha}</div>
          <div class="section">Choosing k</div>${note('Small k → ragged, noisy boundary (train accuracy ≈ 1, test lower = overfitting). Large k → over-smooth (underfitting). This curve uses all 10 features.')}<div class="card">${hb}</div>`;
        const T = Array.from({ length: 61 }, (_, i) => i / 60 * 2 * Math.PI), tr = [{ type: 'heatmap', x: r.gx, y: r.gy, z: r.z, colorscale: cmap, zmin: 0, zmax: 1, opacity: .55, showscale: false, hoverinfo: 'skip' }];
        [[0, 'not good', RD], [1, 'good', GR]].forEach(([l, n, c]) => { const ix = r.pts.label.map((x, i) => x === l ? i : -1).filter(i => i >= 0); tr.push(dots(`${n} (training)`, ix.map(i => r.pts.x[i]), ix.map(i => r.pts.y[i]), c, .6, 5)); });
        const lx = [], ly = []; nb.x.forEach((x, i) => { lx.push(Q.x, x, null); ly.push(Q.y, nb.y[i], null); });
        tr.push({ type: 'scatter', mode: 'lines', name: 'to neighbours', x: lx, y: ly, line: { color: 'rgba(255,255,255,.55)', width: 1 }, hoverinfo: 'skip' },
          { type: 'scatter', mode: 'lines', name: `radius of the ${r.k}-th neighbour`, x: T.map(t => Q.x + r.radius_x * Math.cos(t)), y: T.map(t => Q.y + r.radius_y * Math.sin(t)), line: { color: '#fff', width: 1.6, dash: 'dash' }, hoverinfo: 'skip' },
          { type: 'scatter', mode: 'markers', name: `${r.k} nearest neighbours`, x: nb.x, y: nb.y, marker: { symbol: 'circle-open', size: 15, color: '#fff', line: { color: '#fff', width: 2.5 } }, hovertemplate: 'neighbour<br>%{x:.2f}, %{y:.2f}<extra></extra>' },
          { type: 'scatter', mode: 'markers+text', name: 'query', x: [Q.x], y: [Q.y], text: [`${Q.country} ${Q.year}`], textposition: 'top center', textfont: { color: '#fff', size: 12 }, marker: { symbol: 'star', size: 24, color: GOLD, line: { color: '#fff', width: 1.5 } } });
        plot(a, tr, { title: `KNN decision regions (k = ${r.k}) in the ${r.fx} × ${r.fy} plane`, xaxis: { title: { text: r.fx }, range: [r.gx[0], r.gx[r.gx.length - 1]] }, yaxis: { title: { text: r.fy }, range: [r.gy[0], r.gy[r.gy.length - 1]] } });
        const kn = await api('clf/knn', { thr: v.thr });
        plot(b, [{ x: kn.rows.map(o => o.k), y: kn.rows.map(o => o.train), name: 'train accuracy', mode: 'lines+markers', line: { width: 3 } }, { x: kn.rows.map(o => o.k), y: kn.rows.map(o => o.test), name: 'test accuracy', mode: 'lines+markers', line: { width: 3 } }], { xaxis: { title: { text: 'k' } }, yaxis: { title: { text: 'accuracy' } }, shapes: [{ type: 'line', x0: v.k, x1: v.k, yref: 'paper', y0: 0, y1: 1, line: { color: GOLD, dash: 'dot' } }] });
      } },
      { label: 'Evaluate & compare', controls: [{ id: 'k', label: 'KNN: k', type: 'range', min: 1, max: 50, value: 9 }, { id: 'logC', label: 'Logistic: log10(C)', type: 'range', min: -3, max: 3, step: .5, value: 0, fmt: v => (+v).toFixed(1) }, { id: 'dec', label: 'Decision threshold on P(good)', type: 'range', min: .1, max: .9, step: .05, value: .5, fmt: v => (+v).toFixed(2) }],
      render: async (v, el) => {
        const r = await api('clf/run', { thr: v.thr, k: v.k, logC: v.logC, dec: v.dec }); const [a, ha] = pdiv('tall'); const ids = Object.keys(r.cm).map(() => pdiv('short'));
        const cols = ['Accuracy', 'Precision', 'Recall', 'F1', 'ROC-AUC', 'Log-loss'].map(k => ({ k, label: k }));
        el.innerHTML = `${note('All three models on <b>all 10 features</b>, tested on countries they never saw. Raising the decision threshold trades recall for precision.')}${table([{ k: 'model', label: 'Model' }, ...cols], r.rows, { max: ['Accuracy', 'Precision', 'Recall', 'F1', 'ROC-AUC'], min: ['Log-loss'] })}
          <div class="section">Confusion matrices</div><div class="grid g3">${ids.map(i => `<div class="card">${i[1]}</div>`).join('')}</div><div class="section">ROC curves</div><div class="card">${ha}</div>
          ${note('<b>Precision</b> – of countries called good, how many are · <b>Recall</b> – of truly good, how many we found · <b>ROC-AUC</b> – chance a random good country scores above a random not-good one (the curve hugs the top-left when the model separates well).')}`;
        Object.entries(r.cm).forEach(([n, cm], i) => { const [[tn, fp], [fn, tp]] = cm; plot(ids[i][0], [{ type: 'heatmap', z: cm, x: ['Pred: not good', 'Pred: good'], y: ['Actual: not good', 'Actual: good'], colorscale: [[0, '#0e1530'], [1, CY]], showscale: false, text: cm.map(r => r.map(String)), texttemplate: '%{text}', textfont: { size: 22, color: '#fff' }, hoverinfo: 'skip' }], { title: `${n} · TP ${tp} FP ${fp} FN ${fn} TN ${tn}`, yaxis: { autorange: 'reversed' }, margin: { l: 110 } }); });
        plot(a, [...r.rows.map(o => ({ x: r.roc[o.model].fpr, y: r.roc[o.model].tpr, name: `${o.model} (AUC ${fmt(o['ROC-AUC'])})`, mode: 'lines', line: { width: 3 } })), { x: [0, 1], y: [0, 1], name: 'random guess', mode: 'lines', line: { dash: 'dash', color: GREY } }], { xaxis: { title: { text: 'False-positive rate' } }, yaxis: { title: { text: 'True-positive rate' } } });
      } }]
  });
};
