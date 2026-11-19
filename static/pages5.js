/* Methods and reproducibility, and How to cite. Every number here is computed from the loaded data (see /api/methods). */
const pm = (m, s, d = 2) => `${(+m).toFixed(d)} ± ${(+s).toFixed(d)}`;
function jump(root) { $$('[data-jump]', root).forEach(a => a.onclick = e => { e.preventDefault(); const t = document.getElementById(a.dataset.jump); if (t) t.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); }); }

PAGES.methods = async root => {
  root.innerHTML = headHTML({ eyebrow: 'Methods and reproducibility', title: 'How the results were produced', lede: 'Everything on this site is computed from the data described here. This page documents the sources, data preparation, evaluation protocol, results against baselines, software versions and limitations, so that the work can be reproduced and assessed.' })
    + `<p class="sub" id="mt-wait" style="margin-top:22px">Computing the cross-validated results (about 25 seconds the first time).</p><div class="methods" id="mt-body"></div>`;
  let m;
  try { m = await api('methods'); } catch (e) { $('#mt-wait').textContent = 'Could not load the methods summary: ' + e.message; return; }
  $('#mt-wait').remove();
  const reg = m.cv.regression, clf = m.cv.classification, rf = reg[2], rd = reg[1], gb = clf[2], bl = clf[0], mb = reg[0], sp = m.split, src = m.source;
  const fetched = src.fetched_at ? src.fetched_at.replace('T', ' ') : m.file_mtime;
  const sections = [['m-sum', 'Summary'], ['m-data', 'Data'], ['m-prep', 'Data preparation'], ['m-design', 'Experimental design'], ['m-models', 'Algorithms'], ['m-res', 'Results'], ['m-lim', 'Limitations and ethics'], ['m-repro', 'Reproducibility']];
  $('#mt-body').innerHTML = `
    <div class="toc" style="margin-top:26px">${sections.map(([id, t], i) => `<a href="#" data-jump="${id}">${i + 1}. ${t}</a>`).join('')}</div>

    <h2 class="sec" id="m-sum">1. Summary</h2>
    <div class="abstract"><b>Data.</b> ${m.rows.toLocaleString()} country-year observations for ${m.countries} countries (${m.year_min}-${m.year_max}) from the World Bank Open Data API, covering ${m.indicators.length} health, demographic and economic indicators.
      <b>Task.</b> Predict life expectancy at birth (regression) and whether it reaches 70 years (classification) from ten indicators that governments measure and influence.
      <b>Evaluation.</b> Five-fold cross-validation in which whole countries are held out, with trivial baselines.
      <b>Results.</b> A random forest explains R&sup2; = ${pm(rf.r2_mean, rf.r2_sd)} of the variance (ridge regression ${pm(rd.r2_mean, rd.r2_sd)}; mean baseline ${(+mb.r2_mean).toFixed(2)}), and gradient boosting classifies ${pct(gb.acc_mean)} of unseen country-years correctly (majority-class baseline ${pct(bl.acc_mean)}). All figures on this site are computed from these data when a page is opened.</div>

    <h2 class="sec" id="m-data">2. Data</h2>
    <p class="sec-sub"><b>Source.</b> World Bank Open Data API (version 2), retrieved ${esc(fetched)}. Working file <span class="mono">${esc(m.file)}</span>. The SHA-256 fingerprint of that file is <span class="mono">${m.fingerprint}</span>; it changes whenever the data are refreshed, so it identifies exactly which data produced the results shown.</p>
    ${table([{ k: 'code', label: 'World Bank code' }, { k: 'variable', label: 'Variable' }, { k: 'unit', label: 'Unit' }, { k: 'observed', label: 'Observed country-years', f: x => x.toLocaleString(), num: 1 }, { k: 'share', label: 'Share of all', f: x => pct(x, 0), num: 1 }, { k: 'first_year', label: 'First year', f: x => x, num: 1 }, { k: 'countries', label: 'Countries', f: x => x, num: 1 }], m.indicators)}
    <p class="sub" style="margin-top:8px">"Observed" counts values actually reported (before any imputation) among the ${m.rows.toLocaleString()} country-years that have a life-expectancy value. Several indicators are sparse before 2000.</p>
    <h3 style="margin:26px 0 10px;font-size:22px">Data sources, licences and terms</h3>
    <p class="sub" style="margin-bottom:10px">As stated on each provider's pages when checked on 19 November 2026. Check the current terms before reusing any of these data.</p>
    ${table([{ k: 's', label: 'Source' }, { k: 'u', label: 'Used for' }, { k: 'l', label: 'Licence / terms' }, { k: 'n', label: 'Attribution and notes' }], [
      { s: 'World Bank Open Data', u: 'All historical indicators and every model', l: 'CC BY 4.0 (the default for datasets produced by the World Bank; individual datasets can differ and are labelled on their metadata pages)', n: 'Credit the World Bank and indicate any changes. Series are modelled estimates that are revised over time.' },
      { s: 'WHO Global Health Observatory', u: 'Live Pulse: life expectancy at birth, as an independent second source', l: 'WHO data terms of use. The pages checked name no Creative Commons licence for data; use is for public-health purposes, not for promoting a commercial enterprise, and the data may not be sold', n: 'WHO suggests citing: WHO, title of dataset, year, date of access, and acknowledging the countries that supplied the underlying data.' },
      { s: 'Open-Meteo', u: 'Live Pulse: air quality and weather at the capital', l: 'Free API for non-commercial use; data under CC BY 4.0. Public research and educational use count as non-commercial', n: 'Credit Open-Meteo. Values are model estimates for one point (the capital), not national averages.' },
      { s: 'disease.sh', u: 'Live Pulse: COVID-19 counts, flags, population', l: 'API terms of use; the code is GPL-3.0. Data are aggregated from Johns Hopkins CSSE, Worldometers and national sources, whose own licences were not verified here', n: 'Used for illustration only. Check the upstream terms before using these counts in a publication.' },
      { s: 'Wikimedia Commons', u: 'Photographs and satellite imagery', l: 'Per image: CC BY, CC BY-SA or public domain', n: 'Author and licence are shown beside each image and in the credits on the Overview page.' },
      { s: 'PayPal Sandbox', u: 'Fund Impact test payments', l: 'PayPal developer sandbox terms', n: 'Test environment only; no real transaction takes place.' }])}

    <h2 class="sec" id="m-prep">3. Data preparation</h2>
    <ol>
      <li><b>Sample.</b> Keep country-years with a reported life expectancy (${m.rows.toLocaleString()} rows). Regional aggregates are excluded.</li>
      <li><b>Missing values.</b> Fill gaps of up to five years by linear interpolation within a country; then use the median of the country's income group in the same decade; finally the global median. An "observed" flag records which values were real, and that flag is used wherever imputed values would mislead.</li>
      <li><b>Features.</b> Ten predictors: ${m.features.map(f => esc(f.label)).join('; ')}. Wealth and spending are log-transformed to reduce skew.</li>
      <li><b>Leakage control.</b> Birth rate, death rate and infant mortality are excluded when predicting life expectancy because they are near-synonyms of the outcome.</li>
      <li><b>Illustrations.</b> Figures that draw one or two features (a regression line, KNN neighbours, SVM boundary, tree regions) use only rows where those features were observed, because median-filled values create artificial vertical stripes. The chatbot answers from observed values only.</li>
    </ol>

    <h2 class="sec" id="m-design">4. Experimental design</h2>
    <ul class="plain">
      <li><b>Targets.</b> Regression: life expectancy at birth (years). Classification: life expectancy of at least 70 years (adjustable on the pages); ${pct(m.cv.positive_share)} of country-years are positive.</li>
      <li><b>Hold-out split.</b> Grouped by country (random seed ${sp.seed}, ${pct(sp.test_fraction, 0)} of countries held out): ${sp.train_rows.toLocaleString()} training rows from ${sp.train_countries} countries and ${sp.test_rows.toLocaleString()} test rows from ${sp.test_countries} countries, with ${sp.overlap_countries} countries in both. Rows from one country are near-duplicates, so a random row split would leak information and overstate accuracy.</li>
      <li><b>Cross-validation.</b> ${m.cv.folds}-fold GroupKFold over countries, used for the results in section 6. Hyper-parameter searches use 4-fold GroupKFold on training countries only.</li>
      <li><b>Metrics.</b> Regression: R&sup2; and root-mean-square error (years). Classification: accuracy, F1 and ROC-AUC. Spread is the sample standard deviation across folds.</li>
      <li><b>Baselines.</b> A model that always predicts the training mean, and one that always predicts the majority class.</li>
    </ul>

    <h2 class="sec" id="m-models">5. Algorithms</h2>
    ${table([{ k: 'a', label: 'Family' }, { k: 'd', label: 'Implementation and main settings' }, { k: 'w', label: 'Where' }], [
      { a: 'Linear, polynomial, Ridge, Lasso, Elastic Net, KNN and decision-tree regression', d: 'scikit-learn; standardised inputs; penalty strength, polynomial degree, k and depth are interactive', w: 'Regression' },
      { a: 'Gaussian Naive Bayes, logistic regression (L2), KNN classifier', d: 'scikit-learn; standardised inputs; C and k interactive; decision threshold adjustable', w: 'Classification' },
      { a: 'Decision tree, SVM, bagging, random forest, AdaBoost, gradient boosting, voting, stacking', d: 'scikit-learn; Gini or entropy; cost-complexity pruning; SVM fitted on a 2,000-row subsample for speed; grid and randomised search', w: 'Trees & Ensembles' },
      { a: 'K-means, hierarchical, DBSCAN, PCA, LDA, Isolation Forest, Apriori', d: 'scikit-learn, SciPy and mlxtend; features standardised; Apriori on low/mid/high terciles', w: 'Discovery' },
      { a: 'BFS, DFS, depth-limited, iterative deepening, bidirectional, uniform-cost, greedy, A*, hill climbing, CSP, minimax with alpha-beta', d: 'Implemented from scratch in Python', w: 'Search' },
      { a: 'Forward and backward chaining over first-order-logic rules', d: 'Hand-written knowledge base with adjustable thresholds', w: 'Expert system' }])}

    <h2 class="sec" id="m-res">6. Results</h2>
    <p class="sec-sub">${m.cv.folds}-fold cross-validation with whole countries held out; mean ± standard deviation across folds. Single hold-out numbers shown inside the labs differ slightly from these means.</p>
    <h3 style="margin:14px 0 8px;font-size:20px">Regression: life expectancy (years)</h3>
    ${table([{ k: 'model', label: 'Model' }, { k: 'r2', label: 'R²', num: 1 }, { k: 'rmse', label: 'RMSE (years)', num: 1 }], reg.map(x => ({ model: x.model, r2: pm(x.r2_mean, x.r2_sd, 3), rmse: pm(x.rmse_mean, x.rmse_sd, 2) })))}
    <h3 style="margin:22px 0 8px;font-size:20px">Classification: life expectancy of at least 70 years</h3>
    ${table([{ k: 'model', label: 'Model' }, { k: 'acc', label: 'Accuracy', num: 1 }, { k: 'f1', label: 'F1', num: 1 }, { k: 'auc', label: 'ROC-AUC', num: 1 }], clf.map(x => ({ model: x.model, acc: pm(x.acc_mean, x.acc_sd, 3), f1: pm(x.f1_mean, x.f1_sd, 3), auc: pm(x.auc_mean, x.auc_sd, 3) })))}
    ${note('Both families clearly beat their baselines, and the gap between ridge regression and the random forest shows a modest non-linear signal. Cross-validated figures are the ones to quote; the hold-out figures in the labs use a single split and move a little with the random seed.')}

    <h2 class="sec" id="m-lim">7. Limitations and ethics</h2>
    <ul class="plain">
      <li><b>Country-level, ecological data.</b> The models describe associations between countries and years. They say nothing about individuals and cannot establish that raising spending, sanitation or physician numbers <i>causes</i> longer lives.</li>
      <li><b>Illustrative impact estimates.</b> The Fund Impact page scales a model's predicted gain linearly with programme cost. It illustrates a calculation; it is not evidence of what a donation would achieve.</li>
      <li><b>Imputation.</b> Sparse indicators are partly imputed (section 3). The effect on results has not been separately quantified here.</li>
      <li><b>Data quality.</b> World Bank series are modelled estimates and are revised. Implausible values are kept and surfaced rather than silently removed; for example, in the data used here Central African Republic's 2022 life expectancy is 18.8 years, against about 57 the following year. The anomaly detector flags such points.</li>
      <li><b>Target definition.</b> The 70-year threshold is a convention; results change with it, which is why it is adjustable.</li>
      <li><b>Live sources.</b> COVID-19 counts pass through an aggregator, and air quality and weather are single-point model estimates for the capital city, not national measurements.</li>
      <li><b>Data refresh.</b> Downloading newer World Bank data changes results. Record the dataset fingerprint (section 2) with any number you cite.</li>
      <li><b>Not medical advice.</b> This is an educational and research tool. Payments on the donation page are PayPal sandbox test transactions only.</li>
    </ul>

    <h2 class="sec" id="m-repro">8. Reproducibility</h2>
    <p class="sub" style="margin-bottom:8px">Random seeds: 42 for the country split, 0 for forests, boosting and clustering. Software used for this page:</p>
    ${table([{ k: 'k', label: 'Component' }, { k: 'v', label: 'Version' }], Object.entries(m.software).map(([k, v]) => ({ k, v: v || 'n/a' })))}
    <p style="margin-top:14px"><b>Run it yourself</b> (Python 3.12):</p>
    <div class="codeblock">git clone ${esc((ABOUT && ABOUT.repository) || '')}\ncd AIML_Final_Project\n./run.sh    # creates a virtual environment, installs requirements and starts http://localhost:5050</div>
    <p class="sub"><b>Data availability.</b> The stored snapshot is <span class="mono">data/sdg3_health_raw.csv</span> in the repository; the site can re-download all indicators from the World Bank API. <b>Code availability.</b> ${ABOUT && ABOUT.repository ? `<a href="${esc(ABOUT.repository)}" target="_blank" rel="noopener">${esc(ABOUT.repository)}</a>` : 'See the repository.'} Every chart can be downloaded as PNG, SVG or CSV from the links under it.</p>`;
  jump(root);
};

PAGES.cite = async root => {
  root.innerHTML = headHTML({ eyebrow: 'How to cite', title: 'Cite this work', lede: 'Please cite the platform and, where you quote a specific figure, the page it came from and the dataset fingerprint shown on the Methods page.' }) + '<div id="ct-body" style="margin-top:26px"></div>';
  const a = ABOUT || await api('about'), body = $('#ct-body');
  const copy = (btn, text) => btn.onclick = async () => { try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; setTimeout(() => btn.textContent = 'Copy', 1500); } catch (e) { toast('Select the text and copy it manually.', true); } };
  body.innerHTML = `
    <h2 class="sec" style="margin-top:0">Suggested citation</h2>
    <div class="codeblock" id="ct-apa">${esc(a.apa)}</div><button class="btn" id="ct-apa-b">Copy</button>
    <h2 class="sec">BibTeX</h2>
    <div class="codeblock" id="ct-bib">${esc(a.bibtex)}</div><button class="btn" id="ct-bib-b">Copy</button>
    <h2 class="sec">Authors</h2>
    <p>${a.authors.map(x => esc(x.given + ' ' + x.family)).join('; ')}.</p><p class="sub">${esc(a.affiliation)}. Prepared for the course ${esc(a.course)}. Version ${esc(a.version)}, ${a.year}.${a.doi ? ` DOI: ${esc(a.doi)}.` : ''}</p>
    <h2 class="sec">Data and code availability</h2>
    <p class="sub" style="max-width:80ch">The analysis uses World Bank Open Data (CC BY 4.0). Complementary live feeds come from WHO, disease.sh and Open-Meteo under their own terms, summarised in the licence table on the <a href="#methods" id="ct-m">Methods</a> page. Source code and the stored data snapshot are in the repository: <a href="${esc(a.repository)}" target="_blank" rel="noopener">${esc(a.repository)}</a>. Photographs are used under the licences credited on the Overview page.</p>
    <h2 class="sec">Acknowledgements</h2>
    <p class="sub" style="max-width:80ch">We thank the World Bank, the World Health Organization, the maintainers of disease.sh and Open-Meteo, and the photographers and agencies credited on the Overview page for making their data and images openly available.</p>`;
  copy($('#ct-apa-b'), a.apa); copy($('#ct-bib-b'), a.bibtex);
  $('#ct-m').onclick = e => { e.preventDefault(); go('methods'); };
};
