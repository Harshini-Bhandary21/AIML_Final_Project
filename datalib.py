"""Framework-free data layer: loading, cleaning, features, live World Bank refresh, splits (used by Streamlit AND the web app)."""
import json
import time
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from sklearn.model_selection import GroupShuffleSplit

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
RAW_STATIC = DATA / "sdg3_health_raw.csv"
RAW_LIVE = DATA / "live_raw.csv"
META_LIVE = DATA / "live_meta.json"
LAST_RUN = DATA / "last_run.json"

BASE = "https://api.worldbank.org/v2"
START = 1970
INDICATORS = {
    "SP.DYN.LE00.IN": "life_expectancy",
    "SP.DYN.IMRT.IN": "infant_mortality_per_1000",
    "SP.DYN.CBRT.IN": "birth_rate_per_1000",
    "SP.DYN.CDRT.IN": "death_rate_per_1000",
    "SH.XPD.CHEX.GD.ZS": "health_expenditure_pct_gdp",
    "SH.XPD.CHEX.PC.CD": "health_expenditure_per_capita_usd",
    "SH.MED.PHYS.ZS": "physicians_per_1000",
    "SH.MED.BEDS.ZS": "hospital_beds_per_1000",
    "SH.STA.BASS.ZS": "basic_sanitation_pct",
    "SH.H2O.BASW.ZS": "basic_drinking_water_pct",
    "SP.POP.TOTL": "population",
    "NY.GDP.PCAP.CD": "gdp_per_capita_usd",
    "SP.URB.TOTL.IN.ZS": "urban_population_pct",
    "SL.UEM.TOTL.ZS": "unemployment_pct",
    "SH.IMM.MEAS": "measles_immunization_pct",
}

# Inputs a government can actually measure/influence (no birth/death/infant-mortality => no target leakage)
FEATURES = [
    "health_expenditure_pct_gdp", "log_health_exp_pc", "physicians_per_1000", "hospital_beds_per_1000",
    "basic_sanitation_pct", "basic_drinking_water_pct", "log_gdp_per_capita", "urban_population_pct",
    "unemployment_pct", "measles_immunization_pct",
]
NICE = {
    "health_expenditure_pct_gdp": "Health spend (% GDP)", "log_health_exp_pc": "log Health spend per capita",
    "physicians_per_1000": "Physicians /1000", "hospital_beds_per_1000": "Hospital beds /1000",
    "basic_sanitation_pct": "Basic sanitation %", "basic_drinking_water_pct": "Basic drinking water %",
    "log_gdp_per_capita": "log GDP per capita", "urban_population_pct": "Urban population %",
    "unemployment_pct": "Unemployment %", "measles_immunization_pct": "Measles immunisation %",
    "life_expectancy": "Life expectancy (yrs)", "infant_mortality_per_1000": "Infant mortality /1000",
}
TARGETS = {"Life expectancy (years)": "life_expectancy", "Infant mortality (per 1000)": "infant_mortality_per_1000"}
INCOME_ORDER = ["Low income", "Lower middle income", "Upper middle income", "High income"]


# ------------------------------------------------------------------ live World Bank API
def _get_json(url, params, tries=3, timeout=90):
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, params=params, timeout=timeout)
            r.raise_for_status()
            js = r.json()
            if isinstance(js, list) and js and isinstance(js[0], dict) and "message" in js[0]:
                raise RuntimeError(js[0]["message"][0].get("value", "API error"))
            return js
        except Exception as e:  # network hiccup -> back off and retry
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"World Bank API failed for {url.split('/v2/')[-1]}: {last}")


def _fetch_indicator(code, name, end_year):
    """All pages of one indicator -> tidy frame (iso3, year, name)."""
    recs, page = [], 1
    while True:
        js = _get_json(f"{BASE}/country/all/indicator/{code}",
                       {"format": "json", "per_page": 20000, "page": page, "date": f"{START}:{end_year}"})
        recs += (js[1] if len(js) > 1 else None) or []
        if page >= int(js[0].get("pages", 1)):
            break
        page += 1
    part = pd.DataFrame([{"iso3": r["countryiso3code"], "year": int(r["date"]), name: r["value"]} for r in recs])
    return part if not part.empty else pd.DataFrame(columns=["iso3", "year", name])


def fetch_world_bank(progress=None, end_year=None, workers=5):
    """Pull every indicator live from the World Bank API (in parallel) and return the raw country-year grid."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    end_year = end_year or date.today().year
    if progress:
        progress(0.0, "Contacting api.worldbank.org ...")
    cdata = _get_json(f"{BASE}/country", {"format": "json", "per_page": 500}, tries=2, timeout=45)[1]
    meta = pd.DataFrame([
        {"iso3": c["id"], "country": c["name"], "region": c["region"]["value"],
         "income_group": c["incomeLevel"]["value"]}
        for c in cdata if c["region"]["value"] != "Aggregates"])
    grid = meta.merge(pd.DataFrame({"year": range(START, end_year + 1)}), how="cross")
    parts, done = {}, 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(_fetch_indicator, code, name, end_year): name for code, name in INDICATORS.items()}
        for f in as_completed(futs):
            parts[futs[f]] = f.result()       # raises -> whole refresh fails cleanly, old data untouched
            done += 1
            if progress:
                progress(done / len(INDICATORS), f"Downloaded {futs[f]} ({done}/{len(INDICATORS)})")
    for name in INDICATORS.values():           # merge in a fixed column order
        grid = grid.merge(parts[name], on=["iso3", "year"], how="left")
    return grid.sort_values(["country", "year"]).reset_index(drop=True)


def save_live(grid):
    """Atomic write (temp file + rename) so a running site never reads a half-written file."""
    import os
    tmp = RAW_LIVE.with_suffix(".csv.tmp")
    grid.to_csv(tmp, index=False)
    os.replace(tmp, RAW_LIVE)
    META_LIVE.write_text(json.dumps({
        "fetched_at": datetime.now().isoformat(timespec="seconds"),
        "rows": int(len(grid)), "countries": int(grid.iso3.nunique()),
        "year_max": int(grid.dropna(subset=["life_expectancy"]).year.max())}))


def live_age_hours():
    """Hours since the last live download (None if never)."""
    if not (RAW_LIVE.exists() and META_LIVE.exists()):
        return None
    t = datetime.fromisoformat(json.loads(META_LIVE.read_text())["fetched_at"])
    return (datetime.now() - t).total_seconds() / 3600


def data_version():
    p = RAW_LIVE if RAW_LIVE.exists() else RAW_STATIC
    return f"{p.name}:{p.stat().st_mtime_ns}"


def data_source_info():
    if RAW_LIVE.exists() and META_LIVE.exists():
        m = json.loads(META_LIVE.read_text())
        return {"source": "LIVE World Bank API", **m}
    return {"source": "Static CSV snapshot (data/sdg3_health_raw.csv)"}


def reset_live():
    for p in (RAW_LIVE, META_LIVE):
        p.unlink(missing_ok=True)


# ------------------------------------------------------------------ cleaning + feature engineering
def clean_and_engineer(raw: pd.DataFrame) -> pd.DataFrame:
    """Same recipe as Assignment 2: drop missing target, interpolate per country, group-median, global-median."""
    df = raw.dropna(subset=["life_expectancy"]).sort_values(["country", "year"]).reset_index(drop=True)
    df["region"] = df.region.str.strip()
    num = df.select_dtypes("number").columns.drop("year").tolist()
    for c in num:                      # remember what was REALLY observed, before any interpolation / median filling
        df[f"obs_{c}"] = df[c].notna()
    df[num] = df.groupby("country")[num].transform(lambda s: s.interpolate(limit=5, limit_direction="both"))
    df["decade"] = (df.year // 10) * 10
    for c in num:
        df[c] = df[c].fillna(df.groupby(["income_group", "decade"])[c].transform("median"))
        df[c] = df[c].fillna(df[c].median())
    df["log_gdp_per_capita"] = np.log1p(df.gdp_per_capita_usd)
    df["log_population"] = np.log1p(df.population)
    df["log_health_exp_pc"] = np.log1p(df.health_expenditure_per_capita_usd)
    df["natural_increase"] = df.birth_rate_per_1000 - df.death_rate_per_1000
    df["wash_index"] = (df.basic_sanitation_pct + df.basic_drinking_water_pct) / 2
    df["health_capacity_index"] = df.physicians_per_1000 + df.hospital_beds_per_1000
    return df


# ------------------------------------------------------------------ splits
def split(df: pd.DataFrame, target: str, test_size=0.25, seed=42, features=None, max_train=None):
    """Country-grouped split: no country appears in both train and test (rows of one country are near-duplicates)."""
    features = features or FEATURES
    gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed)
    tr, te = next(gss.split(df, groups=df.country))
    if max_train and len(tr) > max_train:
        tr = np.random.RandomState(seed).choice(tr, max_train, replace=False)
    d_tr, d_te = df.iloc[tr], df.iloc[te]
    return d_tr[features].values, d_te[features].values, d_tr[target].values, d_te[target].values, d_tr, d_te


def good_label(df: pd.DataFrame, threshold: float) -> pd.Series:
    return (df.life_expectancy >= threshold).astype(int)



def load_clean(version=None) -> pd.DataFrame:
    p = RAW_LIVE if RAW_LIVE.exists() else RAW_STATIC
    return clean_and_engineer(pd.read_csv(p))


def load_raw_observed() -> pd.DataFrame:
    """Raw country-year data with NO imputation (what the chatbot answers from: only real observations)."""
    raw = pd.read_csv(RAW_LIVE if RAW_LIVE.exists() else RAW_STATIC)
    raw["region"] = raw.region.str.strip()
    return raw


RAW_OF = {"log_gdp_per_capita": "gdp_per_capita_usd", "log_health_exp_pc": "health_expenditure_per_capita_usd"}


def obs_col(feature: str) -> str:
    """Name of the boolean column telling whether `feature` was really observed (not imputed) in a row."""
    return "obs_" + RAW_OF.get(feature, feature)


def observed_df(df: pd.DataFrame, feats) -> pd.DataFrame:
    """Rows where every feature in `feats` is a real observation. Used for the 1-2 feature algorithm pictures, where thousands of
    identical median-imputed values would show up as misleading vertical stripes."""
    m = pd.Series(True, index=df.index)
    for f in feats:
        m &= df[obs_col(f)]
    return df[m]
