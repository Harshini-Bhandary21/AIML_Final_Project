"""Research-grade transparency endpoints: /api/methods (data coverage, protocol, cross-validated results vs baselines, software versions,
dataset fingerprint) and /api/about (paper metadata + ready-made citations). Everything is computed from the data actually loaded - nothing is typed in by hand."""
import hashlib
import json
import platform
import re
import threading
import time
from datetime import date
from pathlib import Path

import flask
import numpy as np
import pandas as pd
import scipy
import sklearn
from flask import Blueprint, request
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import GradientBoostingClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import f1_score, mean_squared_error, r2_score, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import datalib as core
from util import J, df_now

bp = Blueprint("research", __name__)
HERE = Path(__file__).resolve().parent
UNITS = {"life_expectancy": "years", "infant_mortality_per_1000": "per 1,000 live births", "birth_rate_per_1000": "per 1,000 people", "death_rate_per_1000": "per 1,000 people",
         "health_expenditure_pct_gdp": "% of GDP", "health_expenditure_per_capita_usd": "current US$", "physicians_per_1000": "per 1,000 people", "hospital_beds_per_1000": "per 1,000 people",
         "basic_sanitation_pct": "% of population", "basic_drinking_water_pct": "% of population", "population": "people", "gdp_per_capita_usd": "current US$",
         "urban_population_pct": "% of population", "unemployment_pct": "% of labour force", "measles_immunization_pct": "% of children aged 12-23 months"}
LABELS = {"life_expectancy": "Life expectancy at birth", "infant_mortality_per_1000": "Infant mortality rate", "birth_rate_per_1000": "Crude birth rate", "death_rate_per_1000": "Crude death rate",
          "health_expenditure_pct_gdp": "Current health expenditure", "health_expenditure_per_capita_usd": "Health expenditure per capita", "physicians_per_1000": "Physicians",
          "hospital_beds_per_1000": "Hospital beds", "basic_sanitation_pct": "People using at least basic sanitation", "basic_drinking_water_pct": "People using at least basic drinking water",
          "population": "Total population", "gdp_per_capita_usd": "GDP per capita", "urban_population_pct": "Urban population", "unemployment_pct": "Unemployment (ILO estimate)",
          "measles_immunization_pct": "Immunisation, measles"}
_CV, _LOCK = {}, threading.Lock()


def plotly_version():
    try:
        head = (HERE / "static" / "vendor" / "plotly.min.js").read_text(errors="ignore")[:400]
        return re.search(r"plotly\.js v([\d.]+)", head).group(1)
    except Exception:
        return None


def cv_results(df):
    """Grouped 5-fold cross-validation (whole countries held out) with the headline models and trivial baselines."""
    X, g = df[core.FEATURES].values, df.country.values
    y_reg, y_clf = df.life_expectancy.values, (df.life_expectancy >= 70).astype(int).values
    cv = GroupKFold(5)
    reg = {"Mean baseline (predicts the training mean)": DummyRegressor(), "Ridge regression (alpha = 1)": make_pipeline(StandardScaler(), Ridge(alpha=1.0)),
           "Random forest regressor (150 trees, max depth 14)": RandomForestRegressor(150, max_depth=14, n_jobs=-1, random_state=0)}
    clf = {"Majority-class baseline": DummyClassifier(strategy="most_frequent"), "Logistic regression (C = 1)": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
           "Gradient boosting (100 trees, max depth 3)": GradientBoostingClassifier(random_state=0)}
    out_reg, out_clf = [], []
    for name, m in reg.items():
        r2, rm = [], []
        for tr, te in cv.split(X, y_reg, g):
            p = m.fit(X[tr], y_reg[tr]).predict(X[te])
            r2.append(r2_score(y_reg[te], p))
            rm.append(mean_squared_error(y_reg[te], p) ** .5)
        out_reg.append({"model": name, "r2_mean": np.mean(r2), "r2_sd": np.std(r2, ddof=1), "rmse_mean": np.mean(rm), "rmse_sd": np.std(rm, ddof=1)})
    for name, m in clf.items():
        ac, f1, au = [], [], []
        for tr, te in cv.split(X, y_clf, g):
            m.fit(X[tr], y_clf[tr])
            p = m.predict(X[te])
            pr = m.predict_proba(X[te])[:, 1]
            ac.append(float((p == y_clf[te]).mean()))
            f1.append(f1_score(y_clf[te], p, zero_division=0))
            au.append(roc_auc_score(y_clf[te], pr) if len(set(pr)) > 1 else 0.5)
        out_clf.append({"model": name, "acc_mean": np.mean(ac), "acc_sd": np.std(ac, ddof=1), "f1_mean": np.mean(f1), "f1_sd": np.std(f1, ddof=1), "auc_mean": np.mean(au), "auc_sd": np.std(au, ddof=1)})
    return {"regression": out_reg, "classification": out_clf, "folds": 5, "positive_share": float(y_clf.mean())}


@bp.get("/api/methods")
def methods():
    df = df_now()
    raw_path = core.RAW_LIVE if core.RAW_LIVE.exists() else core.RAW_STATIC
    inv = {v: k for k, v in core.INDICATORS.items()}
    inds = []
    for col in core.INDICATORS.values():
        o = df["obs_" + col]
        d = df[o]
        inds.append({"code": inv[col], "variable": LABELS.get(col, col), "unit": UNITS.get(col, ""), "observed": int(o.sum()), "share": float(o.mean()),
                     "first_year": int(d.year.min()) if len(d) else None, "last_year": int(d.year.max()) if len(d) else None, "countries": int(d.country.nunique())})
    Xtr, Xte, ytr, yte, dtr, dte = core.split(df, "life_expectancy")
    key = core.data_version()
    with _LOCK:
        if key not in _CV:
            _CV.clear()
            _CV[key] = cv_results(df)
        cv = _CV[key]
    info = core.data_source_info()
    return J({"rows": len(df), "countries": df.country.nunique(), "year_min": int(df.year.min()), "year_max": int(df.year.max()),
              "indicators": inds, "features": [{"key": f, "label": core.NICE.get(f, f)} for f in core.FEATURES],
              "split": {"seed": 42, "test_fraction": .25, "grouped_by": "country", "train_rows": int(len(dtr)), "test_rows": int(len(dte)),
                        "train_countries": int(dtr.country.nunique()), "test_countries": int(dte.country.nunique()), "overlap_countries": int(len(set(dtr.country) & set(dte.country)))},
              "cv": cv, "source": info, "fingerprint": hashlib.sha256(raw_path.read_bytes()).hexdigest(), "file": raw_path.name, "file_mtime": time.strftime("%Y-%m-%d %H:%M", time.localtime(raw_path.stat().st_mtime)),
              "software": {"Python": platform.python_version(), "scikit-learn": sklearn.__version__, "NumPy": np.__version__, "pandas": pd.__version__, "SciPy": scipy.__version__, "Flask": flask.__version__, "Plotly.js (bundled)": plotly_version()}})


def _authors(a, style):
    if style == "apa":
        parts = [f"{x['family']}, {''.join(w[0] + '.' for w in x['given'].split())}" for x in a]
        return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + ", & " + parts[-1]
    return " and ".join(f"{x['family']}, {x['given']}" for x in a)


@bp.get("/api/about")
def about():
    p = json.loads((HERE / "paper.json").read_text())
    url = p.get("url") or p.get("repository")
    today = date.today()
    key = re.sub(r"[^a-z]", "", p["authors"][0]["family"].lower()) + str(p["year"]) + "sdg3"
    apa = f"{_authors(p['authors'], 'apa')} ({p['year']}). {p['title']} (Version {p['version']}) [Interactive web application]. {p['affiliation']}. {url}"
    bib = ("@misc{" + key + ",\n  author = {" + _authors(p["authors"], "bib") + "},\n  title = {" + p["title"] + "},\n  year = {" + str(p["year"]) + "},\n  version = {" + p["version"] + "},\n"
           + "  howpublished = {Interactive web application},\n  institution = {" + p["affiliation"] + "},\n" + (f"  doi = {{{p['doi']}}},\n" if p.get("doi") else "") + "  url = {" + url + "},\n  note = {Accessed " + today.isoformat() + "}\n}")
    return J({**p, "apa": apa, "bibtex": bib, "cite_url": url, "accessed": today.isoformat(), "author_short": _authors(p["authors"], "apa")})
