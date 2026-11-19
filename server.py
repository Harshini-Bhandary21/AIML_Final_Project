"""SDG-3 AIML Studio - HTML front-end server.   Run:  python server.py   ->  http://localhost:5050"""
import json
import os
import threading
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, request, send_from_directory
from sklearn.ensemble import GradientBoostingClassifier, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, f1_score, mean_squared_error, r2_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import chatbot as C
import datalib as core
import expert as E
import search_algos as S
from impact import gain_model, scenario
from live_routes import bp as live_bp
from ml_routes import bp as ml_bp
from paypal_routes import bp as paypal_bp
from research_routes import bp as research_bp
from util import J, df_now, fnum, inum, snum

warnings.filterwarnings("ignore")
STATIC = Path(__file__).resolve().parent / "static"
AUTO_SYNC_HOURS = float(os.environ.get("AUTO_SYNC_HOURS", "24"))   # 0 disables; data older than this is re-downloaded automatically
app = Flask(__name__, static_folder=str(STATIC), static_url_path="/static")
app.register_blueprint(ml_bp)
app.register_blueprint(live_bp)
app.register_blueprint(paypal_bp)
app.register_blueprint(research_bp)


@app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


# ======================================================================== meta / overview
@app.get("/api/meta")
def meta():
    df = df_now()
    last = df[df.year == df.year.max()]
    prev = df[df.year == df.year.max() - 10]
    return J({"source": core.data_source_info(), "rows": len(df), "countries": df.country.nunique(), "year_min": int(df.year.min()), "year_max": int(df.year.max()),
              "mean_le": last.life_expectancy.mean(), "mean_le_delta": last.life_expectancy.mean() - prev.life_expectancy.mean(),
              "country_list": sorted(df.country.unique()), "iso": dict(zip(df.country, df.iso3)), "regions": sorted(df.region.unique()), "features": core.NICE, "feature_keys": core.FEATURES,
              "indicators": [c for c in core.NICE if c in df.columns], "last_run": json.loads(core.LAST_RUN.read_text()) if core.LAST_RUN.exists() else None,
              "live": core.RAW_LIVE.exists(), "live_age_h": core.live_age_hours(), "auto_sync": AUTO_SYNC_HOURS})


@app.get("/api/map")
def map_api():
    df, q = df_now(), request.args
    ind, year = snum(q, "indicator", "life_expectancy"), inum(q, "year", int(df.year.max()))
    s = df[df.year == year]
    return J({"iso3": s.iso3, "country": s.country, "value": s[ind], "income": s.income_group, "region": s.region, "gdp": s.gdp_per_capita_usd,
              "pop": s.population, "le": s.life_expectancy})


@app.get("/api/trend")
def trend_api():
    df, q = df_now(), request.args
    ind = snum(q, "indicator", "life_expectancy")
    cs = [c for c in q.get("countries", "").split("|") if c]
    s = df[df.country.isin(cs)]
    return J({c: {"year": g.year, "value": g[ind]} for c, g in s.groupby("country")})


@app.get("/api/group")
def group_api():
    df, q = df_now(), request.args
    ind = snum(q, "indicator", "life_expectancy")
    g = df.groupby(["income_group", "year"])[ind].mean().reset_index()
    return J({k: {"year": v.year, "value": v[ind]} for k, v in g.groupby("income_group")})


@app.get("/api/focus")
def focus_api():
    """Low- vs high-income averages of four headline indicators, from REAL observations only (each country's latest observed value in the last
    7 years) - used by the photo cards on the Overview page so every number shown beside a photo is a measured value, never an imputed one."""
    df = df_now()
    out = {}
    for col in ["measles_immunization_pct", "infant_mortality_per_1000", "basic_sanitation_pct", "physicians_per_1000"]:
        d = df[df["obs_" + col]].sort_values("year").groupby("country").tail(1)
        d = d[d.year >= df.year.max() - 6]
        g = d.groupby("income_group")[col].agg(["mean", "count"])
        if "Low income" in g.index and "High income" in g.index:
            out[col] = {"year": int(d.year.max()), "low": g.loc["Low income", "mean"], "high": g.loc["High income", "mean"],
                        "n_low": int(g.loc["Low income", "count"]), "n_high": int(g.loc["High income", "count"])}
    return J(out)


# ======================================================================== live refresh (background job)
JOB = {"running": False, "progress": 0.0, "msg": "idle", "error": None, "done": False, "finished_at": None, "auto": False}


def _refresh_worker():
    try:
        def prog(p, m):
            JOB.update(progress=float(p), msg=m)
        grid = core.fetch_world_bank(progress=prog)
        if grid.life_expectancy.notna().sum() < 5000:
            raise RuntimeError("API returned too little data - keeping the old dataset.")
        core.save_live(grid)
        JOB.update(progress=1.0, msg="Saved", done=True, error=None, finished_at=time.time())
    except Exception as e:
        JOB.update(error=str(e), msg="failed", done=False)
    finally:
        JOB["running"] = False


def start_refresh(auto=False):
    if JOB["running"]:
        return False
    JOB.update(running=True, progress=0.0, msg="Starting...", error=None, done=False, auto=auto)
    threading.Thread(target=_refresh_worker, daemon=True).start()
    return True


@app.post("/api/refresh/start")
def refresh_start():
    return J({"ok": start_refresh(False), "msg": "" if not JOB["running"] else "running"})


@app.get("/api/refresh/status")
def refresh_status():
    return J(JOB)


@app.post("/api/refresh/reset")
def refresh_reset():
    core.reset_live()
    return J({"ok": True})


def _benchmark(d):
    Xtr, Xte, ytr, yte, dtr, dte = core.split(d, "life_expectancy")
    out = {}
    for name, m in {"Ridge regression": Ridge(1.0), "Random Forest regressor": RandomForestRegressor(150, max_depth=14, n_jobs=-1, random_state=0)}.items():
        p = make_pipeline(StandardScaler(), m).fit(Xtr, ytr).predict(Xte)
        out[name] = {"R2": r2_score(yte, p), "RMSE": mean_squared_error(yte, p) ** .5}
    ytc, yec = (dtr.life_expectancy >= 70).astype(int), (dte.life_expectancy >= 70).astype(int)
    for name, m in {"Logistic regression": LogisticRegression(max_iter=1000), "Gradient Boosting clf": GradientBoostingClassifier(random_state=0)}.items():
        p = make_pipeline(StandardScaler(), m).fit(Xtr, ytc).predict(Xte)
        out[name] = {"Accuracy": accuracy_score(yec, p), "F1": f1_score(yec, p)}
    return out


@app.post("/api/benchmark")
def benchmark():
    df = df_now()
    prev = json.loads(core.LAST_RUN.read_text()) if core.LAST_RUN.exists() else None
    res = _benchmark(df)
    core.LAST_RUN.write_text(json.dumps({"data": core.data_version(), "rows": len(df), "when": time.strftime("%Y-%m-%d %H:%M:%S"), "results": res}))
    rows = []
    for k, v in res.items():
        for m, val in v.items():
            old = prev["results"].get(k, {}).get(m) if prev else None
            rows.append({"model": k, "metric": m, "now": val, "prev": old, "delta": None if old is None else val - old})
    return J({"rows": rows, "rows_used": len(df), "when": time.strftime("%Y-%m-%d %H:%M:%S")})


# ======================================================================== AI search
@app.get("/api/search/grid")
def search_grid():
    q = request.args
    n, wall, seed, w, pick = inum(q, "n", 22), fnum(q, "wall", .22), inum(q, "seed", 3), fnum(q, "w", 1), snum(q, "algo", "A*")
    cost = S.make_grid(n, wall, seed)
    s, g = (0, 0), (n - 1, n - 1)
    algos = {"BFS": lambda: S.bfs(cost, s, g), "DFS": lambda: S.dfs(cost, s, g), "Depth-limited": lambda: S.depth_limited(cost, s, g, 2 * n),
             "Iterative deepening": lambda: S.iterative_deepening(cost, s, g, 4 * n), "Bidirectional BFS": lambda: S.bidirectional(cost, s, g),
             "Uniform-cost": lambda: S.best_first(cost, s, g, "ucs"), "Greedy best-first": lambda: S.best_first(cost, s, g, "greedy"),
             "A*": lambda: S.best_first(cost, s, g, "astar", w), "Hill climbing": lambda: S.hill_climbing(cost, s, g),
             "Hill climbing + restarts": lambda: S.hill_climbing(cost, s, g, restarts=8)}
    res = {k: f() for k, f in algos.items()}
    best = min([r["path_cost"] for r in res.values() if r["found"] and not np.isnan(r["path_cost"])], default=None)
    table = [{"algo": k, "found": r["found"], "expanded": r["expanded"], "cost": r["path_cost"], "steps": r["path_len"],
              "optimal": bool(best is not None and r["found"] and r["path_cost"] == best)} for k, r in res.items()]
    r = res.get(pick, res["A*"])
    order = r["order"]
    if len(order) > 3000:
        order = order[:3000]
    return J({"cost": cost.tolist(), "n": n, "table": table, "algos": list(algos), "pick": pick, "path": r["path"], "order": order, "found": r["found"],
              "expanded": r["expanded"], "path_cost": r["path_cost"], "path_len": r["path_len"], "note": r.get("note")})


@app.get("/api/search/alloc")
def search_alloc():
    df, q = df_now(), request.args
    reg, ncty, B, cap = snum(q, "region", "South Asia"), inum(q, "n", 6), inum(q, "B", 10), inum(q, "cap", 4)
    mdl = gain_model()
    cur = df[(df.region == reg) & (df.year == df.year.max())].nsmallest(ncty, "life_expectancy").reset_index(drop=True)

    gains, table = [], []
    for _, row in cur.iterrows():
        base = mdl.predict(pd.DataFrame([row[core.FEATURES].astype(float)]))[0]
        le = np.maximum.accumulate([mdl.predict(pd.DataFrame([scenario(row, u)], columns=core.FEATURES))[0] - base for u in range(cap + 1)])
        gains.append([row.population / 1e6 * x for x in le])
        table.append({"country": row.country, "life": row.life_expectancy, "pop": row.population / 1e6, "gains": [float(x) for x in le]})
    if B > len(cur) * cap:
        return J({"error": "Budget exceeds what the caps allow - raise the cap or lower B."})
    runs = [S.alloc_exhaustive(gains, B, cap, "bfs"), S.alloc_exhaustive(gains, B, cap, "dfs"), S.alloc_greedy(gains, B, cap), S.alloc_astar(gains, B, cap),
            S.alloc_astar(gains, B, cap, weight=2.0), S.alloc_hill(gains, B, cap, restarts=1)]
    opt = max(r["value"] for r in runs)
    return J({"countries": cur.country.tolist(), "table": table, "runs": [{"name": r["name"], "value": r["value"], "pct": 100 * r["value"] / opt, "nodes": r["nodes"], "plan": r["plan"]} for r in runs],
              "best": max(runs, key=lambda r: r["value"])["plan"]})


EDGES = [("India", "Pakistan"), ("India", "Nepal"), ("India", "Bhutan"), ("India", "Bangladesh"), ("India", "Myanmar"), ("Pakistan", "Afghanistan"), ("Bangladesh", "Myanmar"),
         ("Myanmar", "Thailand"), ("Myanmar", "Lao PDR"), ("Thailand", "Lao PDR"), ("Thailand", "Cambodia"), ("Thailand", "Malaysia"), ("Lao PDR", "Cambodia"),
         ("Lao PDR", "Viet Nam"), ("Cambodia", "Viet Nam")]


@app.get("/api/search/csp")
def search_csp():
    df, q = df_now(), request.args
    K, prio = inum(q, "K", 3), inum(q, "prio", 3)
    cty = sorted({x for e in EDGES for x in e})
    le = df[df.year == df.year.max()].set_index("country").life_expectancy
    lowest = le.reindex(cty).nsmallest(prio).index.tolist()
    doms = {c: ([1, 2] if c in lowest else list(range(1, K + 1))) for c in cty}
    rows, sols = [], {}
    for mode, lab in [("backtracking", "Plain backtracking"), ("mrv", "Backtracking + MRV"), ("forward", "MRV + forward checking")]:
        sol, st = S.csp_solve(cty, doms, EDGES, mode)
        sols[mode] = sol
        rows.append({"strategy": lab, "solved": sol is not None, "assignments": st["assignments"], "backtracks": st["backtracks"]})
    ang = {c: [float(np.cos(2 * np.pi * i / len(cty))), float(np.sin(2 * np.pi * i / len(cty)))] for i, c in enumerate(cty)}
    return J({"rows": rows, "solution": sols["forward"], "countries": cty, "edges": EDGES, "pos": ang, "priority": lowest, "life": {c: le.get(c) for c in cty}})


@app.get("/api/search/minimax")
def search_minimax():
    q = request.args
    depth, br, seed, order_best = inum(q, "depth", 4), inum(q, "br", 3), inum(q, "seed", 7), q.get("order", "0") == "1"
    root = S.build_tree(depth, br, seed)
    c1 = [0]
    v1 = S.minimax(root, True, c1)
    if order_best:
        S.order_children(root, True)
    S.reset_tree(root)
    c2 = [0]
    v2 = S.alphabeta(root, True, -1e9, 1e9, c2)
    pos, leaves = {}, [0]

    def layout(n):
        if not n.kids:
            pos[n.id] = (leaves[0], -n.depth)
            leaves[0] += 1
        else:
            for k in n.kids:
                layout(k)
            pos[n.id] = (float(np.mean([pos[k.id][0] for k in n.kids])), -n.depth)

    layout(root)
    nodes, edges = [], []

    def walk(n):
        nodes.append({"id": n.id, "x": pos[n.id][0], "y": pos[n.id][1], "val": None if n.pruned else n.val, "pruned": n.pruned, "max": n.depth % 2 == 0})
        for k in n.kids:
            edges.append([pos[n.id][0], pos[n.id][1], pos[k.id][0], pos[k.id][1]])
            walk(k)

    walk(root)
    return J({"minimax": v1, "alphabeta": v2, "n_minimax": c1[0], "n_ab": c2[0], "nodes": nodes, "edges": edges})


# ======================================================================== expert system + chatbot
def _thresholds(q):
    T = dict(E.DEFAULT_T)
    for k in T:
        if k in q:
            T[k] = fnum(q, k, T[k])
    return T


@app.get("/api/expert")
def expert_api():
    df, q = df_now(), request.args
    country, T = snum(q, "country", "Nigeria"), _thresholds(q)
    cy = df[df.country == country]
    year = min(max(inum(q, "year", int(df.year.max())), int(cy.year.min())), int(cy.year.max()))
    row = cy[cy.year == year].iloc[0]
    facts = E.base_facts(row, T)
    known, trace = E.forward_chain(facts)
    goal = snum(q, "goal", "rec_wash_programme")
    ok, tree = E.backward_chain(goal, facts)
    # ML comparison
    m = gain_model_full()
    pred = float(m.predict(pd.DataFrame([row[core.FEATURES].astype(float)]))[0])
    return J({"year": year, "years": [int(cy.year.min()), int(cy.year.max())], "life": row.life_expectancy, "infant": row.infant_mortality_per_1000,
              "facts": sorted(facts), "known": sorted(known), "recs": sorted(k for k in known if k.startswith("rec_")), "trace": trace, "nice": E.NICE_FACT,
              "goals": sorted({r.then for r in E.RULES if r.then.startswith("rec_")}), "proof": tree, "proved": ok, "thresholds": T, "defaults": E.DEFAULT_T,
              "rules": [{"id": r.id, "kind": r.kind, "fol": r.fol(), "text": r.text} for r in E.RULES], "ml_pred": pred})


_FULL = {}


def gain_model_full():
    v = core.data_version()
    if _FULL.get("v") != v:
        df = df_now()
        _FULL["v"], _FULL["m"] = v, HistGradientBoostingRegressor(max_depth=6, learning_rate=.08, max_iter=250, random_state=0).fit(df[core.FEATURES], df.life_expectancy)
    return _FULL["m"]


@app.get("/api/chat/prompt")
def chat_prompt():
    return J({"prompt": C.SCHEMA_PROMPT, "has_env_key": bool(C.get_key(""))})


_RAWC = {}


def raw_now():
    v = core.data_version()
    if _RAWC.get("v") != v:
        _RAWC["v"], _RAWC["df"] = v, core.load_raw_observed()
    return _RAWC["df"]


@app.post("/api/chat")
def chat():
    df, b = raw_now(), request.get_json(force=True)
    qn, mode, key = b.get("q", ""), b.get("mode", "builtin"), C.get_key(b.get("key", ""))
    used, note = "built-in rules", ""
    try:
        if mode == "claude" and key:
            spec = C.llm_parse(qn, df, key, b.get("prompt") or None, b.get("model", "claude-haiku-5-5"), float(b.get("temp", 0)))
            used = f"Claude ({b.get('model', 'claude-haiku-5-5')})"
        else:
            spec = C.parse_builtin(qn, df)
            if mode == "claude":
                note = "No API key provided - used the built-in parser."
    except Exception as e:
        spec = C.parse_builtin(qn, df)
        note = f"LLM unavailable ({type(e).__name__}); used built-in rules instead."
    kind, data, headline = C.run_spec(spec, df)
    text = ""
    if mode == "claude" and key and b.get("explain") and data is not None:
        try:
            text = C.llm_explain(qn, headline, data, key, b.get("model", "claude-haiku-5-5"))
        except Exception:
            pass
    return J({"spec": spec, "kind": kind, "headline": headline, "text": text, "used": used, "note": note,
              "columns": [] if data is None else list(data.columns), "data": [] if data is None else data.to_dict("records")})


def auto_sync():
    """Real-time data: on start-up, if the live copy is missing or stale, pull fresh data from the World Bank in the background."""
    if AUTO_SYNC_HOURS <= 0:
        return
    age = core.live_age_hours()
    if age is None or age > AUTO_SYNC_HOURS:
        def later():
            time.sleep(3)
            start_refresh(auto=True)
        threading.Thread(target=later, daemon=True).start()


if __name__ == "__main__":
    print("SDG-3 AIML Studio  ->  http://localhost:5050")
    auto_sync()
    app.run(host="127.0.0.1", port=5050, debug=False, threaded=True)
