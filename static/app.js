/* Router + boot + live-sync indicator */
const MOUNTED = {};
function go(name) {
  if (!PAGES[name]) name = 'home';
  $$('.nav').forEach(n => n.classList.toggle('on', n.dataset.page === name));
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + name));
  if (!MOUNTED[name]) { MOUNTED[name] = true; PAGES[name]($('#page-' + name)); }
  else $$('.plot', $('#page-' + name)).forEach(el => { try { Plotly.Plots.resize(el); } catch (e) { } });
  history.replaceState(null, '', '#' + name); window.scrollTo({ top: 0 });
}

function renderFoot() {
  const s = META.source, age = META.live_age_h;
  $('#foot').innerHTML = `<b><span class="dot ${META.live ? '' : 'static'}"></span>${META.live ? 'Live World Bank data' : 'Stored snapshot'}</b>${META.rows.toLocaleString()} rows · ${META.countries} countries<br>${META.year_min}–${META.year_max}${s.fetched_at ? `<br>synced ${age == null ? s.fetched_at : age < 1 ? Math.max(1, Math.round(age * 60)) + ' min ago' : age.toFixed(1) + ' h ago'}` : ''}<div class="sync" id="sync"></div>`;
}

let wasRunning = false;
async function pollSync() {
  let delay = 12000;
  try {
    const s = await api('refresh/status'), box = $('#sync');
    if (s.running) {
      wasRunning = true; delay = 2500;
      if (box) box.innerHTML = `⟳ ${s.auto ? 'Auto-syncing' : 'Syncing'} with World Bank… ${Math.round(s.progress * 100)}%<div class="bar"><i style="width:${s.progress * 100}%"></i></div>`;
    } else if (wasRunning) {
      wasRunning = false;
      if (s.done) { META = await api('meta'); renderFoot(); toast(`✅ Fresh data synced from the World Bank (${META.rows.toLocaleString()} rows) - every model now uses it.`, false, 8000); }
      else if (s.error) { if (box) box.textContent = '⚠️ sync failed - using stored data'; toast('World Bank sync failed - kept the stored data. ' + s.error.slice(0, 80), true, 8000); }
    }
  } catch (e) { /* server restarting - try again later */ }
  setTimeout(pollSync, delay);
}

(async function boot() {
  try {
    META = await api('meta');
    renderFoot();
    $$('.nav').forEach(n => n.addEventListener('click', () => go(n.dataset.page)));
    go((location.hash || '#home').slice(1));
    pollSync();
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend', `<div class="toast err">Could not reach the API: ${e.message}</div>`);
  }
})();
