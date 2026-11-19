/* Live data: Live Pulse (public APIs queried now) and Fund Impact (PayPal sandbox) */
const LIVE_TIMERS = {};
const ECG = '<svg class="ecg" viewBox="0 0 280 90" role="img" aria-label="Animated heartbeat line"><path d="M0 50 H62 l9 -10 l9 10 H112 l8 5 l12 -48 l13 80 l11 -42 H196 l10 -14 l10 14 H280"/></svg><div class="credit">Live data, refreshed every minute</div>';
const ageStr = s => s < 90 ? `${Math.max(0, Math.round(s))} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${(s / 3600).toFixed(1)} h ago`;
const bigNum = n => n == null ? '-' : n >= 1e9 ? (n / 1e9).toFixed(2) + ' billion' : n >= 1e6 ? (n / 1e6).toFixed(2) + ' million' : n >= 1e4 ? (n / 1e3).toFixed(1) + ' thousand' : Number(n).toLocaleString();
const AQI = [[50, 'Good', '#23865b'], [100, 'Moderate', '#d69a36'], [150, 'Unhealthy for sensitive groups', '#d9822b'], [200, 'Unhealthy', '#c8553d'], [300, 'Very unhealthy', '#9aa6b6'], [500, 'Hazardous', '#14243a']];
const aqiCat = v => AQI.find(a => v <= a[0]) || AQI[AQI.length - 1];
const WX = c => c === 0 ? 'Clear' : c <= 3 ? 'Partly cloudy' : c <= 48 ? 'Fog' : c <= 57 ? 'Drizzle' : c <= 67 ? 'Rain' : c <= 77 ? 'Snow' : c <= 82 ? 'Showers' : c >= 95 ? 'Thunderstorm' : 'Cloudy';
const srcTable = s => table([{ k: 'src', label: 'Source' }, { k: 'ok', label: 'Status', f: x => x ? '<span class="pill ok">answered</span>' : '<span class="pill bad">no answer</span>' }, { k: 'ms', label: 'Response', f: x => x + ' ms', num: 1 }], Object.entries(s || {}).map(([k, v]) => ({ src: k, ok: v.ok, ms: v.ms })));
function every(key, ms, el, fn) { clearInterval(LIVE_TIMERS[key]); LIVE_TIMERS[key] = setInterval(() => { if (!el.isConnected || !el.closest('.pane.on') || !el.closest('.page.on') || document.hidden) return; fn(); }, ms); }
const tickAges = (key, el) => { clearInterval(LIVE_TIMERS[key]); LIVE_TIMERS[key] = setInterval(() => $$('.age', el).forEach(a => { if (a.dataset.ts) a.textContent = ageStr(Date.now() / 1000 - +a.dataset.ts); }), 1000); };

/* ======================================================================= LIVE PULSE */
PAGES.live = root => {
  mountPage(root, {
    head: { dark: 'dark', icon: 'live', art: ECG, eyebrow: 'Live data', title: 'Live Pulse', lede: 'What public health data sources report right now for a country, set beside the historical World Bank record used throughout this site. Live values are requested when you open the page and refreshed every minute.' },
    tabs: [
      { label: 'Country', controls: [{ id: 'country', label: 'Country', type: 'select', options: META.country_list, value: 'India' }, { id: 'auto', label: 'Refresh every minute', type: 'check', value: 1 }],
      render: async (v, el) => {
        const code = META.iso[v.country]; let wbLife = null;
        el.innerHTML = '<p class="sub">Requesting live data.</p>';
        const load = async () => {
          const d = await api('live/country', { iso3: code }), c = d.country || {}, cv = d.covid, air = d.air && d.air.current, wx = d.weather && d.weather.current, cat = air && air.us_aqi != null ? aqiCat(air.us_aqi) : null;
          const [pa, ha] = pdiv('short'), [pl, hl] = pdiv('short');
          el.innerHTML = `<div class="lvhead">${c.flag ? `<img class="flagimg" src="${esc(c.flag)}" alt="Flag of ${esc(c.name || v.country)}">` : ''}<div style="flex:1"><h2>${esc(c.name || v.country)}</h2><div class="sub">${[c.capital, c.region, c.income, c.population ? 'population ' + bigNum(c.population) : ''].filter(Boolean).map(esc).join(' · ')}</div></div><span class="live">Live · updated <span class="age" data-ts="${d.fetched_at}">now</span></span></div>`
            + section('Right now <span class="tag live-tag">Live</span>')
            + (cv ? stats(['COVID-19 cases, total', bigNum(cv.cases), `${(cv.casesPerOneMillion || 0).toLocaleString()} per million`], ['New cases today', cv.todayCases == null ? '-' : cv.todayCases.toLocaleString()], ['Deaths, total', bigNum(cv.deaths), cv.todayDeaths ? `${cv.todayDeaths} today` : ''], ['Active cases', bigNum(cv.active)]) + `<p class="sub" style="margin-top:6px">Source: disease.sh (Johns Hopkins and national sources). Feed updated <span class="age" data-ts="${cv.updated / 1000}"></span>.</p>` : note('The COVID-19 feed has no data for this country.', 'warn'))
            + `<div class="grid g2" style="margin-top:20px">${air ? fig(ha, `Air quality in ${esc(c.capital || 'the capital')} (US AQI). The WHO guideline for PM2.5 is 15 µg/m³ over 24 hours; air pollution is part of SDG 3.9. Source: Open-Meteo.`) : '<div></div>'}<div class="card">${wx ? `<div class="wx">${wx.temperature_2m}°C <span class="sub" style="font-size:15px">${WX(wx.weather_code)}</span></div><p class="sub" style="margin:4px 0 12px">Humidity ${wx.relative_humidity_2m}% · wind ${wx.wind_speed_10m} km/h · Source: Open-Meteo</p>` : ''}${air ? `<p class="sub" style="margin-bottom:6px">Pollutants (µg/m³)</p><div>${[['PM2.5', air.pm2_5], ['PM10', air.pm10], ['NO₂', air.nitrogen_dioxide], ['O₃', air.ozone], ['CO', air.carbon_monoxide]].map(([k, x]) => `<span class="fact">${k} ${x}</span>`).join('')}</div>${cat ? `<p style="margin-top:12px"><b style="color:${cat[2]}">${cat[1]}</b> (AQI ${air.us_aqi})</p>` : ''}` : ''}</div></div>`
            + (code === 'IND' ? `<div style="margin-top:20px">${fig('<img class="fullimg" src="/static/img/delhi-smog.jpg" alt="Satellite image of smog over northern India and New Delhi">', `Satellite view of the smog over northern India and New Delhi on 1 November 2019, the kind of episode behind an air-quality reading like the one above. Image: ${credit('delhi-smog')}.`)}</div>` : '')
            + section('Compared with the historical record <span class="tag hist-tag">World Bank</span>', 'Each value is requested live from the World Bank API and set beside the copy stored on this site. They match unless the World Bank has published a newer year.')
            + `<div class="grid g21"><div><div class="tblwrap"><table class="tbl"><thead><tr><th>Indicator</th><th style="text-align:right">Live from API</th><th style="text-align:right">Stored snapshot</th><th>Difference</th></tr></thead><tbody id="wbbody"></tbody></table></div></div>${fig(hl, `Life expectancy at birth from two independent agencies. They differ because each uses its own model and revision date.`)}</div>`
            + section('Sources', 'The browser asks this site\'s server, which calls each API in parallel with timeouts and retries and reports how each one answered.') + srcTable(d.sources);
          if (air && air.us_aqi != null) plot(pa, [{ type: 'indicator', mode: 'gauge+number', value: air.us_aqi, number: { font: { color: INK, size: 42 } }, gauge: { axis: { range: [0, 300], tickcolor: MUTE }, bar: { color: INK, thickness: .2 }, bgcolor: 'rgba(0,0,0,0)', borderwidth: 0, steps: AQI.slice(0, 5).map((a, i) => ({ range: [i ? AQI[i - 1][0] : 0, a[0]], color: a[2] })) } }], { margin: { t: 30, b: 0, l: 30, r: 30 } });
          const tb = $('#wbbody', el), codes = (await api('live/wbcodes')).codes;
          tb.innerHTML = codes.map(k => `<tr id="wr-${k.code.replace(/\./g, '_')}"><td>${k.label} <span class="sub">${k.unit}</span></td><td colspan="3" class="sub">Requesting</td></tr>`).join('');
          const drawLE = () => {
            if (!d.who) { return; } const bars = [['WHO', d.who.value, d.who.year, TEAL], ...(wbLife ? [['World Bank', wbLife.live, wbLife.live_year, BURG]] : [])].filter(b => b[1] != null);
            plot(pl, [{ type: 'bar', x: bars.map(b => `${b[0]} (${b[2]})`), y: bars.map(b => b[1]), marker: { color: bars.map(b => b[3]) }, text: bars.map(b => (+b[1]).toFixed(1)), textposition: 'outside' }], { yaxis: { range: [Math.min(...bars.map(b => b[1])) - 8, Math.max(...bars.map(b => b[1])) + 4], title: { text: 'Years' } }, margin: { t: 34 } });
          };
          drawLE();
          codes.forEach(k => api('live/wb1', { iso3: code, code: k.code }).then(r => {
            if (k.code === 'SP.DYN.LE00.IN') { wbLife = r; drawLE(); }
            const row = $('#wr-' + k.code.replace(/\./g, '_'), el); if (!row) return;
            const diff = r.live != null && r.snapshot != null ? r.live - r.snapshot : null, newer = r.live_year && r.snapshot_year && +r.live_year > r.snapshot_year;
            row.innerHTML = r.ok ? `<td>${k.label} <span class="sub">${k.unit}</span></td><td class="n"><b>${fmt(r.live, 2)}</b> <span class="sub">${r.live_year || ''}</span></td><td class="n">${fmt(r.snapshot, 2)} <span class="sub">${r.snapshot_year || ''}</span></td><td>${newer ? '<span class="pill ok">newer year available</span>' : diff == null ? '-' : Math.abs(diff) < 1e-6 ? '<span class="pill mut">identical</span>' : `<span class="pill mut">${diff > 0 ? '+' : ''}${diff.toFixed(2)}</span>`}</td>` : `<td>${k.label}</td><td colspan="3" class="sub">The API did not answer in time.</td>`;
          }));
        };
        await load(); if (v.auto) every('country', 60000, el, load); else clearInterval(LIVE_TIMERS.country); tickAges('age', el);
      } },
      { label: 'Worldwide', render: async (v, el) => {
        const load = async () => {
          const d = await api('live/global'), g = d.global, [a, ha] = pdiv('tall');
          el.innerHTML = `<div class="lvhead"><div style="flex:1"><h2 style="font-size:24px">COVID-19 worldwide</h2><div class="sub">Source: disease.sh</div></div><span class="live">Live · updated <span class="age" data-ts="${d.fetched_at}">now</span></span></div>`
            + (g ? stats(['Cases', bigNum(g.cases), `${(g.todayCases || 0).toLocaleString()} today`], ['Deaths', bigNum(g.deaths), `${(g.todayDeaths || 0).toLocaleString()} today`], ['Recovered', bigNum(g.recovered)], ['Countries affected', g.affectedCountries]) : note('The global feed is unavailable right now.', 'bad'))
            + `<div style="margin-top:18px">${d.top.length ? fig(ha, 'Countries reporting the most new cases today. Many countries no longer report daily, so this is a partial picture.') : note('No country reports daily numbers right now.', 'warn')}</div>` + section('Sources') + srcTable(d.sources);
          if (d.top.length) plot(a, [{ type: 'bar', x: d.top.map(o => o.country), y: d.top.map(o => o.todayCases || 0), marker: { color: BURG }, hovertemplate: '%{x}<br>%{y:,} new cases today<extra></extra>' }], { yaxis: { title: { text: 'New cases today' } } });
        };
        await load(); every('global', 60000, el, load); tickAges('age2', el);
      } }]
  });
};

/* ======================================================================= FUND IMPACT (PayPal sandbox) */
let PPSDK = null;
function loadPayPal(clientId) {
  if (PPSDK) return PPSDK;
  PPSDK = new Promise((res, rej) => { const s = document.createElement('script'); s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`; s.onload = () => res(window.paypal); s.onerror = () => { PPSDK = null; rej(new Error('The PayPal SDK could not load (are you offline?).')); }; document.head.appendChild(s); });
  return PPSDK;
}
PAGES.fund = root => {
  mountPage(root, {
    head: { dark: 'dark', icon: 'fund', eyebrow: 'Live data · PayPal sandbox', title: 'Fund Impact', lede: 'Estimate what a donation to a country\'s health programme could achieve, then complete a test payment in PayPal\'s sandbox. No real money moves.' },
    tabs: [
      { label: 'Donate', render: async (v, el) => {
        const cfg = await api('paypal/config'), sandbox = cfg.mode === 'sandbox';
        el.innerHTML = `<div class="banner"><img src="/static/img/water.jpg" alt="Villagers collecting water at a shared source"><div class="bcap">Villagers collect water at a shared source. Clean water is one part of every funding package.<small>Photo: ${credit('water')}</small></div></div>` + (sandbox ? note('<b>Connected to the PayPal sandbox.</b> Checkout opens PayPal; sign in with a sandbox personal test account. Payments are test money.', 'ok') : note('<b>Simulation mode.</b> No PayPal keys are configured, so the button below records a simulated donation and makes no call to PayPal. See Setup to connect your sandbox.', 'warn'))
          + `<div id="fd-ctl" style="margin-top:6px"></div><div class="grid g2" style="margin-top:20px"><div><div id="fd-imp"></div><div class="card" style="margin-top:18px"><h3>Complete the donation</h3><p class="sub" id="fd-sum" style="margin:2px 0 12px"></p><div id="pp-btn"></div><div id="fd-done"></div></div></div>${fig('<div id="fd-rank" class="plot tall"></div>', 'How far a donation goes, country by country. Each dot is a country with more than a million people: further left means lower life expectancy today, higher means more estimated days of life per $100. The ringed dot is your selection. Countries with lower life expectancy and a cheaper programme gain most per dollar, which is the pattern the model learned from the data; it is an illustration, not a forecast.')}</div>`;
        const st = { country: 'Burundi', amount: 50 };
        const upd = async () => {
          const [imp, rk] = await Promise.all([api('impact', st), api('impact/rank', { amount: st.amount, n: 1000 })]);
          $('#fd-imp', el).innerHTML = stats(['Estimated life gained', `${fmt(imp.person_years, imp.person_years < 10 ? 2 : 1)} yrs`, `person-years of life, about ${Math.round(imp.person_days).toLocaleString()} person-days`], ['Rank per dollar', `#${imp.rank}`, `of ${imp.of} countries`])
            + note(`<b>Illustrative estimate, not causal evidence.</b> A national programme in ${esc(st.country)} (+0.5 pp of GDP on health, more physicians, sanitation, clean water and vaccination) would cost about $${bigNum(imp.package_cost)} and is predicted to add ${fmt(imp.gain1, 2)} years to life expectancy, now ${fmt(imp.life, 1)}, for ${bigNum(imp.pop)} people. A gradient-boosting model trained on the data gives that gain; your donation is scaled linearly against the cost. It reflects correlations in the data, not a guaranteed effect.`, 'warn');
          $('#fd-sum', el).innerHTML = `$${Number(st.amount).toFixed(2)} USD to ${esc(st.country)}`;
          { const all = rk.rows, per = r => r.person_years / st.amount * 100 * 365.25, sel = all.find(r => r.country === st.country);
            plot('fd-rank', [...INCOME_ORDER.map(g => ({ type: 'scattergl', mode: 'markers', name: g, x: all.filter(r => r.income === g).map(r => r.life), y: all.filter(r => r.income === g).map(per), text: all.filter(r => r.income === g).map(r => r.country), marker: { color: INCOME[g], size: 9, opacity: .75, line: { color: '#fff', width: 1 } }, hovertemplate: '%{text}<br>Life expectancy %{x:.1f} yrs<br>%{y:.1f} days of life per $100<extra></extra>' })),
              ...(sel ? [{ type: 'scatter', mode: 'markers', x: [sel.life], y: [per(sel)], showlegend: false, hoverinfo: 'skip', marker: { symbol: 'circle-open', size: 24, color: BURG, line: { width: 3, color: BURG } } }] : [])],
              { xaxis: { title: { text: 'Life expectancy today (years)' } }, yaxis: { type: 'log', title: { text: 'Estimated days of life gained per $100' } }, annotations: sel ? [{ x: sel.life, y: Math.log10(per(sel)), text: '<b>' + esc(sel.country) + '</b>', showarrow: true, ax: 50, ay: -46, arrowcolor: BURG, font: { color: BURG, size: 15 }, bgcolor: '#fff', bordercolor: BURG, borderpad: 4 }] : [], legend: { orientation: 'h', y: 1.1 } }); }
        };
        controls($('#fd-ctl', el), [{ id: 'country', label: 'Country to support', type: 'select', options: META.country_list, value: st.country }, { id: 'amount', label: 'Donation (USD)', type: 'range', min: 5, max: cfg.max, step: 5, value: st.amount, fmt: x => '$' + x }], s => { Object.assign(st, s); upd(); });
        await upd();
        const done = r => {
          const e = r.entry, i = r.impact;
          $('#fd-done', el).innerHTML = `<div class="receipt"><div class="rtitle">${e.simulated ? 'Simulated donation recorded' : 'Sandbox payment completed'}</div><div class="rrow"><span>Order</span><b class="mono">${esc(e.order_id)}</b></div><div class="rrow"><span>Status</span><b>${esc(e.status)}</b></div><div class="rrow"><span>Amount</span><b>$${e.amount.toFixed(2)} USD to ${esc(e.country)}</b></div><div class="rrow"><span>Estimated impact</span><b>${fmt(i.person_years, 2)} person-years (illustrative)</b></div>${e.simulated ? '<p class="sub" style="margin-top:6px">No call to PayPal was made.</p>' : `<p class="sub" style="margin-top:6px">PayPal capture ${esc(e.capture_id || '')}</p>`}</div>`;
          toast(e.simulated ? 'Simulated donation recorded.' : 'Sandbox payment completed.');
        };
        const create = async () => (await api('paypal/create-order', {}, 'POST', { country: st.country, amount: st.amount })).id;
        if (!sandbox) {
          $('#pp-btn', el).innerHTML = `<button class="btn primary" id="sim" style="width:100%;padding:11px">Donate (simulated)</button>`;
          $('#sim', el).onclick = async e => { e.target.disabled = true; try { const id = await create(); done(await api('paypal/capture-order', {}, 'POST', { orderID: id })); } catch (err) { toast(err.message, true); } e.target.disabled = false; };
        } else {
          try { const pp = await loadPayPal(cfg.client_id); pp.Buttons({ style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'donate' }, createOrder: create, onApprove: async d => done(await api('paypal/capture-order', {}, 'POST', { orderID: d.orderID })), onError: e => toast('PayPal error: ' + (e.message || e), true) }).render('#pp-btn'); }
          catch (e) { $('#pp-btn', el).innerHTML = note(esc(e.message), 'bad'); }
        }
      } },
      { label: 'Ledger', render: async (v, el) => {
        const d = await api('donations'); const [a, ha] = pdiv('short');
        el.innerHTML = stats(['Total donated', '$' + d.total.toLocaleString(undefined, { maximumFractionDigits: 2 }), d.mode === 'sandbox' ? 'sandbox test money' : 'simulated and sandbox'], ['Donations', d.count], ['Estimated person-years', fmt(d.person_years, 1), 'illustrative'])
          + (d.count ? `<div class="grid g2" style="margin-top:18px">${fig(ha, 'Donated by country.')}<div>${table([{ k: 'time', label: 'Time' }, { k: 'country', label: 'Country' }, { k: 'amount', label: 'USD', d: 2, num: 1 }, { k: 'simulated', label: 'Type', f: s => s ? '<span class="pill mut">simulated</span>' : '<span class="pill ok">sandbox</span>' }], d.recent)}</div></div>` : '<p class="sub" style="margin-top:14px">No donations yet. Make one on the Donate tab.</p>');
        if (d.count) plot(a, [{ type: 'bar', x: d.by_country.map(r => r.country), y: d.by_country.map(r => r.amount), marker: { color: BURG } }], { yaxis: { title: { text: 'USD' } } });
      } },
      { label: 'Setup', render: async (v, el) => {
        const cfg = await api('paypal/config');
        el.innerHTML = `<p style="margin-bottom:10px">Status: ${cfg.mode === 'sandbox' ? '<span class="pill ok">sandbox keys detected</span>' : '<span class="pill mut">simulation mode</span>'}</p>
          <ol style="line-height:1.8;max-width:78ch;padding-left:20px"><li>Sign in at developer.paypal.com (any PayPal account) and open <b>Apps &amp; Credentials</b> with <b>Sandbox</b> selected.</li><li>Open the default app, or create one, and copy its <b>Client ID</b> and <b>Secret</b>.</li><li>In the <span class="mono">website</span> folder, copy <span class="mono">.env.example</span> to <span class="mono">.env</span> and paste both values.</li><li>Restart the site. The notice on the Donate tab changes and PayPal's button appears.</li><li>At checkout, sign in with a sandbox <b>personal</b> test account from <i>Testing tools, Sandbox accounts</i>, never your real PayPal login.</li></ol>
          ${note('The server only talks to PayPal\'s sandbox address. The secret stays on the server and is never sent to the browser. The amount and country are validated and stored on the server when the order is created, and the payment is captured using those stored values.')}`;
      } }]
  });
};
