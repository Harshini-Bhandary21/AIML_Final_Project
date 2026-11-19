/* Overview: purpose, data credibility, a rotating globe, a 55-year time-lapse, photo cards tied to real indicators, module guide, data & model status */
const PAGES = {};


/* real satellite imagery (NASA Blue Marble) on a rotating 3D globe: drag to spin */
function initSatellite(el) {
  if (!window.THREE) { el.innerHTML = '<p class="sub">3D globe unavailable.</p>'; return; }
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, .1, 100); cam.position.z = 7.4;
  const ren = new THREE.WebGLRenderer({ antialias: true, alpha: true }); ren.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(ren.domElement);
  const tex = new THREE.TextureLoader().load('/static/img/earth-satellite.jpg'); tex.anisotropy = 8;
  const globe = new THREE.Mesh(new THREE.SphereGeometry(2, 96, 96), new THREE.MeshPhongMaterial({ map: tex, shininess: 6 }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(2.1, 64, 64), new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 n; void main(){ float i = pow(.72 - dot(n, vec3(0.,0.,1.)), 3.); gl_FragColor = vec4(.35,.7,.9,1.) * i; }' }));
  scene.add(globe, glow); scene.add(new THREE.AmbientLight(0xffffff, .6)); const sun = new THREE.DirectionalLight(0xffffff, .85); sun.position.set(-4, 2, 5); scene.add(sun);
  globe.rotation.set(.25, -1.6, .1);
  const size = () => { const w = el.clientWidth || 400; ren.setSize(w, w); cam.updateProjectionMatrix(); }; size(); addEventListener('resize', size);
  let drag = false, px = 0, py = 0; const vx = REDUCED ? 0 : .0028;
  el.style.cursor = 'grab'; el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', e => { drag = true; px = e.clientX; py = e.clientY; el.style.cursor = 'grabbing'; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointerup', () => { drag = false; el.style.cursor = 'grab'; });
  el.addEventListener('pointermove', e => { if (!drag) return; globe.rotation.y += (e.clientX - px) * .006; globe.rotation.x = Math.max(-1.1, Math.min(1.1, globe.rotation.x + (e.clientY - py) * .004)); px = e.clientX; py = e.clientY; });
  const loop = () => { if (!el.isConnected) return; if (!el.hidden && el.closest('.page.on') && !document.hidden) { if (!drag) globe.rotation.y += vx; ren.render(scene, cam); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

/* a small rotating globe coloured by life expectancy (drag it, or hover to pause) */
async function initGlobe(el) {
  const mp = await api('map', { indicator: 'life_expectancy', year: META.year_max });
  let lon = 25;
  await plot(el, [{ type: 'choropleth', locations: mp.iso3, z: mp.value, text: mp.country, colorscale: SEQ, showscale: false, marker: { line: { color: '#eff1ed', width: .4 } }, hovertemplate: '<b>%{text}</b><br>%{z:.1f} years<extra></extra>' }],
    { margin: { l: 0, r: 0, t: 0, b: 0 }, geo: { projection: { type: 'orthographic', rotation: { lon, lat: 12, roll: 0 } }, bgcolor: 'rgba(0,0,0,0)', showframe: false, showcoastlines: false, showland: true, landcolor: '#e3e7eb', showocean: true, oceancolor: '#e3e7eb', showcountries: false, showlakes: false,
      lonaxis: { showgrid: true, gridcolor: 'rgba(119,131,151,.28)' }, lataxis: { showgrid: true, gridcolor: 'rgba(119,131,151,.28)' } } }, { scrollZoom: false });
  const n = mp.iso3.length, wd = () => Array(n).fill(.4);
  el.on('plotly_hover', e => { const w = wd(); w[e.points[0].pointNumber] = 2.2; Plotly.restyle(el, { 'marker.line.width': [w], 'marker.line.color': '#14243a' }); });
  el.on('plotly_unhover', () => Plotly.restyle(el, { 'marker.line.width': [wd()], 'marker.line.color': '#fafbf8' }));
  if (REDUCED) return;
  let paused = false, last = 0;
  el.addEventListener('mouseenter', () => paused = true);
  el.addEventListener('mouseleave', () => { try { lon = el._fullLayout.geo.projection.rotation.lon; } catch (e) { } paused = false; });
  const tick = t => {
    if (!el.isConnected) return;
    if (!paused && !document.hidden && el.closest('.page.on') && !el.hidden && t - last > 50) { lon = (lon + (last ? (t - last) * 360 / 35000 : 0)) % 360; Plotly.relayout(el, { 'geo.projection.rotation.lon': lon }); last = t; } else if (paused || el.hidden) last = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

PAGES.home = root => {
  const m = META, s = m.source;
  const fresh = m.live ? `live copy synced ${ago(m.live_age_h)}` : 'stored snapshot (the site refreshes it from the World Bank automatically)';
  root.innerHTML = headHTML({
    home: true, dark: 'dark', eyebrow: 'Sustainable Development Goal 3 · Good Health and Well-being',
    title: 'What can machine learning tell us about global health?',
    lede: 'An interactive observatory that applies machine-learning and AI methods to 55 years of World Bank health data for 217 countries. Every figure is computed from the data when you open it.',
    art: '<div class="globebox"><svg class="heroecg" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60 H150 l14 -14 l14 14 H230 l12 8 l18 -58 l20 100 l16 -50 H350 l14 -18 l14 18 H600"/></svg><div id="hm-globe" class="globe"></div><div id="hm-sat" class="globe" hidden></div></div><div class="seg globeseg" id="hm-gseg"><button class="on" data-v="data">Life expectancy</button><button data-v="sat">Satellite</button></div><div class="credit" id="hm-gcr">Life expectancy, latest year. Hover a country, drag to rotate.</div>',
    extra: `<div class="herobtns"><button class="btn primary" id="hb-ins">Explore insights</button><button class="btn" id="hb-met">Explore methods</button></div><div class="provenance"><span><b>Data</b> World Bank Open Data · ${m.year_min}-${m.year_max}</span><span><b>Live feeds</b> WHO · disease.sh · Open-Meteo</span><span><b>Status</b> ${fresh}</span></div>`
  }) + `
    <div class="stats float" id="hm-stats">${kpi('Countries', '<span data-c="' + m.countries + '">0</span>')}${kpi('Years of data', '<span data-c="' + (m.year_max - m.year_min + 1) + '">0</span>')}${kpi('Health indicators', '<span data-c="15">0</span>')}${kpi('Country-years analysed', '<span data-c="' + m.rows + '">0</span>')}</div>
    <div class="sechead" id="hm-ins"><div><h2 class="sec">The world through time</h2><p class="sec-sub">Choose an indicator and a year, or press play to watch it change from ${m.year_min} to ${m.year_max}. Darker means a higher value.</p></div><div class="row"><span class="yearbadge" id="hm-year">${m.year_max}</span><button class="btn primary" id="hm-play">Play time-lapse</button></div></div>
    <div id="hm-ctl"></div>
    <figure class="fig" style="margin-top:14px"><div id="hm-map" class="plot tall"></div><figcaption id="hm-cap"></figcaption></figure>
    <div class="grid g2" style="margin-top:20px">
      <figure class="fig"><div id="hm-inc" class="plot"></div><figcaption>Life expectancy has risen in every income group since 1970, but the gap between low- and high-income countries is still about two decades.</figcaption></figure>
      <figure class="fig"><div id="hm-pre" class="plot"></div><figcaption>Wealth and longevity (the Preston curve): returns diminish above about $10,000 per person, so how a country spends matters more than how much. Press play to watch the whole world move.</figcaption></figure>
    </div>
    <h2 class="sec">Health in focus</h2>
    <p class="sec-sub">Four measures that the models on this site find most telling, shown as the average of low-income and high-income countries (each country's latest observed value).</p>
    <div class="photos" id="hm-photos"></div>
    <h2 class="sec">What is inside</h2>
    <p class="sec-sub">Each module pairs one part of the syllabus with a question about health.</p>
    <div id="hm-mods"></div>
    <h2 class="sec">Data and models</h2>
    <div class="grid g2"><div class="card" id="hm-data"></div><div class="card" id="hm-bench"></div></div>
    <details style="margin-top:28px"><summary>Image credits</summary><div id="hm-credits" style="margin-top:12px"></div></details>`;

  $$('[data-c]', root).forEach(e => countUp(e, +e.dataset.c, 0, 1100));
  initGlobe($('#hm-globe'));
  let satInit = false;
  $$('#hm-gseg button', root).forEach(b => b.onclick = () => {
    const sat = b.dataset.v === 'sat'; $$('#hm-gseg button', root).forEach(x => x.classList.toggle('on', x === b));
    $('#hm-sat').hidden = !sat; $('#hm-globe').hidden = sat;
    $('#hm-gcr').textContent = sat ? 'Satellite image: NASA Earth Observatory (Blue Marble), via Wikimedia Commons. Drag to rotate.' : 'Life expectancy, latest year. Hover a country, drag to rotate.';
    if (sat && !satInit) { satInit = true; initSatellite($('#hm-sat')); }
    if (!sat) { try { Plotly.Plots.resize($('#hm-globe')); } catch (e) { } }
  });
  $('#hb-ins').onclick = () => $('#hm-ins').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  $('#hb-met').onclick = () => go('methods');

  /* --- map + wealth-and-longevity, with time-lapse --- */
  const state = { ind: 'life_expectancy', year: m.year_max }; let playing = null, cache = null;
  const drawMap = (mp, range) => plot('hm-map', [{ type: 'choropleth', locations: mp.iso3, z: mp.value, text: mp.country, colorscale: SEQ, zmin: range && range[0], zmax: range && range[1], marker: { line: { color: '#eff1ed', width: .5 } }, colorbar: { title: { text: nice(state.ind) }, thickness: 10, len: .7, outlinewidth: 0, tickfont: { size: 13 } }, hovertemplate: '<b>%{text}</b><br>%{z:.1f}<extra></extra>' }],
    { margin: { l: 0, r: 0, t: 6, b: 0 }, geo: { bgcolor: 'rgba(0,0,0,0)', showframe: false, showcoastlines: false, projection: { type: 'natural earth' }, landcolor: '#e3e7eb', showcountries: false, showlakes: false } });
  const drawPreston = (pm, y) => plot('hm-pre', INCOME_ORDER.map(g => { const ix = pm.income.map((x, i) => x === g ? i : -1).filter(i => i >= 0); return { type: 'scatter', mode: 'markers', name: g, x: ix.map(i => pm.gdp[i]), y: ix.map(i => pm.le[i]), text: ix.map(i => pm.country[i]), marker: { size: ix.map(i => Math.max(6, Math.sqrt(pm.pop[i] / 1e6) * 2.1)), color: INCOME[g], opacity: .72, line: { color: '#fff', width: .6 } }, hovertemplate: '<b>%{text}</b><br>GDP per person $%{x:,.0f}<br>life expectancy %{y:.1f}<extra></extra>' }; }),
    { title: `Wealth vs life expectancy, ${y} (bubble = population)`, xaxis: { type: 'log', range: [2.3, 5.25], title: { text: 'GDP per person, US$ (log scale)' } }, yaxis: { range: [20, 90], title: { text: '' } } });
  const caption = (mp, y) => { const ok = mp.value.filter(x => x != null); if (!ok.length) return; $('#hm-cap').innerHTML = `${esc(nice(state.ind))}, ${y}. Highest: <b>${esc(mp.country[mp.value.indexOf(Math.max(...ok))])}</b> (${fmt(Math.max(...ok), 1)}); lowest: <b>${esc(mp.country[mp.value.indexOf(Math.min(...ok))])}</b> (${fmt(Math.min(...ok), 1)}). Countries without a reported value are left blank.`; };
  const draw = async () => { const mp = await api('map', { indicator: state.ind, year: state.year }); drawMap(mp); caption(mp, state.year); drawPreston(mp, state.year); $('#hm-year').textContent = state.year; };
  const incomeTrend = async () => { const gr = await api('group', { indicator: 'life_expectancy' }); plot('hm-inc', INCOME_ORDER.filter(g => gr[g]).map(g => ({ x: gr[g].year, y: gr[g].value, name: g, mode: 'lines', line: { width: 2.8, color: INCOME[g] } })), { title: 'Life expectancy by income group (years)' }); };
  const slider = () => $('#hm-ctl input[type=range]'), setSlider = y => { const r = slider(); r.value = y; $('#hm-ctl output').textContent = y; };
  const stop = () => { clearInterval(playing); playing = null; $('#hm-play').textContent = 'Play time-lapse'; };
  const play = async () => {
    if (playing) return stop();
    const btn = $('#hm-play'); btn.textContent = 'Loading'; btn.disabled = true;
    const years = Array.from({ length: m.year_max - m.year_min + 1 }, (_, i) => m.year_min + i);
    cache = await Promise.all(years.map(y => api('map', { indicator: state.ind, year: y })));
    const all = cache.flatMap(c => c.value.filter(v => v != null)), range = [Math.min(...all), Math.max(...all)];
    btn.disabled = false; btn.textContent = 'Pause';
    let i = state.year >= m.year_max ? 0 : years.indexOf(state.year);
    playing = setInterval(() => {
      if (!$('#page-home').classList.contains('on')) return stop();
      const y = years[i], mp = cache[i]; state.year = y; setSlider(y); $('#hm-year').textContent = y; drawMap(mp, range); drawPreston(mp, y); caption(mp, y);
      if (++i >= years.length) stop();
    }, 330);
  };
  controls($('#hm-ctl'), [{ id: 'ind', label: 'Indicator', type: 'select', options: pickOpts(m.indicators, nice), value: 'life_expectancy' }, { id: 'year', label: 'Year', type: 'range', min: m.year_min, max: m.year_max, value: m.year_max }], v => { if (playing) stop(); Object.assign(state, v); draw(); }, 'slim');
  $('#hm-play').onclick = play; draw(); incomeTrend();

  /* --- photo cards: every figure beside a photo is a measured value --- */
  const cards = [['immunisation', 'measles_immunization_pct', 'Measles immunisation', 'Share of children protected', v => v.toFixed(0) + '%', 'expert', 'An infant receives an oral vaccine at an immunisation clinic in Pokhara, Nepal.', 'Where coverage is low, the expert system flags an immunisation gap.'],
    ['newborn-clinic', 'infant_mortality_per_1000', 'Infant mortality', 'Deaths per 1,000 live births', v => v.toFixed(1), 'reg', 'A mother and her newborn at a clinic in Ramtha, Jordan.', 'The outcome the regression lab learns to predict.'],
    ['handwashing', 'basic_sanitation_pct', 'Basic sanitation', 'Share of people with access', v => v.toFixed(0) + '%', 'search', 'Schoolchildren washing their hands in the Philippines.', 'Sanitation is one lever in the budget-allocation search.'],
    ['health-worker', 'physicians_per_1000', 'Physicians', 'Doctors per 1,000 people', v => v.toFixed(1), 'trees', 'A community health worker on a home visit in Brazil.', 'After wealth, physicians are the strongest signal in the decision tree.']];
  api('focus').then(f => {
    $('#hm-photos').innerHTML = cards.map(([img, col, title, unit, fm, go_, alt, hook]) => { const d = f[col]; return `<article class="photo" data-go="${go_}" tabindex="0"><div class="ph"><img decoding="async" src="/static/img/${img}.jpg" alt="${esc(alt)}"><div class="ov"><div class="u">${title}</div>${d ? `<div class="big">${fm(d.low)} <span>to</span> ${fm(d.high)}</div><div class="sm">${unit}, low- to high-income, ${d.year}</div>` : ''}</div></div><div class="pb"><p>${hook}</p><div class="cr">Photo: ${credit(img)}</div></div></article>`; }).join('');
    $$('.photo', root).forEach(c => { c.onclick = e => { if (e.target.closest('a')) return; go(c.dataset.go); }; c.onkeydown = e => { if (e.key === 'Enter') go(c.dataset.go); }; });
  });

  /* --- module guide --- */
  const mods = [['reg', 'Machine learning', 'Regression', 'Predict life expectancy from spending, sanitation and wealth, and see the fitted line, curve or shrinkage.'], ['clf', 'Machine learning', 'Classification', 'Decide whether a country-year reaches a life-expectancy target: Naive Bayes, logistic regression, KNN.'],
    ['trees', 'Machine learning', 'Trees & Ensembles', 'Follow a country down a decision tree, draw an SVM margin, compare a tree with a forest.'], ['disc', 'Machine learning', 'Discovery', 'Group countries without labels, find outliers such as wars and epidemics, mine if-then rules.'],
    ['search', 'Artificial intelligence', 'Search', 'A*, BFS and DFS on a supply route; budget allocation; vaccination scheduling; minimax.'], ['expert', 'Artificial intelligence', 'Expert system', 'Rule-based reasoning that explains each recommendation, and a chatbot over the data.'],
    ['live', 'Live data', 'Live Pulse', 'WHO, World Bank, COVID-19 and air-quality feeds for any country, right now.'], ['fund', 'Live data', 'Fund Impact', 'A PayPal sandbox donation with a modelled, illustrative estimate of life-years gained.']];
  $('#hm-mods').innerHTML = ['Machine learning', 'Artificial intelligence', 'Live data'].map(g => `<div class="labgroup">${g}</div><div class="labs">${mods.filter(x => x[1] === g).map(x => `<div class="lab module" data-go="${x[0]}" tabindex="0"><div class="ti">${ico(x[0])}</div><div class="t">${x[2]}</div><div class="d">${x[3]}</div><div class="go">Open &rarr;</div></div>`).join('')}</div>`).join('');
  $$('.lab', root).forEach(c => { c.onclick = () => go(c.dataset.go); c.onkeydown = e => { if (e.key === 'Enter') go(c.dataset.go); }; });

  /* --- data freshness + benchmark --- */
  $('#hm-data').innerHTML = `<h3>Data freshness</h3><p class="sub" style="margin:4px 0 10px">Source: World Bank Open Data API. The site updates its stored copy automatically when it is more than ${m.auto_sync || 24} hours old.</p>
    <p>${m.live ? `Live copy downloaded <b>${esc(s.fetched_at || '')}</b>.` : 'Currently showing the stored snapshot.'}</p>
    <div class="row" style="margin-top:12px"><button class="btn primary" id="rf-go">Update from World Bank</button><button class="btn" id="rf-reset" ${m.live ? '' : 'disabled'}>Use stored snapshot</button></div>
    <div class="progress" id="rf-bar" style="display:none"><i></i></div><p class="sub" id="rf-msg"></p>`;
  const poll = async () => {
    const st = await api('refresh/status'); $('#rf-bar i').style.width = (st.progress * 100) + '%'; $('#rf-msg').textContent = st.error ? st.error : st.msg;
    if (st.running) return setTimeout(poll, 1500);
    $('#rf-go').disabled = false; if (st.done) { toast('Data updated. Reloading.'); setTimeout(() => location.reload(), 900); } else if (st.error) toast('Update failed; stored data kept.', true);
  };
  $('#rf-go').onclick = async () => { $('#rf-go').disabled = true; $('#rf-bar').style.display = ''; await api('refresh/start', {}, 'POST'); poll(); };
  $('#rf-reset').onclick = async () => { await api('refresh/reset', {}, 'POST'); location.reload(); };
  api('refresh/status').then(s0 => { if (s0.running) { $('#rf-go').disabled = true; $('#rf-bar').style.display = ''; poll(); } });
  const showBench = rows => $('#hm-bench-out').innerHTML = table([{ k: 'model', label: 'Model' }, { k: 'metric', label: 'Metric' }, { k: 'now', label: 'Now', d: 3 }, { k: 'prev', label: 'Before', d: 3 }, { k: 'delta', label: 'Change', num: 1, f: v => v == null ? '-' : `<span style="color:${v >= 0 ? 'var(--good)' : 'var(--terra)'}">${v >= 0 ? '+' : ''}${v.toFixed(3)}</span>` }], rows);
  $('#hm-bench').innerHTML = `<h3>Model benchmark</h3><p class="sub" style="margin:4px 0 10px">Four headline models retrained on the current data, on countries they have never seen. Compare with the previous run to see the effect of new data.</p><button class="btn" id="bm-go">Retrain models</button><div id="hm-bench-out" style="margin-top:12px"></div>`;
  if (m.last_run) showBench(Object.entries(m.last_run.results).flatMap(([k, o]) => Object.entries(o).map(([mm, x]) => ({ model: k, metric: mm, now: x }))));
  $('#bm-go').onclick = async e => { e.target.disabled = true; e.target.textContent = 'Training'; const r = await api('benchmark', {}, 'POST'); showBench(r.rows); e.target.disabled = false; e.target.textContent = 'Retrain models'; };

  /* --- image credits --- */
  const cr = Object.values(CREDITS);
  decorateFigures(root, 'home', '');
  $('#hm-credits').innerHTML = cr.length ? table([{ k: 'title', label: 'Image' }, { k: 'author', label: 'Author' }, { k: 'license', label: 'Licence', f: (v, r) => r.license_url ? `<a href="${esc(r.license_url)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v) }, { k: 'source', label: 'Source', f: v => `<a href="${esc(v)}" target="_blank" rel="noopener">Wikimedia Commons</a>` }], cr) : '<p class="sub">No images loaded.</p>';
};
