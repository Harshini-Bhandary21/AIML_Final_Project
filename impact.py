"""Impact model shared by the allocation search and the donation page.

A "package" = a national health programme: +0.5 percentage points of GDP on health, +0.3 physicians/1000, +4 pp sanitation, +2 pp clean water,
+3 pp measles cover.  A monotonic gradient-boosting model (trained on the real data) predicts the life-expectancy gain per package.
Cost of one package = 0.5 % of the country's GDP.  Donations are scaled linearly against that cost - an illustrative back-of-envelope, not a causal claim.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

import datalib as core
from util import df_now

PKG_PCT_GDP = 0.005
_G, _T = {}, {}


def gain_model():
    v = core.data_version()
    if _G.get("v") != v:
        df = df_now()
        cst = [1, 1, 1, 1, 1, 1, 1, 0, 0, 1]
        _G["v"], _G["m"] = v, HistGradientBoostingRegressor(monotonic_cst=cst, max_depth=6, learning_rate=.08, max_iter=250, random_state=0).fit(df[core.FEATURES], df.life_expectancy)
    return _G["m"]


def scenario(row, u):
    """Feature vector of one country after u packages (scalar version, used by the allocation search)."""
    x = row[core.FEATURES].astype(float).copy()
    sp = x.health_expenditure_pct_gdp + .5 * u
    pc = np.expm1(x.log_health_exp_pc) * sp / max(x.health_expenditure_pct_gdp, .1)
    x.log_health_exp_pc, x.health_expenditure_pct_gdp = np.log1p(pc), sp
    x.physicians_per_1000 += .3 * u
    x.basic_sanitation_pct = min(100, x.basic_sanitation_pct + 4 * u)
    x.basic_drinking_water_pct = min(100, x.basic_drinking_water_pct + 2 * u)
    x.measles_immunization_pct = min(99, x.measles_immunization_pct + 3 * u)
    return x.values


def impact_table() -> pd.DataFrame:
    """One row per country (latest year): predicted life-expectancy gain of 1 package, its cost, and person-years gained per US$."""
    v = core.data_version()
    if _T.get("v") == v:
        return _T["t"]
    df = df_now()
    L = df.sort_values("year").groupby("country").tail(1).reset_index(drop=True)
    X0 = L[core.FEATURES].astype(float).copy()
    X1 = X0.copy()
    sp = X0.health_expenditure_pct_gdp + .5
    X1["log_health_exp_pc"] = np.log1p(np.expm1(X0.log_health_exp_pc) * sp / X0.health_expenditure_pct_gdp.clip(lower=.1))
    X1["health_expenditure_pct_gdp"] = sp
    X1["physicians_per_1000"] = X0.physicians_per_1000 + .3
    X1["basic_sanitation_pct"] = (X0.basic_sanitation_pct + 4).clip(upper=100)
    X1["basic_drinking_water_pct"] = (X0.basic_drinking_water_pct + 2).clip(upper=100)
    X1["measles_immunization_pct"] = (X0.measles_immunization_pct + 3).clip(upper=99)
    m = gain_model()
    gain = np.maximum(m.predict(X1) - m.predict(X0), 0)
    t = pd.DataFrame({"country": L.country, "iso3": L.iso3, "region": L.region, "income": L.income_group, "year": L.year, "life": L.life_expectancy, "pop": L.population,
                      "gdp_pc": L.gdp_per_capita_usd, "gain1": gain})
    t["cost"] = t["pop"] * t.gdp_pc * PKG_PCT_GDP
    t["py_per_usd"] = t.gain1 * t["pop"] / t.cost.clip(lower=1)      # person-years of life gained per US$ (linear scaling)
    _T["v"], _T["t"] = v, t
    return t


def impact_for(country: str, amount: float) -> dict:
    t = impact_table()
    r = t[t.country == country]
    if r.empty:
        raise KeyError(country)
    r = r.iloc[0]
    py = float(r.py_per_usd * amount)
    rank = int((t.py_per_usd > r.py_per_usd).sum()) + 1
    return {"country": r.country, "iso3": r.iso3, "amount": amount, "life": float(r.life), "pop": float(r["pop"]), "package_cost": float(r.cost), "gain1": float(r.gain1),
            "fraction": float(amount / r.cost), "person_years": py, "person_days": py * 365.25, "per_1000": float(r.py_per_usd * 1000), "rank": rank, "of": int(len(t))}
