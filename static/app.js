/* Router, horizontal navigation, footer, per-page citation line and background-sync status */
const NAV = [
  { page: 'home', label: 'Overview', icon: 'home' },
  { label: 'Machine learning', items: [['reg', 'Regression', '', 'Predict life expectancy: lines, curves, neighbours and shrinkage'], ['clf', 'Classification', '', 'Naive Bayes, logistic regression and KNN on a life-expectancy target'],
    ['trees', 'Trees & Ensembles', '', 'Decision paths, SVM margins, forests and boosting'], ['disc', 'Discovery', '', 'Clustering, principal components, anomalies and association rules']] },
  { label: 'Artificial intelligence', items: [['search', 'Search', '', 'A*, BFS and DFS, budget allocation, scheduling and minimax'], ['expert', 'Expert system', '', 'Transparent rule-based reasoning and a data chatbot']] },
  { label: 'Live data', items: [['live', 'Live Pulse', 'Live', 'WHO, World Bank, COVID-19 and air-quality feeds for any country'], ['fund', 'Fund Impact', 'Demo', 'PayPal sandbox donation with an illustrative impact estimate']] },
  { page: 'methods', label: 'Methods' },
  { page: 'cite', label: 'Cite', cta: true }
];
const TITLES = { home: 'Overview', methods: 'Methods and reproducibility', cite: 'How to cite this work' };
NAV.forEach(n => (n.items || []).forEach(i => TITLES[i[0]] = i[1]));
let ABOUT = null;
const MOUNTED = {};

function buildNav() {
  $('#topnav').innerHTML = NAV.map((n, gi) => n.items
    ? `<div class="ni" data-g="${gi}"><button class="nbtn" aria-haspopup="true" aria-expanded="false">${n.label}</button><div class="drop">${n.items.map(i => `<a href="#${i[0]}" data-go="${i[0]}"><span class="ti">${ico(i[0])}</span><span><span class="dt">${i[1]}${i[2] ? ` <small>${i[2]}</small>` : ''}</span><span class="dd">${i[3]}</span></span></a>`).join('')}</div></div>`
    : `<div class="ni"><a class="nlink${n.cta ? ' cta' : ''}" href="#${n.page}" data-go="${n.page}">${n.label}</a></div>`).join('');
  $$('[data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); closeMenus(); go(a.dataset.go); }));
  $$('.nbtn').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const ni = b.closest('.ni'), was = ni.classList.contains('open'); closeMenus(); if (!was) { ni.classList.add('open'); b.setAttribute('aria-expanded', 'true'); } }));
  document.addEventListener('click', e => { if (!e.target.closest('.ni')) closeMenus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenus(); $('#topbar').classList.remove('open'); } });
  $('#menu').addEventListener('click', () => { const t = $('#topbar'); t.classList.toggle('open'); $('#menu').setAttribute('aria-expanded', t.classList.contains('open')); });
}
function moveInd() {
  const nav = $('#topnav'); if (!nav) return; let ind = $('.navind', nav); if (!ind) { ind = document.createElement('span'); ind.className = 'navind'; nav.appendChild(ind); }
  const el = $('.nlink.on', nav) || $('.ni.on .nbtn', nav); if (!el || getComputedStyle(nav).position === 'static' || innerWidth <= 1180) { ind.style.opacity = 0; return; }
  const r = el.getBoundingClientRect(), n = nav.getBoundingClientRect(); ind.style.opacity = 1; ind.style.width = (r.width - 28) + 'px'; ind.style.transform = `translateX(${r.left - n.left + 14}px)`;
}
addEventListener('resize', moveInd); if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInd);
function closeMenus() { $$('.ni.open').forEach(n => { n.classList.remove('open'); const b = $('.nbtn', n); if (b) b.setAttribute('aria-expanded', 'false'); }); }

function go(name) {
  if (!PAGES[name]) name = 'home';
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + name));
  $$('.nlink').forEach(a => a.classList.toggle('on', a.dataset.go === name));
  $$('.drop a').forEach(a => a.classList.toggle('on', a.dataset.go === name));
  $$('.ni[data-g]').forEach(g => g.classList.toggle('on', !!$$('.drop a', g).find(a => a.dataset.go === name)));
  if (!MOUNTED[name]) { MOUNTED[name] = true; PAGES[name]($('#page-' + name)); addPageCite(name); }
  else $$('.plot', $('#page-' + name)).forEach(el => { try { Plotly.Plots.resize(el); } catch (e) { } });
  document.body.dataset.page = name; moveInd(); document.title = (name === 'home' ? '' : TITLES[name] + ' · ') + 'SDG-3 AIML Studio';
  history.replaceState(null, '', '#' + name); window.scrollTo({ top: 0 }); $('#topbar').classList.remove('open');
}

/* "How to cite this page", in the manner of Our World in Data */
function addPageCite(name) {
  if (name === 'cite' || !ABOUT) return;
  const text = `${ABOUT.author_short} (${ABOUT.year}). "${TITLES[name]}". ${ABOUT.short_title}, version ${ABOUT.version}. Retrieved ${ABOUT.accessed}, from ${ABOUT.cite_url}#${name}`;
  const d = document.createElement('div'); d.className = 'pagecite';
  d.innerHTML = `<b>How to cite this page</b>${esc(text)} <button class="btn" style="padding:4px 12px;font-size:14px">Copy</button> <a href="#cite" style="margin-left:8px">More formats</a>`;
  $('#page-' + name).appendChild(d);
  $('button', d).onclick = async e => { try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied'; setTimeout(() => e.target.textContent = 'Copy', 1500); } catch (err) { toast('Select the text and copy it manually.', true); } };
  $('a', d).onclick = ev => { ev.preventDefault(); go('cite'); };
}

const ago = h => h == null ? '' : h < 1 ? Math.max(1, Math.round(h * 60)) + ' min ago' : h < 48 ? h.toFixed(h < 10 ? 1 : 0) + ' h ago' : Math.round(h / 24) + ' days ago';
function renderStatus() {
  const s = META.source;
  $('#topstatus').innerHTML = `<span class="dot ${META.live ? '' : 'static'}"></span><span>World Bank data · ${META.live ? 'live copy' : 'stored snapshot'}${s.fetched_at ? ', synced ' + (ago(META.live_age_h) || s.fetched_at) : ''}</span>`;
}
function renderFooter() {
  const a = ABOUT || {};
  $('#sitefoot').innerHTML = `<div class="sitefoot-in">
    <div><b class="ft">SDG-3 AIML Studio</b><p>An interactive, reproducible platform that applies machine learning and AI to country-level health data for Sustainable Development Goal 3.</p><p class="sub" style="margin-top:8px">Version ${esc(a.version || '')} · ${META.rows.toLocaleString()} country-years · ${META.countries} countries · ${META.year_min}-${META.year_max}<br>Data: World Bank, ${META.live ? 'live copy' : 'stored snapshot'}${META.source.fetched_at ? ', synced ' + (ago(META.live_age_h) || META.source.fetched_at) : ''}</p></div>
    <div><h4>Explore</h4><ul><li><a href="#home" data-go="home">Overview</a></li><li><a href="#reg" data-go="reg">Regression</a></li><li><a href="#clf" data-go="clf">Classification</a></li><li><a href="#trees" data-go="trees">Trees &amp; ensembles</a></li><li><a href="#disc" data-go="disc">Discovery</a></li></ul></div>
    <div><h4>Data sources</h4><ul><li><a href="https://data.worldbank.org" target="_blank" rel="noopener">World Bank Open Data</a></li><li><a href="https://www.who.int/data/gho" target="_blank" rel="noopener">WHO Global Health Observatory</a></li><li><a href="https://disease.sh" target="_blank" rel="noopener">disease.sh (COVID-19)</a></li><li><a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a></li><li><a href="#methods" data-go="methods">Licences and terms</a></li></ul></div>
    <div><h4>Research</h4><ul><li><a href="#methods" data-go="methods">Methods and reproducibility</a></li><li><a href="#cite" data-go="cite">Cite this work</a></li>${a.repository ? `<li><a href="${esc(a.repository)}" target="_blank" rel="noopener">Source code</a></li>` : ''}</ul></div>
    <div class="fine">Models describe associations in country-level data and are for education and research; they are not medical advice. Photographs are credited beside each image and on the Overview page. The donation page uses PayPal's sandbox only; no real money moves.</div></div>`;
  $$('#sitefoot [data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(a.dataset.go); }));
}

let wasRunning = false;
async function pollSync() {
  let delay = 12000;
  try {
    const s = await api('refresh/status');
    if (s.running) {
      wasRunning = true; delay = 2500; $('#syncfill').style.width = (s.progress * 100) + '%';
      $('#topstatus').innerHTML = `<span class="dot"></span><span>${s.auto ? 'Updating' : 'Syncing'} from World Bank · ${Math.round(s.progress * 100)}%</span>`;
    } else if (wasRunning) {
      wasRunning = false; $('#syncfill').style.width = '0';
      if (s.done) { META = await api('meta'); renderStatus(); toast(`Fresh World Bank data loaded (${META.rows.toLocaleString()} country-years). Every model now uses it.`, false, 8000); }
      else if (s.error) { renderStatus(); toast('World Bank update failed; the stored data was kept. ' + s.error.slice(0, 80), true, 8000); }
    }
  } catch (e) { /* server restarting */ }
  setTimeout(pollSync, delay);
}

(async function boot() {
  try {
    META = await api('meta');
    try { CREDITS = await (await fetch('/static/img/credits.json')).json(); } catch (e) { CREDITS = {}; }
    try { ABOUT = await api('about'); } catch (e) { ABOUT = null; }
    buildNav(); renderStatus(); renderFooter();
    go((location.hash || '#home').slice(1)); pollSync();
  } catch (e) { document.body.insertAdjacentHTML('beforeend', `<div class="toast err">Could not reach the server: ${e.message}</div>`); }
})();

/* Gentle scroll-reveal, Overview page only (other pages re-render on every control change, so they must not animate) */
if (!REDUCED && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -5% 0px' });
  const SEL = '.fig, .stats, .photo, .module, .card, .sechead, .treebox';
  const watch = n => { if (n.nodeType !== 1) return; [...(n.matches(SEL) ? [n] : []), ...n.querySelectorAll(SEL)].forEach(x => { if (!x.dataset.rv && x.closest('#page-home')) { x.dataset.rv = 1; x.classList.add('reveal'); io.observe(x); } }); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(watch))).observe(document.querySelector('main'), { childList: true, subtree: true });
}
