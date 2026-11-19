/* Regression  and Classification : every algorithm gets its own signature picture */
const GREY = MUTE, CY = TEAL, PK = TERRA, GR = GOOD, RD = TERRA, GOLD = OCHRE, VI = PLUM;
const dots = (name, x, y, color, op = .6, size = 6, extra = {}) => ({ type: 'scattergl', mode: 'markers', name, x, y, marker: { color, opacity: op, size }, ...extra });
const lineTr = (name, x, y, color, w = 2.5, extra = {}) => ({ type: 'scatter', mode: 'lines', name, x, y, line: { color, width: w }, ...extra });
const vline = (x, color = INK2, dash = 'dot', w = 1.4) => ({ type: 'line', x0: x, x1: x, yref: 'paper', y0: 0, y1: 1, line: { color, dash, width: w } });
const hline = (y, color = INK2, dash = 'dash', w = 1.2) => ({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: y, y1: y, line: { color, dash, width: w } });

/* ======================================================================= REGRESSION */
PAGES.reg = root => {
  const FE = pickOpts(META.feature_keys, nice);
  const MODELS = [['Simple linear (1 feature)', 'Simple linear'], ['Polynomial (1 feature)', 'Polynomial'], ['Multiple linear', 'Multiple linear'], ['Ridge', 'Ridge'], ['Lasso', 'Lasso'], ['Elastic Net', 'Elastic Net'], ['KNN regressor', 'KNN regression'], ['Decision-tree regressor', 'Regression tree']];
  const one = s => /^(Simple|Polynomial|KNN|Decision)/.test(s.model), reg = s => ['Ridge', 'Lasso', 'Elastic Net'].includes(s.model);
  mountPage(root, {
    head: { icon: 'reg', eyebrow: 'Machine learning · Regression', title: 'Predicting life expectancy', lede: 'Regression learns a function from health inputs to a number. Choose an algorithm and see what it actually fits to the data - a line, a curve, neighbours, steps or shrunken coefficients.' },
    globals: [
      { id: 'target', label: 'Predict', type: 'select', options: [['life_expectancy', 'Life expectancy (years)'], ['infant_mortality_per_1000', 'Infant mortality (per 1,000)']], value: 'life_expectancy' },
      { id: 'model', label: 'Algorithm', type: 'select', options: MODELS, value: 'Simple linear (1 feature)' },
      { id: 'feature', label: 'Input feature (x)', type: 'select', options: FE, value: 'log_gdp_per_capita', show: one },
      { id: 'degree', label: 'Polynomial degree', type: 'range', min: 1, max: 12, value: 3, show: s => s.model.startsWith('Polynomial') },
      { id: 'k', label: 'Neighbours averaged (k)', type: 'range', min: 1, max: 60, value: 7, show: s => s.model.startsWith('KNN') },
      { id: 'qpct', label: 'Query position (percentile of x)', type: 'range', min: 2, max: 98, value: 30, show: s => s.model.startsWith('KNN') },
      { id: 'depth', label: 'Tree depth', type: 'range', min: 1, max: 12, value: 3, show: s => s.model.startsWith('Decision') },
      { id: 'logalpha', label: 'Penalty strength, log10(alpha)', type: 'range', min: -3, max: 2, step: .1, value: -.5, fmt: v => (+v).toFixed(1), show: reg },
      { id: 'l1', label: 'Lasso share (l1_ratio)', type: 'range', min: .05, max: .95, step: .05, value: .5, fmt: v => (+v).toFixed(2), show: s => s.model === 'Elastic Net' }],
    tabs: [
      { label: 'Fit', render: async (v, el) => {
        const r = await api('reg/fit', v), te = r.metrics.test, tr = r.metrics.train, gap = tr.R2 - te.R2 > .08;
        const [a, ha] = pdiv('tall'), [b, hb] = pdiv();
        const head = stats(['Test R²', fmt(te.R2), 'variance explained'], ['Test RMSE', fmt(te.RMSE, 2), 'typical error'], ['Test MAE', fmt(te.MAE, 2)], ['Train R²', fmt(tr.R2), gap ? 'gap suggests overfitting' : 'close to test: no overfitting', gap ? 'down' : '']);
        if (r.single) {
          const X = r.feature_label, name = v.model.split(' ')[0];
          const tr_ = [dots('training data', r.train.x, r.train.y, '#cbd2d9', .45, 4), dots('test data', r.test.x, r.test.y, TEAL, .6, 6, { text: r.test.country.map((c, i) => `${c} ${r.test.year[i]}`), hovertemplate: '%{text}<br>x %{x:.2f} · y %{y:.1f}<extra></extra>' })];
          const lay = { xaxis: { title: { text: X } }, yaxis: { title: { text: nice(v.target) } }, shapes: [] };
          let cap = '', fitName = 'fitted function', fitExtra = {};
          if (name === 'Simple') {
            const L = r.line, sg = r.segments, sx = [], sy = []; sg.x.forEach((x, i) => { sx.push(x, x, null); sy.push(sg.y[i], sg.yhat[i], null); });
            tr_.push({ type: 'scatter', mode: 'lines', x: L.x, y: L.y.map(y => y + r.rmse_test), line: { width: 0 }, hoverinfo: 'skip', showlegend: false },
              { type: 'scatter', mode: 'lines', x: L.x, y: L.y.map(y => y - r.rmse_test), fill: 'tonexty', fillcolor: 'rgba(35,134,91,.12)', line: { width: 0 }, name: `± 1 RMSE (${fmt(r.rmse_test, 1)} yrs)`, hoverinfo: 'skip' },
              { type: 'scatter', mode: 'lines', x: sx, y: sy, line: { color: TERRA, width: 1.5 }, name: 'residuals (actual − line)', hoverinfo: 'skip' });
            fitName = 'regression line'; cap = `<b>ŷ = ${fmt(r.equation.b0, 2)} ${r.equation.b1 >= 0 ? '+' : '−'} ${fmt(Math.abs(r.equation.b1), 2)} · x.</b> Least squares chooses the line that minimises the squared length of the red residuals. Each extra unit of ${esc(X)} adds ${fmt(r.equation.b1, 2)} to the prediction; the shaded band is the typical error.`;
          } else if (name === 'KNN') {
            const K = r.knn; lay.shapes.push(vline(K.qx, INK2));
            tr_.push({ type: 'scatter', mode: 'markers', name: `${K.k} nearest neighbours`, x: K.nx, y: K.ny, marker: { symbol: 'circle-open', size: 15, color: OCHRE, line: { color: OCHRE, width: 2.2 } } },
              { type: 'scatter', mode: 'markers+text', name: 'prediction', x: [K.qx], y: [K.pred], text: [` ŷ = ${K.pred.toFixed(1)}`], textposition: 'middle right', textfont: { color: INK, size: 15 }, marker: { symbol: 'diamond', size: 14, color: TERRA, line: { color: INK, width: 1.2 } } });
            fitName = `KNN fit (k = ${v.k})`; cap = `<b>How KNN predicts.</b> At x = ${K.qx.toFixed(2)} (dotted line) it finds the ${K.k} training points nearest in x (rings) and returns the mean of their y-values: <b>${K.pred.toFixed(1)}</b>. The jagged curve is that average at every x; small k follows noise, large k smooths it.`;
          } else if (name === 'Decision') {
            r.tree.splits.forEach(sx => lay.shapes.push(vline(sx, '#bccdf6', 'dot', 1))); fitName = 'tree fit'; fitExtra = { line: { color: INK, width: 2.4, shape: 'hv' } };
            cap = `<b>How a regression tree predicts.</b> It cuts x at ${r.tree.splits.length} thresholds (dotted lines) and predicts the mean y inside each of ${r.tree.leaves} regions, producing a staircase. A deeper tree gives narrower steps and eventually memorises the data.`;
          } else { fitName = `degree-${v.degree} curve`; cap = `<b>Polynomial of degree ${v.degree}.</b> Test R² ${fmt(te.R2)} against train R² ${fmt(tr.R2)}. More flexibility fits the training data better; the Bias and variance tab shows where it stops helping.`; }
          tr_.push(lineTr(fitName, r.line.x, r.line.y, INK, 2.6, fitExtra));
          el.innerHTML = head + fig(ha, cap) + `<p class="sub">${r.n_obs.toLocaleString()} country-years in which ${esc(X)} was actually observed. Values the data set had to fill in are excluded here so they do not create artificial stripes.</p>`;
          plot(a, tr_, lay);
        } else {
          const s = r.scatter, c = [...r.coef].sort((x, y) => x.value - y.value), isReg = !!r.coef_ols, ols = isReg ? Object.fromEntries(r.coef_ols.map(o => [o.feature, o.value])) : null;
          el.innerHTML = head + `<div class="grid g2">${fig(hb, isReg ? `<b>Shrinkage.</b> Grey bars: ordinary least squares. Coloured bars: ${esc(v.model)} at penalty ${(10 ** v.logalpha).toPrecision(2)}. A larger penalty pulls every coefficient toward zero${v.model === 'Ridge' ? '' : `; ${v.model === 'Lasso' ? 'Lasso' : 'Elastic Net'} sets <b>${r.zeroed}</b> of ${r.coef.length} exactly to zero, which removes those features`}.` : '<b>One coefficient per feature</b>, all inputs standardised, so bar lengths are comparable. Positive values raise the predicted outcome.')}${fig(ha, 'Each dot is a held-out country-year. Points on the dashed line are predicted exactly; the spread around it is the model\'s error.')}</div>`;
          plot(b, [...(isReg ? [{ type: 'bar', orientation: 'h', name: 'OLS (no penalty)', y: c.map(o => o.feature), x: c.map(o => ols[o.feature]), marker: { color: '#cbd2d9' } }] : []), { type: 'bar', orientation: 'h', name: v.model, y: c.map(o => o.feature), x: c.map(o => o.value), marker: { color: c.map(o => o.value >= 0 ? TEAL : TERRA) } }], { barmode: 'group', margin: { l: 190 } });
          const lo = Math.min(...s.actual, ...s.pred), hi = Math.max(...s.actual, ...s.pred);
          plot(a, [...byIncome(s, (g, ix) => dots(g, ix.map(i => s.actual[i]), ix.map(i => s.pred[i]), INCOME[g], .55, 6, { text: ix.map(i => `${s.country[i]} ${s.year[i]}`), hovertemplate: '%{text}<br>actual %{x:.1f} · predicted %{y:.1f}<extra></extra>' })), lineTr('perfect prediction', [lo, hi], [lo, hi], INK, 1.5, { line: { color: INK, width: 1.5, dash: 'dash' } })], { xaxis: { title: { text: 'Actual' } }, yaxis: { title: { text: 'Predicted' } } });
        }
      } },
      { label: 'Residuals', render: async (v, el) => {
        const r = await api('reg/fit', v); const [a, ha] = pdiv(), [b, hb] = pdiv();
        el.innerHTML = `<div class="grid g2">${fig(ha, 'Residual = actual − predicted. A good model leaves a patternless cloud around zero; a curve or funnel means structure is missing.')}${fig(hb, 'Errors should be roughly bell-shaped and centred on zero.')}</div>${section('Largest errors')}${table([{ k: 'country', label: 'Country' }, { k: 'year', label: 'Year', f: x => x }, { k: v.target, label: 'Actual', d: 1 }, { k: 'predicted', label: 'Predicted', d: 1 }, { k: 'residual', label: 'Residual', d: 1 }], r.worst.slice(0, 6))}`;
        plot(a, [dots('residual', r.resid.pred, r.resid.res, TEAL, .45, 5)], { shapes: [hline(0, TERRA)], xaxis: { title: { text: 'Predicted' } }, yaxis: { title: { text: 'Residual' } } });
        plot(b, [{ type: 'histogram', x: r.resid.all, nbinsx: 50, marker: { color: TEAL } }], { xaxis: { title: { text: 'Residual' } }, yaxis: { title: { text: 'Count' } } });
      } },
      { label: 'Regularisation', controls: [{ id: 'method', label: 'Penalty', type: 'seg', options: ['Ridge', 'Lasso', 'Elastic Net'], value: 'Lasso' }], render: async (v, el) => {
        const r = await api('reg/path', { target: v.target, method: v.method }); const [a, ha] = pdiv('tall'), [b, hb] = pdiv('tall'); const cur = v.logalpha;
        el.innerHTML = `<div class="grid g2">${fig(ha, v.method === 'Ridge' ? 'Each line is one feature\'s coefficient as the penalty grows. Ridge shrinks all of them smoothly but never to exactly zero.' : 'Each line is one feature\'s coefficient as the penalty grows. Lasso snaps coefficients to exactly zero one by one; the order they drop out ranks the features.')}${fig(hb, 'Choose the penalty at the lowest test error. Too small overfits; too large underfits. The dotted line is the value set above.')}</div>`;
        plot(a, Object.entries(r.coefs).map(([k, y]) => ({ x: r.alphas, y, name: k, mode: 'lines', line: { width: 2 } })), { xaxis: { type: 'log', title: { text: 'Penalty strength (alpha)' } }, yaxis: { title: { text: 'Coefficient' } }, legend: { orientation: 'v', y: 1, x: 1.02 }, margin: { r: 150 }, shapes: [vline(cur, INK2)] });
        plot(b, Object.entries(r.rmse).map(([k, y]) => ({ x: r.alphas, y, name: k, mode: 'lines', line: { width: 2.4 } })), { xaxis: { type: 'log', title: { text: 'Penalty strength (alpha)' } }, yaxis: { title: { text: 'Test RMSE' } }, shapes: [vline(cur, INK2)] });
      } },
      { label: 'Bias and variance', render: async (v, el) => {
        const r = await api('reg/poly', { target: v.target, feature: v.feature }); const [a, ha] = pdiv('tall');
        el.innerHTML = fig(ha, `Polynomials of degree 1 to 10 fitted on ${esc(nice(v.feature || 'log_gdp_per_capita'))}. Training error only falls; test error falls and then rises. That U-shape is overfitting, and the lowest test error is at degree <b>${r.best}</b>.`);
        plot(a, [{ x: r.rows.map(o => o.degree), y: r.rows.map(o => o.train), name: 'training error', mode: 'lines+markers', line: { width: 2.4, color: SLATE } }, { x: r.rows.map(o => o.degree), y: r.rows.map(o => o.test), name: 'test error', mode: 'lines+markers', line: { width: 2.4, color: TERRA } }], { xaxis: { title: { text: 'Polynomial degree (model flexibility)' }, dtick: 1 }, yaxis: { title: { text: 'RMSE (years)' } }, shapes: [vline(r.best, BURG)] });
      } },
      { label: 'Model comparison', controls: [{ id: 'kf', label: 'Folds (K)', type: 'range', min: 3, max: 10, value: 5 }], render: async (v, el) => {
        const r = await api('reg/cv', { target: v.target, k: v.kf }); const [a, ha] = pdiv('tall');
        el.innerHTML = fig(ha, `${v.kf}-fold cross-validation: the countries are split into ${v.kf} groups and each group is held out once. The spread of each box shows how stable a model is; a model that only works on lucky folds is not trustworthy.`) + table([{ k: 'model', label: 'Model' }, { k: 'mean', label: 'Mean R²', num: 1 }, { k: 'std', label: 'Std across folds', num: 1 }], r.summary.sort((x, y) => y.mean - x.mean), { max: ['mean'] });
        plot(a, Object.entries(r.scores).map(([k, y], i) => ({ type: 'box', y, name: k, boxpoints: 'all', jitter: .4, marker: { color: COLORS[i] }, line: { color: COLORS[i] } })), { showlegend: false, yaxis: { title: { text: 'R² on held-out countries' } } });
      } }]
  });
};

/* ======================================================================= CLASSIFICATION */
PAGES.clf = root => {
  const FE = pickOpts(META.feature_keys, nice), P = p => (+p).toFixed(3);
  mountPage(root, {
    head: { icon: 'clf', eyebrow: 'Machine learning · Classification', title: 'Is life expectancy above the target?', lede: 'Three probabilistic classifiers decide whether a country-year reaches a life-expectancy target. Each tab shows how that algorithm reasons: Gaussians and Bayes\' rule, a sigmoid, or a vote among neighbours.' },
    globals: [{ id: 'thr', label: 'Target: life expectancy at least (years)', type: 'range', min: 55, max: 80, value: 70 }],
    tabs: [
      { label: 'Naive Bayes', controls: [{ id: 'feature', label: 'Evidence feature (x)', type: 'select', options: FE, value: 'basic_sanitation_pct' }, { id: 'xq', label: 'Try an observation (percentile of x)', type: 'range', min: 1, max: 99, value: 55 }],
      render: async (v, el) => {
        const r = await api('clf/nb', { thr: v.thr, feature: v.feature, xq: v.xq }), b = await api('clf/bayes', { thr: v.thr, feature: v.feature, q: .5 }); const [a, ha] = pdiv('tall'), [c, hc] = pdiv();
        el.innerHTML = stats(['Prior P(good)', P(r.prior[1]), `P(not good) = ${P(r.prior[0])}`], ['P(x | good)', P(r.lik1), `at x = ${fmt(r.xq, 1)}`], ['P(x | not good)', P(r.lik0)], ['Posterior P(good | x)', P(r.posterior), r.posterior >= .5 ? 'classified as good' : 'classified as not good', r.posterior >= .5 ? 'up' : 'down'])
          + `<div class="latex">P(good | x) = ${P(r.lik1)} · ${P(r.prior[1])} / ( ${P(r.lik1)} · ${P(r.prior[1])} + ${P(r.lik0)} · ${P(r.prior[0])} ) = ${P(r.posterior)}</div>`
          + fig(ha, `<b>Naive Bayes fits one Gaussian per class</b> (curves) to the data (bars), then applies Bayes' rule to get the posterior (dotted, right axis). The class is "good" wherever the posterior is above 0.5, here from ${fmt(r.boundary, 1)} upward. Using only ${esc(r.feature)} it classifies ${pct(r.acc_one)} of unseen countries correctly; combining all ten features, ${pct(r.acc_all)}.`)
          + section('Is the "naive" assumption reasonable?') + fig(hc, 'Naive Bayes multiplies one likelihood per feature as if features were independent. Strong colours show they are not, which is why its probabilities are over-confident.');
        const sh = [vline(r.xq, INK, 'dot', 1.8)]; if (r.boundary != null) sh.push(vline(r.boundary, OCHRE, 'dash', 1.8));
        plot(a, [{ type: 'bar', name: 'not good (data)', x: r.centers, y: r.hist0, marker: { color: TERRA }, opacity: .3 }, { type: 'bar', name: 'good (data)', x: r.centers, y: r.hist1, marker: { color: GOOD }, opacity: .3 },
          lineTr(`P(x | not good), N(${fmt(r.mu[0], 1)}, ${fmt(r.sd[0], 1)})`, r.xs, r.pdf0, TERRA, 2.6), lineTr(`P(x | good), N(${fmt(r.mu[1], 1)}, ${fmt(r.sd[1], 1)})`, r.xs, r.pdf1, GOOD, 2.6),
          lineTr('posterior P(good | x)', r.xs, r.post, INK, 2, { yaxis: 'y2', line: { color: INK, width: 2, dash: 'dot' } })],
          { barmode: 'overlay', xaxis: { title: { text: r.feature } }, yaxis: { title: { text: 'Density' } }, yaxis2: { overlaying: 'y', side: 'right', range: [0, 1], title: { text: 'P(good | x)' }, showgrid: false }, margin: { r: 70, t: 56 }, shapes: sh,
            annotations: [{ x: r.xq, y: 1.02, yref: 'paper', text: 'your x', showarrow: false, yanchor: 'bottom', font: { color: INK } }, ...(r.boundary != null ? [{ x: r.boundary, y: .96, yref: 'paper', text: `boundary ${fmt(r.boundary, 1)} `, showarrow: false, xanchor: 'right', yanchor: 'top', font: { color: OCHRE } }] : [])] });
        plot(c, [{ type: 'heatmap', z: b.corr.z, x: b.corr.labels, y: b.corr.labels, colorscale: DIV, zmin: -1, zmax: 1, colorbar: { thickness: 10, outlinewidth: 0, title: { text: 'correlation' } } }], { yaxis: { autorange: 'reversed' }, margin: { l: 170, b: 150, t: 20 }, xaxis: { tickangle: -40 } });
      } },
      { label: 'Logistic regression', controls: [{ id: 'feature', label: 'Feature (x)', type: 'select', options: FE, value: 'log_gdp_per_capita' }, { id: 'logC', label: 'Regularisation, log10(C)', type: 'range', min: -3, max: 3, step: .5, value: 0, fmt: v => (+v).toFixed(1) }],
      render: async (v, el) => {
        const r = await api('clf/logit', { thr: v.thr, feature: v.feature, logC: v.logC }); const [a, ha] = pdiv('tall'), [b, hb] = pdiv('tall');
        const y0 = r.pts.y.map(y => y + (Math.random() - .5) * .08);
        el.innerHTML = stats(['Intercept b₀', fmt(r.b0, 2)], ['Slope b₁', fmt(r.b1, 2), 'log-odds per unit of x'], ['Odds per +1 of x', '× ' + fmt(r.odds_per_unit, 2)], ['Boundary x* (P = 0.5)', fmt(r.xstar, 2), v.feature.startsWith('log_gdp') ? `≈ $${Math.round(Math.exp(r.xstar)).toLocaleString()} GDP per person` : ''])
          + `<div class="grid g2" style="margin-top:18px">${fig(ha, `<b>Logistic regression fits an S-shaped curve</b> P(good | x) = 1 / (1 + e<sup>−(b₀ + b₁x)</sup>) to the 0/1 outcomes (dots, jittered). The prediction flips where the curve crosses 0.5, a single threshold on x. With ${esc(r.feature)} alone it is right ${pct(r.acc_one)} of the time; with all ten features, ${pct(r.acc_all)}.`)}${fig(hb, 'Odds ratio of each feature in the full model: how many times the odds of "good" are multiplied by one standard deviation increase. A value of 1 means no effect.')}</div>`;
        plot(a, [dots('not good', r.pts.x.filter((_, i) => r.pts.y[i] === 0), y0.filter((_, i) => r.pts.y[i] === 0), TERRA, .4, 5), dots('good', r.pts.x.filter((_, i) => r.pts.y[i] === 1), y0.filter((_, i) => r.pts.y[i] === 1), GOOD, .4, 5), lineTr('P(good | x)', r.xs, r.p, INK, 3)],
          { xaxis: { title: { text: r.feature } }, yaxis: { title: { text: 'P(good)' }, range: [-.12, 1.12] }, shapes: [hline(.5, MUTE), ...(r.xstar != null ? [vline(r.xstar, OCHRE, 'dash', 1.8)] : [])], annotations: r.xstar != null ? [{ x: r.xstar, y: .5, text: ` x* = ${fmt(r.xstar, 2)}`, showarrow: false, xanchor: 'left', yanchor: 'bottom', font: { color: OCHRE } }] : [] });
        plot(b, [{ type: 'bar', orientation: 'h', y: r.odds.map(o => o.feature), x: r.odds.map(o => o.odds - 1), base: 1, marker: { color: r.odds.map(o => o.odds >= 1 ? GOOD : TERRA) }, text: r.odds.map(o => '× ' + o.odds.toFixed(2)), textposition: 'outside', hovertemplate: '%{y}<br>odds %{text}<extra></extra>' }],
          { margin: { l: 190 }, xaxis: { title: { text: 'Odds ratio (1 = no effect)' } }, shapes: [{ type: 'line', x0: 1, x1: 1, yref: 'paper', y0: 0, y1: 1, line: { color: INK, width: 1.2 } }] });
      } },
      { label: 'K-nearest neighbours', controls: [{ id: 'fx', label: 'x-axis feature', type: 'select', options: FE, value: 'log_gdp_per_capita' }, { id: 'fy', label: 'y-axis feature', type: 'select', options: FE, value: 'basic_sanitation_pct' },
        { id: 'k', label: 'Neighbours that vote (k)', type: 'range', min: 1, max: 50, value: 9 }, { id: 'country', label: 'Query country', type: 'select', options: META.country_list, value: 'India' }, { id: 'year', label: 'Query year', type: 'range', min: META.year_min, max: META.year_max, value: META.year_max - 4 }, { id: 'zoom', label: 'Zoom to the neighbourhood', type: 'check', value: 1 }],
      render: async (v, el) => {
        const r = await api('clf/knn2d', { thr: v.thr, k: v.k, fx: v.fx, fy: v.fy, country: v.country, year: v.year, zoom: v.zoom });
        if (r.error) { el.innerHTML = note(esc(r.error), 'warn'); return; }
        const [a, ha] = pdiv('tall'), [b, hb] = pdiv(), Q = r.query, nb = r.nb, right = Q.truly_good === r.pred_good;
        el.innerHTML = stats(['Query', `${esc(Q.country)} ${Q.year}`, `life expectancy ${fmt(Q.life, 1)}`], ['Vote', `${r.votes_good} good · ${r.k - r.votes_good} not`, `more than ${r.k / 2} needed for "good"`], ['KNN predicts', r.pred_good ? 'good' : 'not good', right ? 'correct' : `wrong (actual: ${Q.truly_good ? 'good' : 'not good'})`, right ? 'up' : 'down'], ['Accuracy, these 2 features', pct(r.acc2)])
          + fig(ha, `<b>KNN has no training step.</b> To classify the star it takes the ${r.k} closest labelled points (rings, inside the dashed ellipse) and lets them vote. The background shows what KNN would predict at every position. ${esc(Q.country)} is left out of the training data, otherwise its own other years would be its nearest neighbours.`)
          + section('Choosing k') + fig(hb, 'Small k gives a ragged boundary: near-perfect on training data but worse on new countries (overfitting). Large k over-smooths (underfitting). The dotted line marks the k above. This curve uses all ten features.');
        const T = Array.from({ length: 61 }, (_, i) => i / 60 * 2 * Math.PI), tr = [{ type: 'heatmap', x: r.gx, y: r.gy, z: r.z, colorscale: REGION_SCALE, zmin: 0, zmax: 1, showscale: false, hoverinfo: 'skip' }];
        [[0, 'not good', TERRA], [1, 'good', GOOD]].forEach(([l, n, c]) => { const ix = r.pts.label.map((x, i) => x === l ? i : -1).filter(i => i >= 0); tr.push(dots(`${n} (training)`, ix.map(i => r.pts.x[i]), ix.map(i => r.pts.y[i]), c, .75, 5)); });
        const lx = [], ly = []; nb.x.forEach((x, i) => { lx.push(Q.x, x, null); ly.push(Q.y, nb.y[i], null); });
        tr.push({ type: 'scatter', mode: 'lines', name: 'distance to neighbours', x: lx, y: ly, line: { color: INK2, width: 1 }, hoverinfo: 'skip' }, { type: 'scatter', mode: 'lines', name: 'radius of the k-th neighbour', x: T.map(t => Q.x + r.radius_x * Math.cos(t)), y: T.map(t => Q.y + r.radius_y * Math.sin(t)), line: { color: INK, width: 1.4, dash: 'dash' }, hoverinfo: 'skip' },
          { type: 'scatter', mode: 'markers', name: `${r.k} nearest neighbours`, x: nb.x, y: nb.y, marker: { symbol: 'circle-open', size: 15, color: INK, line: { color: INK, width: 2 } }, hovertemplate: 'neighbour<br>%{x:.2f}, %{y:.2f}<extra></extra>' },
          { type: 'scatter', mode: 'markers+text', name: 'query', x: [Q.x], y: [Q.y], text: [`${Q.country} ${Q.year}`], textposition: 'top center', textfont: { color: INK, size: 14 }, marker: { symbol: 'star', size: 20, color: OCHRE, line: { color: INK, width: 1.2 } } });
        plot(a, tr, { xaxis: { title: { text: r.fx }, range: [r.gx[0], r.gx[r.gx.length - 1]] }, yaxis: { title: { text: r.fy }, range: [r.gy[0], r.gy[r.gy.length - 1]] } });
        const kn = await api('clf/knn', { thr: v.thr });
        plot(b, [{ x: kn.rows.map(o => o.k), y: kn.rows.map(o => o.train), name: 'training accuracy', mode: 'lines+markers', line: { width: 2.2, color: SLATE } }, { x: kn.rows.map(o => o.k), y: kn.rows.map(o => o.test), name: 'test accuracy', mode: 'lines+markers', line: { width: 2.2, color: TERRA } }], { xaxis: { title: { text: 'k' } }, yaxis: { title: { text: 'Accuracy' } }, shapes: [vline(v.k, BURG)] });
      } },
      { label: 'Evaluation', controls: [{ id: 'k', label: 'KNN: k', type: 'range', min: 1, max: 50, value: 9 }, { id: 'logC', label: 'Logistic: log10(C)', type: 'range', min: -3, max: 3, step: .5, value: 0, fmt: v => (+v).toFixed(1) }, { id: 'dec', label: 'Decision threshold on P(good)', type: 'range', min: .1, max: .9, step: .05, value: .5, fmt: v => (+v).toFixed(2) }],
      render: async (v, el) => {
        const r = await api('clf/run', { thr: v.thr, k: v.k, logC: v.logC, dec: v.dec }); const [a, ha] = pdiv('tall'); const ids = Object.keys(r.cm).map(() => pdiv('short'));
        el.innerHTML = `<p class="sub">All three models use all ten features and are tested on countries they never saw during training.</p>` + table([{ k: 'model', label: 'Model' }, ...['Accuracy', 'Precision', 'Recall', 'F1', 'ROC-AUC', 'Log-loss'].map(k => ({ k, label: k, num: 1 }))], r.rows, { max: ['Accuracy', 'Precision', 'Recall', 'F1', 'ROC-AUC'], min: ['Log-loss'] })
          + `<p class="sub" style="margin-top:8px"><b>Precision:</b> of countries called good, how many are. <b>Recall:</b> of truly good countries, how many were found. <b>ROC-AUC:</b> chance that a random good country scores above a random not-good one.</p>`
          + section('Confusion matrices') + `<div class="grid g3">${ids.map(i => fig(i[1])).join('')}</div><p class="sub" style="margin-top:8px">Raising the decision threshold trades recall for precision.</p>` + section('ROC curves') + fig(ha, 'The closer a curve hugs the top-left corner, the better the model separates the classes; the dashed diagonal is random guessing.');
        Object.entries(r.cm).forEach(([n, cm], i) => { const [[tn, fp], [fn, tp]] = cm; plot(ids[i][0], [{ type: 'heatmap', z: cm, x: ['Predicted: not good', 'Predicted: good'], y: ['Actual: not good', 'Actual: good'], colorscale: [[0, '#eff1ed'], [1, '#7f9fef']], showscale: false, text: cm.map(r => r.map(String)), texttemplate: '%{text}', textfont: { size: 22, color: INK }, hoverinfo: 'skip' }], { title: `${n}: TP ${tp} · FP ${fp} · FN ${fn} · TN ${tn}`, yaxis: { autorange: 'reversed' }, margin: { l: 120, t: 50 } }); });
        plot(a, [...r.rows.map((o, i) => ({ x: r.roc[o.model].fpr, y: r.roc[o.model].tpr, name: `${o.model} (AUC ${fmt(o['ROC-AUC'])})`, mode: 'lines', line: { width: 2.6, color: COLORS[i] } })), { x: [0, 1], y: [0, 1], name: 'random guess', mode: 'lines', line: { dash: 'dash', color: MUTE, width: 1.4 } }], { xaxis: { title: { text: 'False-positive rate' } }, yaxis: { title: { text: 'True-positive rate' } } });
      } }]
  });
};
