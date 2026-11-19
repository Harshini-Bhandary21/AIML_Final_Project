/* AI Search Playground (Unit 2), Expert System & Chatbot (Unit 1) */
PAGES.search = root => {
  const ALGOS = ['BFS', 'DFS', 'Depth-limited', 'Iterative deepening', 'Bidirectional BFS', 'Uniform-cost', 'Greedy best-first', 'A*', 'Hill climbing', 'Hill climbing + restarts'];
  mountPage(root, {
    hero: { badge: 'Unit 2 · Search strategies', title: 'AI Search Playground', sub: 'Every classic search algorithm, put to work on health-logistics problems: routing, budgets, scheduling and adversaries.', chips: ['BFS · DFS · IDS', 'A* · Greedy', 'Hill climbing', 'CSP', 'Minimax · α-β'] },
    tabs: [
      { label: '🚑 Supply-route search (GPS)', controls: [{ id: 'n', label: 'Map size', type: 'range', min: 10, max: 30, value: 22 }, { id: 'wall', label: 'Blocked cells', type: 'range', min: 0, max: .4, step: .02, value: .22, fmt: v => (+v).toFixed(2) },
        { id: 'seed', label: 'Map seed', type: 'number', min: 0, max: 999, value: 3 }, { id: 'w', label: 'A* heuristic weight w (1 = admissible)', type: 'range', min: 1, max: 5, step: .5, value: 1, fmt: v => (+v).toFixed(1) }, { id: 'algo', label: 'Visualise algorithm', type: 'select', options: ALGOS, value: 'A*' }],
      render: async (v, el) => {
        const r = await api('search/grid', v); const [a, ha] = pdiv('tall');
        el.innerHTML = `${note('A medical-supply truck drives from the <b>depot (green)</b> to the <b>hospital (red star)</b>. Black = blocked; terrain cost runs from 1 (road) to 5 (mountain pass). Teal dots = nodes the algorithm explored, gold = final route.')}
          <div class="grid g21"><div class="card">${ha}</div><div><div class="grid g2" style="gap:12px">${kpi('Nodes expanded', r.expanded)}${kpi('Route cost', r.path_cost == null ? '—' : Math.round(r.path_cost))}${kpi('Route steps', r.path_len || '—')}${kpi('Goal reached', r.found ? 'yes' : 'NO')}</div>
          ${r.note ? note(esc(r.note), 'warn') : ''}<div style="margin-top:12px">${table([{ k: 'algo', label: 'Algorithm' }, { k: 'expanded', label: 'Expanded', f: x => x }, { k: 'cost', label: 'Cost', d: 0 }, { k: 'steps', label: 'Steps', f: x => x }, { k: 'optimal', label: 'Optimal', f: x => x ? '✅' : '' }], r.table)}</div></div></div>
          ${note('<b>BFS</b> is optimal in steps but ignores terrain cost; <b>uniform-cost</b> is optimal in cost but explores everywhere. <b>DFS</b> dives fast but rarely finds a good route. <b>Iterative deepening</b> = DFS memory + BFS optimality at the price of repeated work. <b>Greedy</b> only looks at the distance left (fast, not optimal). <b>A*</b> adds the cost so far → optimal <i>if</i> the heuristic never overestimates (admissible). Raise <i>w</i> above 1 to break admissibility. <b>Hill climbing</b> gets stuck behind walls; restarts help.')}`;
        const z = r.cost, ex = r.order;
        const tr = [{ type: 'heatmap', z, colorscale: [[0, '#02040a'], [.001, '#02040a'], [.2, '#1b2543'], [.6, '#3d3a78'], [1, '#9a5b4a']], zmin: 0, zmax: 5, showscale: false, hoverinfo: 'skip' },
          { type: 'scatter', mode: 'markers', name: 'explored', x: ex.map(p => p[1]), y: ex.map(p => p[0]), marker: { size: 8, color: ex.map((_, i) => i), colorscale: [[0, '#22d3ee'], [.5, '#a78bfa'], [1, '#f472b6']], opacity: .85 }, text: ex.map((_, i) => 'visit #' + (i + 1)), hovertemplate: '%{text}<extra></extra>' }];
        if (r.path && r.path.length) tr.push({ type: 'scatter', mode: 'lines+markers', name: 'route', x: r.path.map(p => p[1]), y: r.path.map(p => p[0]), line: { color: '#fbbf24', width: 4 }, marker: { size: 6, color: '#fbbf24' } });
        tr.push({ type: 'scatter', mode: 'markers', name: 'depot', x: [0], y: [0], marker: { size: 17, color: '#34d399', symbol: 'square' } }, { type: 'scatter', mode: 'markers', name: 'hospital', x: [r.n - 1], y: [r.n - 1], marker: { size: 19, color: '#fb7185', symbol: 'star' } });
        plot(a, tr, { yaxis: { autorange: 'reversed', scaleanchor: 'x', showgrid: false, visible: false }, xaxis: { showgrid: false, visible: false, constrain: 'domain' }, margin: { l: 0, r: 0, t: 36, b: 0 } });
      } },
      { label: '💰 Aid-budget allocation', controls: [{ id: 'region', label: 'Region', type: 'select', options: META.regions, value: META.regions.includes('South Asia') ? 'South Asia' : META.regions[0] }, { id: 'n', label: 'Countries (lowest life exp. first)', type: 'range', min: 4, max: 8, value: 6 },
        { id: 'B', label: 'Budget B (packages)', type: 'range', min: 4, max: 16, value: 10 }, { id: 'cap', label: 'Max packages per country', type: 'range', min: 2, max: 5, value: 4 }],
      render: async (v, el) => {
        const r = await api('search/alloc', v); if (r.error) { el.innerHTML = note(esc(r.error), 'bad'); return; }
        const [a, ha] = pdiv('short'), [b, hb] = pdiv('short'); const cap = r.table[0].gains.length - 1;
        el.innerHTML = `${note('<b>Problem:</b> a donor has <i>B</i> funding packages (each = +0.5 pp of GDP on health, +0.3 physicians/1000, +4 pp sanitation, +2 pp clean water, +3 pp measles cover). How many packages should each country get to gain the most <b>person-years of life</b>? Gain = population × life-expectancy increase predicted by a monotonic gradient-boosting model.')}
          ${table([{ k: 'country', label: 'Country' }, { k: 'life', label: 'Life exp.', d: 1 }, { k: 'pop', label: 'Pop (M)', d: 1 }, ...Array.from({ length: cap }, (_, i) => ({ k: 'gains', label: `+${i + 1} pkg (M person-yrs)`, f: (g) => fmt(g[i + 1], 2) }))], r.table)}
          <div class="section">Search results</div>${table([{ k: 'name', label: 'Algorithm' }, { k: 'value', label: 'Value (M person-years)', d: 2 }, { k: 'pct', label: '% of optimum', f: x => x.toFixed(1) + '%' }, { k: 'nodes', label: 'States generated', f: x => x }, ...r.countries.map((c, i) => ({ k: 'plan', label: c, f: p => p[i] }))], r.runs, { max: ['value'], min: [] })}
          <div class="grid g2" style="margin-top:16px"><div class="card">${ha}</div><div class="card">${hb}</div></div>
          ${note('BFS/DFS check every allocation. A* uses an <i>admissible</i> upper bound on the gain still reachable, so it prunes hopeless branches yet stays optimal. Inflating the bound (×2) makes it greedy-like: faster, may miss the optimum. Greedy and hill climbing give no guarantee.')}`;
        plot(a, [{ type: 'bar', x: r.countries, y: r.best, marker: { color: '#22d3ee' } }], { title: 'Optimal allocation (packages)' });
        plot(b, [{ type: 'bar', x: r.runs.map(o => o.name), y: r.runs.map(o => o.nodes), marker: { color: COLORS } }], { title: 'Search effort (states generated, log)', yaxis: { type: 'log' }, margin: { b: 110 }, xaxis: { tickangle: -25 } });
      } },
      { label: '🗓️ Vaccination slots (CSP)', controls: [{ id: 'K', label: 'Number of week-slots', type: 'range', min: 2, max: 5, value: 3 }, { id: 'prio', label: 'Priority countries (earliest slots)', type: 'range', min: 0, max: 5, value: 3 }],
      render: async (v, el) => {
        const r = await api('search/csp', v); const [a, ha] = pdiv('tall');
        el.innerHTML = `${note('<b>Constraint satisfaction:</b> schedule a measles-vaccination drive in 12 South / South-East-Asian countries. Neighbouring countries may not run it in the <b>same week-slot</b> (cross-border crowds). The countries with the lowest life expectancy (★) must go in the <b>earliest slots</b> (1-2).')}
          ${table([{ k: 'strategy', label: 'Strategy' }, { k: 'solved', label: 'Solved', f: x => x ? '<span class="pill ok">yes</span>' : '<span class="pill bad">no</span>' }, { k: 'assignments', label: 'Assignments tried', f: x => x }, { k: 'backtracks', label: 'Backtracks', f: x => x }], r.rows)}
          ${r.solution ? `<div class="grid g21" style="margin-top:16px"><div class="card">${ha}</div><div>${table([{ k: 'c', label: 'Country' }, { k: 's', label: 'Week-slot', f: x => x }, { k: 'l', label: 'Life exp.', d: 1 }, { k: 'p', label: '', f: x => x ? '★' : '' }], r.countries.map(c => ({ c, s: r.solution[c], l: r.life[c], p: r.priority.includes(c) })).sort((x, y) => x.s - y.s))}</div></div>` : note(`No valid schedule with ${v.K} slots - the constraints are over-tight (try more slots). All three strategies agree.`, 'bad')}
          ${note('<b>MRV</b> = pick the variable with the fewest legal values first (fail early). <b>Forward checking</b> removes a chosen value from the neighbours\' domains and backtracks the moment any domain empties - constraint propagation.')}`;
        if (!r.solution) return;
        const tr = r.edges.map(([x, y]) => ({ x: [r.pos[x][0], r.pos[y][0]], y: [r.pos[x][1], r.pos[y][1]], mode: 'lines', line: { color: 'rgba(148,163,184,.5)', width: 1.5 }, hoverinfo: 'skip', showlegend: false }));
        tr.push({ type: 'scatter', mode: 'markers+text', x: r.countries.map(c => r.pos[c][0]), y: r.countries.map(c => r.pos[c][1]), text: r.countries.map(c => c + (r.priority.includes(c) ? ' ★' : '')), textposition: 'top center', textfont: { color: '#e2e8f0', size: 11 }, showlegend: false,
          marker: { size: 38, color: r.countries.map(c => COLORS[(r.solution[c] - 1) % COLORS.length]), line: { color: '#0b1020', width: 2 } }, customdata: r.countries.map(c => r.solution[c]), hovertemplate: '%{text}<br>slot %{customdata}<extra></extra>' });
        tr.push({ type: 'scatter', mode: 'text', x: r.countries.map(c => r.pos[c][0]), y: r.countries.map(c => r.pos[c][1]), text: r.countries.map(c => String(r.solution[c])), textfont: { color: '#08101f', size: 15, family: 'Inter' }, showlegend: false, hoverinfo: 'skip' });
        plot(a, tr, { xaxis: { visible: false, range: [-1.5, 1.5] }, yaxis: { visible: false, range: [-1.4, 1.4], scaleanchor: 'x' }, margin: { t: 20, b: 10, l: 10, r: 10 } });
      } },
      { label: '♟️ Minimax & alpha-beta', controls: [{ id: 'depth', label: 'Depth (plies)', type: 'range', min: 2, max: 5, value: 4 }, { id: 'br', label: 'Branching factor', type: 'range', min: 2, max: 4, value: 3 }, { id: 'seed', label: 'Random seed', type: 'number', min: 0, max: 999, value: 7 }, { id: 'order', label: 'Sort children best-first (ideal move ordering)', type: 'check', value: 0 }],
      render: async (v, el) => {
        const r = await api('search/minimax', v); const [a, ha] = pdiv('tall');
        el.innerHTML = `${note('<b>Ministry vs. outbreak:</b> the Health Ministry (MAX, green) picks a response, then the disease (MIN, red) picks the worst-case spread scenario, alternately. Leaf = lives saved (+) or lost (−) in thousands. Minimax finds the best guaranteed outcome; alpha-beta gets the same answer while skipping branches that cannot matter (grey).')}
          <div class="grid g4">${kpi('Minimax value', r.minimax)}${kpi('Alpha-beta value', r.alphabeta, r.minimax === r.alphabeta ? 'same ✔' : 'MISMATCH', r.minimax === r.alphabeta ? 'up' : 'down')}${kpi('Nodes: minimax', r.n_minimax)}${kpi('Nodes: alpha-beta', r.n_ab, `−${Math.round(100 * (1 - r.n_ab / r.n_minimax))}% work`, 'up')}</div>
          <div class="card" style="margin-top:16px">${ha}</div>${note('Pruned count depends on move ordering - tick "sort children best-first" to see alpha-beta at its best (about the square root of minimax\'s nodes).')}`;
        const ed = { x: [], y: [] }; r.edges.forEach(([x0, y0, x1, y1]) => { ed.x.push(x0, x1, null); ed.y.push(y0, y1, null); });
        plot(a, [{ x: ed.x, y: ed.y, mode: 'lines', line: { color: 'rgba(148,163,184,.4)', width: 1 }, hoverinfo: 'skip', showlegend: false },
          { type: 'scatter', mode: 'markers+text', x: r.nodes.map(n => n.x), y: r.nodes.map(n => n.y), text: r.nodes.map(n => n.val == null ? '' : String(n.val)), textfont: { color: '#08101f', size: r.nodes.length > 40 ? 8 : 11 }, showlegend: false, hoverinfo: 'skip',
            marker: { size: r.nodes.length > 100 ? 13 : r.nodes.length > 40 ? 18 : 26, color: r.nodes.map(n => n.pruned ? '#475569' : n.max ? '#34d399' : '#fb7185'), line: { color: '#0b1020', width: 1.5 } } }], { xaxis: { visible: false }, yaxis: { visible: false }, margin: { t: 10, b: 10 } });
      } }]
  });
};

/* ======================================================================= EXPERT + CHATBOT */
const GOALS = [['rec_wash_programme', 'Fund water & sanitation infrastructure'], ['rec_vaccination_drive', 'Run a catch-up measles vaccination drive'], ['rec_workforce_partnership', 'Partner with donors to train doctors & nurses'], ['rec_urban_hospitals', 'Build district hospitals in big cities'], ['rec_insurance', 'Introduce urban health insurance']];
const CHAT = { msgs: [{ role: 'bot', text: 'Hi! Ask me things like <i>“Which 5 countries have the lowest infant mortality?”</i>, <i>“Compare India and China on life expectancy”</i> or <i>“How has sanitation changed in Nigeria?”</i>' }], cfg: { mode: 'builtin', key: '', model: 'claude-haiku-5-5', temp: 0, explain: 1, prompt: '' } };

PAGES.expert = root => {
  mountPage(root, {
    hero: { badge: 'Unit 1 · Knowledge & reasoning', title: 'Expert System & Chatbot', sub: 'Rule-based reasoning that explains itself, and a chatbot that turns plain English into queries over the data.', chips: ['First-order logic', 'Forward · Backward chaining', 'Prompt engineering', 'LLM'] },
    tabs: [
      { label: '🩺 Health expert system', controls: [{ id: 'country', label: 'Country', type: 'select', options: META.country_list, value: 'Nigeria' }, { id: 'year', label: 'Year', type: 'range', min: META.year_min, max: META.year_max, value: META.year_max },
        { id: 'goal', label: 'Backward chaining: goal to prove', type: 'select', options: GOALS, value: 'rec_wash_programme' },
        { id: 'sanitation', label: 'Low sanitation below (%)', type: 'range', min: 20, max: 95, value: 60 }, { id: 'water', label: 'Low safe water below (%)', type: 'range', min: 40, max: 99, value: 85 }, { id: 'physicians', label: 'Few physicians below (/1000)', type: 'range', min: .1, max: 4, step: .1, value: 1, fmt: v => (+v).toFixed(1) },
        { id: 'beds', label: 'Few beds below (/1000)', type: 'range', min: .2, max: 6, step: .1, value: 1.5, fmt: v => (+v).toFixed(1) }, { id: 'spend', label: 'Low health spend below (% GDP)', type: 'range', min: 1, max: 10, step: .5, value: 4, fmt: v => (+v).toFixed(1) },
        { id: 'measles', label: 'Low measles cover below (%)', type: 'range', min: 50, max: 99, value: 85 }, { id: 'infant', label: 'High infant mortality above (/1000)', type: 'range', min: 5, max: 80, value: 30 }],
      render: async (v, el) => {
        const r = await api('expert', v), N = k => r.nice[k] || k, gap = r.life - r.ml_pred;
        const proof = t => `<div>${t.how.includes('cannot') ? '❌' : '✅'} <b>${esc(N(t.goal))}</b> — <i>${esc(t.how)}</i>${t.children.length ? `<div class="ch">${t.children.map(proof).join('')}</div>` : ''}</div>`;
        el.innerHTML = `${note('<b>Architecture:</b> <i>knowledge base</i> (IF-THEN production rules written in first-order logic) → <i>working memory</i> (facts about the country) → <i>inference engine</i> (forward / backward chaining) → <i>explanation facility</i> (the trace below). Thresholds above are the <i>knowledge-acquisition</i> step - edit them.')}
          <div class="grid g4">${kpi('Life expectancy', fmt(r.life, 1))}${kpi('Infant mortality', fmt(r.infant, 1))}${kpi('Facts observed', r.facts.length)}${kpi('Rules fired', r.trace.length)}</div>
          <div class="section">Working memory - observed facts</div><div>${r.facts.map(f => `<span class="fact">${esc(N(f))}</span>`).join('') || '<i>none</i>'}</div>
          <div class="section">Recommendations</div>${r.recs.map(x => `<div class="rec">${esc(N(x))}</div>`).join('') || note('No rule recommends an intervention - the indicators are above all thresholds.', 'ok')}
          <div class="section">Forward-chaining trace (data-driven inference)</div>${r.trace.length ? table([{ k: 'round', label: 'Round', f: x => x }, { k: 'rule', label: 'Rule' }, { k: 'fired because', label: 'Fired because' }, { k: 'derives', label: 'Derives' }, { k: 'meaning', label: 'Meaning' }], r.trace) : '<i>no rules fired</i>'}
          <div class="sub" style="margin-top:6px">Each round fires every rule whose conditions are now known, adding new facts, until nothing new can be derived (fixed point).</div>
          <div class="section">Backward chaining (goal-driven): why this recommendation?</div><div class="card proof">${proof(r.proof)}</div>
          <div class="section">Expert system vs. machine learning on the same country</div><div class="grid g3">${kpi('ML-predicted life expectancy', fmt(r.ml_pred, 1))}${kpi('Actual', fmt(r.life, 1), `${gap >= 0 ? '+' : ''}${gap.toFixed(1)} vs prediction`, gap >= 0 ? 'up' : 'down')}${kpi('Verdict', gap > 1.5 ? 'over-performer' : gap < -1.5 ? 'under-performer' : 'as expected')}</div>
          ${note('ML tells you <i>what</i> to expect from the numbers; the expert system tells you <i>why it is a problem and what to do</i>, with a human-readable proof. That explainability is the classic strength of rule-based AI; its weakness is that every rule is hand-written.')}
          <div class="section">The knowledge base (rules in first-order logic)</div>${table([{ k: 'id', label: 'Rule' }, { k: 'kind', label: 'Type' }, { k: 'fol', label: 'First-order logic', f: x => `<span class="mono">${esc(x)}</span>` }, { k: 'text', label: 'In plain words' }], r.rules)}`;
      } },
      { label: '💬 Ask-the-data chatbot', render: async (v, el) => {
        const pr = await api('chat/prompt'); if (!CHAT.cfg.prompt) CHAT.cfg.prompt = pr.prompt;
        el.innerHTML = `${note('Ask in plain English. The chatbot <b>translates your question into a structured query</b> (prompt engineering), runs it on the data and answers with a table or chart. Nothing is made up - numbers always come from the dataset.')}
          <div class="grid g12"><div><div class="card"><div class="chat" id="chat"></div>
            <div class="sugg">${['Which 5 countries have the lowest infant mortality?', 'Compare India and China on life expectancy', 'How has sanitation changed in Nigeria?', 'Average physicians by region in 2015', 'Which country improved life expectancy most since 2000?'].map(s => `<button>${s}</button>`).join('')}</div>
            <div class="chatin"><input type="text" id="cq" placeholder="Ask about countries, regions, years…"><button class="btn primary" id="cs">Send</button></div></div></div>
          <div><div class="card"><h3>Chatbot brain</h3><div id="brain" style="margin-top:10px"></div>${pr.has_env_key ? '<div class="sub">An ANTHROPIC_API_KEY is set on the server.</div>' : ''}</div>
          <details><summary>🛠️ Prompt engineering panel</summary><div class="sub" style="margin:8px 0">Role + task framing, explicit JSON schema (structured output), few-shot examples, closed vocabulary (exact column names), an "unsupported" escape hatch against hallucination, temperature 0 for determinism. Editable:</div><textarea id="pp" rows="16"></textarea></details></div></div>`;
        const cfg = CHAT.cfg; $('#pp', el).value = cfg.prompt; $('#pp', el).oninput = e => cfg.prompt = e.target.value;
        controls($('#brain', el), [{ id: 'mode', label: 'Parser', type: 'seg', options: [['builtin', 'Built-in rules'], ['claude', 'Claude API']], value: cfg.mode }, { id: 'key', label: 'Anthropic API key (never stored)', type: 'select', options: [''], value: '' },
          { id: 'model', label: 'Model', type: 'select', options: ['claude-haiku-5-5', 'claude-sonnet-5-5'], value: cfg.model, show: s => s.mode === 'claude' }, { id: 'temp', label: 'Temperature', type: 'range', min: 0, max: 1, step: .1, value: cfg.temp, fmt: v => (+v).toFixed(1), show: s => s.mode === 'claude' },
          { id: 'explain', label: 'LLM writes a short summary', type: 'check', value: cfg.explain, show: s => s.mode === 'claude' }], s => Object.assign(cfg, s), 'slim');
        const keyf = $('#brain .fld:nth-child(2)', el); keyf.innerHTML = '<label>Anthropic API key (never stored)</label><input type="password" id="ck" placeholder="sk-ant-… (or set ANTHROPIC_API_KEY)">'; $('#ck', el).value = cfg.key; $('#ck', el).oninput = e => cfg.key = e.target.value;
        const box = $('#chat', el);
        const draw = () => { box.innerHTML = CHAT.msgs.map((m, i) => `<div class="msg ${m.role}">${m.role === 'user' ? esc(m.text) : `${m.head ? `<b>${esc(m.head)}</b>` : ''}${m.text ? `<div>${m.text}</div>` : ''}${m.note ? `<div class="sub">⚠️ ${esc(m.note)}</div>` : ''}${m.kind === 'table' ? table((m.columns).map(c => ({ k: c, label: c })), m.data) : ''}${m.kind === 'bar' || m.kind === 'line' ? `<div class="plot short" id="cp${i}"></div>` : ''}${m.spec ? `<details><summary>How I understood that</summary><pre class="mono" style="white-space:pre-wrap">${esc(JSON.stringify(m.spec, null, 2))}</pre></details>` : ''}${m.used ? `<div class="meta">parsed by ${esc(m.used)}</div>` : ''}`}</div>`).join('');
          CHAT.msgs.forEach((m, i) => { if (m.kind === 'bar' && m.data.length) { const cols = m.columns, y = cols[cols.length - 1]; plot('cp' + i, [{ type: 'bar', x: m.data.map(r => r[cols[0]]), y: m.data.map(r => r[y]), marker: { color: COLORS } }], { margin: { t: 10 } }); } else if (m.kind === 'line' && m.data.length) { const y = m.columns[m.columns.length - 1], cs = [...new Set(m.data.map(r => r.country))]; plot('cp' + i, cs.map(c => ({ x: m.data.filter(r => r.country === c).map(r => r.year), y: m.data.filter(r => r.country === c).map(r => r[y]), name: c, mode: 'lines', line: { width: 3 } })), { margin: { t: 10 } }); } });
          box.scrollTop = box.scrollHeight; };
        const send = async text => {
          if (!text.trim()) return; CHAT.msgs.push({ role: 'user', text }); CHAT.msgs.push({ role: 'bot', text: '<i>thinking…</i>' }); draw(); $('#cq', el).value = '';
          try { const r = await api('chat', {}, 'POST', { q: text, ...cfg, prompt: cfg.prompt === pr.prompt ? '' : cfg.prompt }); CHAT.msgs.pop(); CHAT.msgs.push({ role: 'bot', head: r.headline, text: esc(r.text), note: r.note, kind: r.kind, columns: r.columns, data: r.data, spec: r.spec, used: r.used }); }
          catch (e) { CHAT.msgs.pop(); CHAT.msgs.push({ role: 'bot', text: 'Error: ' + esc(e.message) }); } draw();
        };
        $('#cs', el).onclick = () => send($('#cq', el).value); $('#cq', el).onkeydown = e => { if (e.key === 'Enter') send(e.target.value); };
        $$('.sugg button', el).forEach(b => b.onclick = () => send(b.textContent)); draw();
      } }]
  });
};
