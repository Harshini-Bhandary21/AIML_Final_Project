/* Live APIs: Live Pulse (real-time data from public APIs) and Fund Impact (PayPal sandbox donations) */
const LIVE_TIMERS = {};
const ageStr = s => s < 90 ? `${Math.max(0, Math.round(s))}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${(s / 3600).toFixed(1)} h ago`;
const bigNum = n => n == null ? '—' : n >= 1e9 ? (n / 1e9).toFixed(2) + ' B' : n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e4 ? (n / 1e3).toFixed(1) + ' K' : Number(n).toLocaleString();
const srcChips = s => Object.entries(s || {}).map(([k, v]) => `<span class="src ${v.ok ? 'ok' : 'bad'}" title="${esc(v.error || '')}">${v.ok ? '●' : '✕'} ${esc(k)} <i>${v.ms}ms</i></span>`).join('');
const AQI = [[50, 'Good', '#34d399'], [100, 'Moderate', '#fbbf24'], [150, 'Unhealthy for sensitive groups', '#f97316'], [200, 'Unhealthy', '#fb7185'], [300, 'Very unhealthy', '#a78bfa'], [500, 'Hazardous', '#be123c']];
const aqiCat = v => AQI.find(a => v <= a[0]) || AQI[AQI.length - 1];
const WX = c => c === 0 ? '☀️' : c <= 3 ? '⛅' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌧️' : c >= 95 ? '⛈️' : '☁️';
function every(key, ms, el, fn) {
  clearInterval(LIVE_TIMERS[key]);
  LIVE_TIMERS[key] = setInterval(() => { if (!el.isConnected || !el.closest('.pane.on') || !el.closest('.page.on') || document.hidden) return; fn(); }, ms);
}

/* ======================================================================= LIVE PULSE */
PAGES.live = root => {
  const iso = n => META.iso[n];
  mountPage(root, {
    hero: { badge: '● Real-time APIs', title: 'Live Pulse', sub: 'Public health APIs queried at this very moment - not a stored file. Pick a country and watch five independent sources answer in parallel.', chips: ['World Bank', 'WHO GHO', 'disease.sh', 'Open-Meteo air quality', 'auto-refresh'] },
    tabs: [
      { label: '🌐 Country pulse', controls: [{ id: 'country', label: 'Country', type: 'select', options: META.country_list, value: 'India' }, { id: 'auto', label: 'Auto-refresh every 60 s', type: 'check', value: 1 }],
      render: async (v, el) => {
        const code = iso(v.country); let wbLife = null;
        el.innerHTML = `<div class="card" id="lv-head"><div class="sub">Calling APIs…</div></div>`;
        const load = async (first) => {
          const d = await api('live/country', { iso3: code }), c = d.country || {}, cv = d.covid, now = Date.now() / 1000;
          const [pa, ha] = pdiv('short'), [pw, hw] = pdiv('short');
          const air = d.air && d.air.current, wx = d.weather && d.weather.current, cat = air && air.us_aqi != null ? aqiCat(air.us_aqi) : null;
          el.innerHTML = `<div class="card lvhead">${c.flag ? `<img class="flagimg" src="${esc(c.flag)}" alt="">` : ''}<div style="flex:1"><h2>${esc(c.name || v.country)}</h2>
              <div class="sub">${esc(c.capital || '')}${c.region ? ' · ' + esc(c.region) : ''}${c.income ? ' · ' + esc(c.income) : ''}${c.population ? ' · pop ' + bigNum(c.population) : ''}</div></div>
              <div class="livebadge"><span class="pulse"></span>LIVE · <span class="age" data-ts="${d.fetched_at}">just now</span></div></div>
            <div class="srcrow">${srcChips(d.sources)}</div>
            ${cv ? `<div class="section">COVID-19 · disease.sh <span class="age" data-ts="${cv.updated / 1000}"></span></div><div class="grid g4">${kpi('Total cases', bigNum(cv.cases), `${(cv.casesPerOneMillion || 0).toLocaleString()} per million`)}${kpi('Cases today', cv.todayCases == null ? '—' : cv.todayCases.toLocaleString())}${kpi('Total deaths', bigNum(cv.deaths), cv.todayDeaths ? `+${cv.todayDeaths} today` : '')}${kpi('Active', bigNum(cv.active))}</div>` : note('COVID-19 feed has no data for this country.', 'warn')}
            <div class="section">World Bank · fetched live now vs the stored snapshot</div>
            <div class="grid g21"><div class="card"><div id="wbrows" class="tblwrap"><table class="tbl"><thead><tr><th>Indicator</th><th>Live from API</th><th>In snapshot</th><th>Difference</th></tr></thead><tbody id="wbbody"></tbody></table></div>
              <div class="sub" style="margin-top:8px">The World Bank API is slow and erratic, so each value is requested separately and retried - rows appear as they arrive.</div></div>
              <div class="card"><div id="lecmp" class="plot short"></div><div class="sub" id="lenote">Two independent sources (WHO and World Bank) for life expectancy…</div></div></div>
            <div class="section">Air quality &amp; weather in ${esc(c.capital || 'the capital')} · Open-Meteo</div>
            <div class="grid g2"><div class="card">${air ? pa && ha : '<div class="sub">No air-quality data.</div>'}${cat ? `<div class="aqi" style="color:${cat[2]}">${cat[1]}</div>` : ''}</div>
              <div class="card">${wx ? `<div class="wx"><span>${WX(wx.weather_code)}</span><b>${wx.temperature_2m}°C</b></div><div class="grid g2" style="margin-top:8px">${kpi('Humidity', wx.relative_humidity_2m + '%')}${kpi('Wind', wx.wind_speed_10m + ' km/h')}</div>` : '<div class="sub">No weather data.</div>'}
              ${air ? `<div class="sub" style="margin:10px 0 4px">Pollutants (µg/m³)</div><div>${[['PM2.5', air.pm2_5], ['PM10', air.pm10], ['NO₂', air.nitrogen_dioxide], ['O₃', air.ozone], ['CO', air.carbon_monoxide]].map(([k, x]) => `<span class="fact">${k} ${x}</span>`).join('')}</div>` : ''}
              <div class="sub" style="margin-top:8px">WHO guideline: PM2.5 ≤ 15 µg/m³ (24 h). Air pollution is an SDG 3.9 indicator.</div></div></div>`;
          if (air && air.us_aqi != null) plot(pa, [{ type: 'indicator', mode: 'gauge+number', value: air.us_aqi, title: { text: 'US AQI', font: { size: 14 } }, number: { font: { color: '#fff' } },
            gauge: { axis: { range: [0, 300], tickcolor: '#64748b' }, bar: { color: '#fff', thickness: .22 }, bgcolor: 'rgba(0,0,0,0)', borderwidth: 0, steps: AQI.slice(0, 5).map((a, i) => ({ range: [i ? AQI[i - 1][0] : 0, a[0]], color: a[2] })) } }], { margin: { t: 50, b: 10, l: 30, r: 30 } });
          const tb = $('#wbbody', el), codes = (await api('live/wbcodes')).codes;
          tb.innerHTML = codes.map(k => `<tr id="wr-${k.code.replace(/\./g, '_')}"><td>${k.label} <span class="sub">${k.unit}</span></td><td colspan="3" class="sub">⟳ requesting…</td></tr>`).join('');
          const drawLE = () => {
            if (!d.who) { $('#lenote', el).textContent = 'WHO returned no value.'; return; }
            const bars = [['WHO GHO', d.who.value, d.who.year, '#a78bfa'], ...(wbLife ? [['World Bank (live)', wbLife.live, wbLife.live_year, '#22d3ee']] : [])].filter(b => b[1] != null);
            plot('lecmp', [{ type: 'bar', x: bars.map(b => `${b[0]} (${b[2]})`), y: bars.map(b => b[1]), marker: { color: bars.map(b => b[3]) }, text: bars.map(b => (+b[1]).toFixed(1)), textposition: 'outside' }], { title: 'Life expectancy at birth: two independent APIs', yaxis: { range: [Math.min(...bars.map(b => b[1])) - 8, Math.max(...bars.map(b => b[1])) + 4] }, margin: { t: 70 } });
            if (bars.length > 1) $('#lenote', el).innerHTML = `Difference: <b>${Math.abs(bars[0][1] - bars[1][1]).toFixed(1)} years</b> - the agencies use different models and revision dates.`;
          };
          drawLE();
          codes.forEach(k => api('live/wb1', { iso3: code, code: k.code }).then(r => {
            if (k.code === 'SP.DYN.LE00.IN') { wbLife = r; drawLE(); }
            const row = $('#wr-' + k.code.replace(/\./g, '_'), el); if (!row) return;
            const diff = r.live != null && r.snapshot != null ? r.live - r.snapshot : null, newer = r.live_year && r.snapshot_year && +r.live_year > r.snapshot_year;
            row.innerHTML = r.ok ? `<td>${k.label} <span class="sub">${k.unit}</span></td><td class="n"><b>${fmt(r.live, 2)}</b> <span class="sub">${r.live_year || ''}</span></td><td class="n">${fmt(r.snapshot, 2)} <span class="sub">${r.snapshot_year || ''}</span></td><td class="n">${newer ? '<span class="pill ok">newer year ✨</span>' : diff == null ? '—' : Math.abs(diff) < 1e-6 ? '<span class="pill mut">identical</span>' : `<span class="pill mut">${diff > 0 ? '+' : ''}${diff.toFixed(2)}</span>`}</td>`
              : `<td>${k.label}</td><td colspan="3" class="sub">⚠️ API did not answer (${esc((r.error || '').slice(0, 60))})</td>`;
          }));
        };
        await load(true);
        if (v.auto) every('country', 60000, el, load); else clearInterval(LIVE_TIMERS.country);
        clearInterval(LIVE_TIMERS.age); LIVE_TIMERS.age = setInterval(() => $$('.age', el).forEach(a => { if (a.dataset.ts) a.textContent = ageStr(Date.now() / 1000 - +a.dataset.ts); }), 1000);
      } },
      { label: '🌍 Global COVID-19', render: async (v, el) => {
        const load = async () => {
          const d = await api('live/global'), g = d.global, [a, ha] = pdiv();
          el.innerHTML = `<div class="row" style="justify-content:space-between"><div class="srcrow">${srcChips(d.sources)}</div><div class="livebadge"><span class="pulse"></span>LIVE · <span class="age" data-ts="${d.fetched_at}"></span></div></div>
            ${g ? `<div class="grid g4" style="margin-top:12px">${kpi('Cases worldwide', bigNum(g.cases), `+${(g.todayCases || 0).toLocaleString()} today`)}${kpi('Deaths', bigNum(g.deaths), `+${(g.todayDeaths || 0).toLocaleString()} today`)}${kpi('Recovered', bigNum(g.recovered))}${kpi('Affected countries', g.affectedCountries)}</div>
            <div class="sub" style="margin-top:6px">Feed last updated by disease.sh: <span class="age" data-ts="${g.updated / 1000}"></span></div>` : note('Global feed unavailable.', 'bad')}
            <div class="card" style="margin-top:16px">${ha}</div>${d.top.length ? '' : note('No per-country daily numbers right now (many countries stopped reporting daily).', 'warn')}`;
          if (d.top.length) plot(a, [{ type: 'bar', x: d.top.map(o => o.country), y: d.top.map(o => o.todayCases || 0), marker: { color: COLORS }, hovertemplate: '%{x}<br>%{y:,} new cases today<extra></extra>' }], { title: 'Top 10 countries by new cases today' });
        };
        await load(); every('global', 60000, el, load);
        clearInterval(LIVE_TIMERS.age2); LIVE_TIMERS.age2 = setInterval(() => $$('.age', el).forEach(a => { if (a.dataset.ts) a.textContent = ageStr(Date.now() / 1000 - +a.dataset.ts); }), 1000);
      } },
      { label: '🔌 How it works', render: async (v, el) => {
        el.innerHTML = `${note('Your browser never talks to the health APIs directly. It asks <b>this site\'s server</b>, which calls the APIs <b>in parallel</b> with timeouts and retries, caches answers briefly, and reports which source answered and how fast.')}
          <div class="card">${table([{ k: 's', label: 'Source' }, { k: 'u', label: 'What we use it for' }, { k: 'k', label: 'API key' }, { k: 't', label: 'Cache' }], [
            { s: 'World Bank API', u: 'Country record (capital, coordinates) + latest value of 6 health indicators, and the full 15-indicator history used to train every model', k: 'none', t: '10 min' },
            { s: 'WHO Global Health Observatory', u: 'Life expectancy at birth - an independent second opinion on the World Bank number', k: 'none', t: '45 s' },
            { s: 'disease.sh', u: 'Live COVID-19 counts, flags, population', k: 'none', t: '45-60 s' },
            { s: 'Open-Meteo', u: 'Air quality (US AQI, PM2.5…) and weather at the capital - SDG 3.9 air pollution', k: 'none', t: '45 s' },
            { s: 'PayPal Sandbox', u: 'Test donations on the Fund Impact page', k: 'sandbox keys (yours)', t: '-' }])}</div>
          ${note('<b>Whole-dataset sync:</b> when the server starts and its stored copy is older than ' + (META.auto_sync || 24) + ' h, it re-downloads all 15 indicators for every country in the background, then swaps the new data in without a restart. Watch the sidebar for the sync status.')}`;
      } }]
  });
};

/* ======================================================================= FUND IMPACT (PayPal sandbox) */
let PPSDK = null;
function loadPayPal(clientId) {
  if (PPSDK) return PPSDK;
  PPSDK = new Promise((res, rej) => { const s = document.createElement('script'); s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`; s.onload = () => res(window.paypal); s.onerror = () => { PPSDK = null; rej(new Error('PayPal SDK could not load (offline?)')); }; document.head.appendChild(s); });
  return PPSDK;
}
PAGES.fund = root => {
  mountPage(root, {
    hero: { badge: '💳 PayPal Sandbox', title: 'Fund Impact', sub: 'Donate (test money) to a country\'s health programme and see, using the models on this site, roughly how many person-years of life it could buy. Real PayPal checkout, sandbox only.', chips: ['PayPal Smart Buttons', 'Sandbox - no real money', 'Impact model', 'Where is $1 worth most?'] },
    tabs: [
      { label: '💳 Donate', render: async (v, el) => {
        const cfg = await api('paypal/config'), sandbox = cfg.mode === 'sandbox';
        el.innerHTML = `${sandbox ? note('<b>PayPal SANDBOX connected.</b> Checkout opens PayPal\'s sandbox - log in with a sandbox <i>personal</i> test account. No real money moves.', 'ok') : note('<b>SIMULATION MODE</b> - no PayPal keys found, so the button below makes <b>no call to PayPal</b>. Add your free sandbox keys (see the <i>Setup</i> tab) to switch to real sandbox checkout.', 'warn')}
          <div id="fd-ctl"></div>
          <div class="grid g2"><div><div class="card" id="fd-imp"></div><div class="card" style="margin-top:16px"><h3>Pay</h3><div class="sub" id="fd-sum" style="margin-bottom:10px"></div><div id="pp-btn"></div><div id="fd-done"></div></div></div>
            <div class="card"><div id="fd-rank" class="plot tall"></div></div></div>
          ${note('<b>How the impact is estimated (illustrative):</b> a "package" is a national programme (+0.5 pp of GDP on health, +0.3 physicians/1000, +4 pp sanitation, +2 pp clean water, +3 pp measles cover). A gradient-boosting model trained on the real data predicts the life-expectancy gain per package; a package costs 0.5 % of the country\'s GDP; your donation is scaled linearly against that. It shows <i>correlations in the data</i>, not guaranteed causal effects.')}`;
        const st = { country: 'Burundi', amount: 50 };
        let tmr;
        const upd = async () => {
          const [imp, rk] = await Promise.all([api('impact', st), api('impact/rank', { amount: st.amount, n: 12 })]);
          $('#fd-imp', el).innerHTML = `<h3>Your $${st.amount} → ${esc(st.country)} <span class="pill mut">illustrative estimate</span></h3><div class="grid g2" style="margin:10px 0">${kpi('Person-years of life', fmt(imp.person_years, imp.person_years < 10 ? 2 : 1), `≈ ${Math.round(imp.person_days).toLocaleString()} person-days`)}${kpi('Rank per dollar', `#${imp.rank}`, `of ${imp.of} countries`)}</div>
            <div class="sub">A national package in ${esc(st.country)} costs about <b>$${bigNum(imp.package_cost)}</b> and is predicted to add <b>${fmt(imp.gain1, 2)} years</b> to life expectancy (now ${fmt(imp.life, 1)}) for ${bigNum(imp.pop)} people.</div>`;
          $('#fd-sum', el).innerHTML = `Donating <b>$${Number(st.amount).toFixed(2)} USD</b> to <b>${esc(st.country)}</b>`;
          const best = rk.rows[0];
          plot('fd-rank', [{ type: 'bar', orientation: 'h', y: rk.rows.map(r => r.country).reverse(), x: rk.rows.map(r => r.person_years).reverse(), marker: { color: rk.rows.map(r => r.country === st.country ? '#f472b6' : '#22d3ee').reverse() }, hovertemplate: '%{y}<br>%{x:.1f} person-years<extra></extra>' }],
            { title: `Where does $${st.amount} go furthest? (countries > 1 M people)`, xaxis: { title: { text: 'person-years of life (model estimate)' } }, margin: { l: 150 } });
        };
        controls($('#fd-ctl', el), [{ id: 'country', label: 'Country to fund', type: 'select', options: META.country_list, value: st.country }, { id: 'amount', label: 'Amount (USD)', type: 'range', min: 5, max: cfg.max, step: 5, value: st.amount, fmt: v => '$' + v }],
          s => { Object.assign(st, s); upd(); }, 'slim');
        Object.assign(st, { country: st.country, amount: st.amount }); await upd();
        const done = r => {
          const e = r.entry, i = r.impact;
          $('#fd-done', el).innerHTML = `<div class="receipt"><div class="rtitle">${e.simulated ? '🧪 Simulated donation recorded' : '✅ Sandbox payment captured'}</div>
            <div class="rrow"><span>Order</span><b class="mono">${esc(e.order_id)}</b></div><div class="rrow"><span>Status</span><b>${esc(e.status)}</b></div><div class="rrow"><span>Amount</span><b>$${e.amount.toFixed(2)} USD → ${esc(e.country)}</b></div>
            <div class="rrow"><span>Estimated impact</span><b>${fmt(i.person_years, 2)} person-years (${Math.round(i.person_days)} days)</b></div>${e.simulated ? '<div class="sub">No call to PayPal was made.</div>' : `<div class="sub">PayPal capture id ${esc(e.capture_id || '')}</div>`}</div>`;
          toast(e.simulated ? 'Simulated donation recorded' : 'Sandbox payment completed 🎉');
        };
        const create = async () => { const r = await api('paypal/create-order', {}, 'POST', { country: st.country, amount: st.amount }); return r.id; };
        if (!sandbox) {
          $('#pp-btn', el).innerHTML = `<button class="btn primary" id="sim" style="width:100%;padding:14px">🧪 Donate (simulated)</button>`;
          $('#sim', el).onclick = async e => { e.target.disabled = true; try { const id = await create(); done(await api('paypal/capture-order', {}, 'POST', { orderID: id })); } catch (err) { toast(err.message, true); } e.target.disabled = false; };
        } else {
          try {
            const pp = await loadPayPal(cfg.client_id);
            pp.Buttons({ style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'donate' }, createOrder: create, onApprove: async d => done(await api('paypal/capture-order', {}, 'POST', { orderID: d.orderID })), onError: e => toast('PayPal error: ' + (e.message || e), true) }).render('#pp-btn');
          } catch (e) { $('#pp-btn', el).innerHTML = note(esc(e.message), 'bad'); }
        }
      } },
      { label: '📒 Ledger', render: async (v, el) => {
        const d = await api('donations'); const [a, ha] = pdiv('short');
        el.innerHTML = `<div class="grid g3">${kpi('Total raised', '$' + d.total.toLocaleString(undefined, { maximumFractionDigits: 2 }), d.mode === 'sandbox' ? 'sandbox / test money' : 'simulated + sandbox')}${kpi('Donations', d.count)}${kpi('Person-years funded (est.)', fmt(d.person_years, 1))}</div>
          ${d.count ? `<div class="grid g2" style="margin-top:16px"><div class="card">${ha}</div><div>${table([{ k: 'time', label: 'Time' }, { k: 'country', label: 'Country' }, { k: 'amount', label: 'USD', d: 2 }, { k: 'person_years', label: 'Person-yrs', d: 2 }, { k: 'simulated', label: 'Type', f: s => s ? '<span class="pill mut">simulated</span>' : '<span class="pill ok">sandbox</span>' }], d.recent)}</div></div>` : note('No donations yet - make one on the Donate tab.')}`;
        if (d.count) plot(a, [{ type: 'bar', x: d.by_country.map(r => r.country), y: d.by_country.map(r => r.amount), marker: { color: COLORS } }], { title: 'Raised by country (USD)' });
      } },
      { label: '⚙️ Setup PayPal sandbox', render: async (v, el) => {
        const cfg = await api('paypal/config');
        el.innerHTML = `<div class="card"><h3>Status: ${cfg.mode === 'sandbox' ? '<span class="pill ok">sandbox keys detected</span>' : '<span class="pill mut">simulation mode</span>'}</h3>
          <ol style="line-height:1.9"><li>Sign in at <b>developer.paypal.com</b> (a normal PayPal account works) → <b>Apps &amp; Credentials</b> → toggle <b>Sandbox</b>.</li>
          <li>Open the default app (or <i>Create App</i>) and copy the <b>Client ID</b> and <b>Secret</b>.</li>
          <li>In the <code>website/</code> folder copy <code>.env.example</code> to <code>.env</code> and paste the two values.</li>
          <li>Restart the site (<code>./run.sh</code>). The orange banner turns green and PayPal's gold button appears.</li>
          <li>At checkout log in with a sandbox <b>personal</b> test account (Developer dashboard → <i>Testing tools → Sandbox accounts</i>). Use the sandbox email/password shown there - never your real PayPal login.</li></ol>
          <div class="note warn">The server only ever talks to <span class="mono">api-m.sandbox.paypal.com</span>. The secret stays on the server and is never sent to the browser. Amount and country are validated and stored server-side when the order is created, and capture uses the stored values.</div></div>`;
      } }]
  });
};
