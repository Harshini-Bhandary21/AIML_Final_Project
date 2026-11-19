"""Real-time data endpoints: World Bank (live), WHO GHO, disease.sh (COVID-19 + flags), Open-Meteo air quality + weather.

All sources are free and key-less. Every call has a timeout and reports {ok, ms, error} so the UI can show which APIs answered.
"""
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from flask import Blueprint, request

import datalib as core
from util import J, df_now

bp = Blueprint("live", __name__)
UA = {"User-Agent": "sdg3-aiml-studio/1.0 (student project)"}
_CACHE, _LOCK = {}, threading.Lock()

WB_LIVE = {  # World Bank code -> (dataset column, label, unit)
    "SP.DYN.LE00.IN": ("life_expectancy", "Life expectancy", "yrs"), "SP.DYN.IMRT.IN": ("infant_mortality_per_1000", "Infant mortality", "/1000"),
    "SH.XPD.CHEX.GD.ZS": ("health_expenditure_pct_gdp", "Health spend", "% GDP"), "SH.MED.PHYS.ZS": ("physicians_per_1000", "Physicians", "/1000"),
    "SH.STA.BASS.ZS": ("basic_sanitation_pct", "Basic sanitation", "%"), "NY.GDP.PCAP.CD": ("gdp_per_capita_usd", "GDP per capita", "US$")}


def cached(key, ttl, fn):
    with _LOCK:
        hit = _CACHE.get(key)
        if hit and time.time() - hit[0] < ttl:
            return hit[1]
    val = fn()
    with _LOCK:
        _CACHE[key] = (time.time(), val)
    return val


def fetch(url, params=None, timeout=20):
    t0 = time.time()
    try:
        r = requests.get(url, params=params, headers=UA, timeout=timeout)
        r.raise_for_status()
        return {"ok": True, "ms": int((time.time() - t0) * 1000), "data": r.json()}
    except Exception as e:
        return {"ok": False, "ms": int((time.time() - t0) * 1000), "error": f"{type(e).__name__}: {str(e)[:110]}"}


def _status(res):
    return {k: {"ok": v["ok"], "ms": v["ms"], "error": v.get("error")} for k, v in res.items()}


@bp.get("/api/live/country")
def live_country():
    """Fast sources for one country: World Bank country record (capital + coordinates), disease.sh (flag, population, COVID-19), WHO, then Open-Meteo."""
    iso3 = request.args.get("iso3", "IND").upper()[:3]

    def build():
        with ThreadPoolExecutor(3) as ex:
            f_wbc = ex.submit(fetch, f"{core.BASE}/country/{iso3}", {"format": "json"}, 30)
            f_cov = ex.submit(fetch, f"https://disease.sh/v3/covid-19/countries/{iso3}", {"strict": "true"})
            f_who = ex.submit(fetch, "https://ghoapi.azureedge.net/api/WHOSIS_000001", {"$filter": f"SpatialDim eq '{iso3}' and Dim1 eq 'SEX_BTSX'"})
            wbc, cov, who = f_wbc.result(), f_cov.result(), f_who.result()
        out = {"iso3": iso3, "fetched_at": time.time(), "country": {}, "covid": None, "who": None, "air": None, "weather": None}
        src = {"World Bank (country)": wbc, "disease.sh": cov, "WHO GHO": who}
        lat = lon = None
        if wbc["ok"] and len(wbc["data"]) > 1 and wbc["data"][1]:
            d = wbc["data"][1][0]
            try:
                lat, lon = float(d.get("latitude")), float(d.get("longitude"))
            except (TypeError, ValueError):
                lat = lon = None
            out["country"].update(name=d.get("name"), capital=d.get("capitalCity") or None, region=(d.get("region") or {}).get("value"), income=(d.get("incomeLevel") or {}).get("value"))
        if cov["ok"]:
            c = cov["data"]
            ci = c.get("countryInfo") or {}
            out["covid"] = {k: c.get(k) for k in ("cases", "todayCases", "deaths", "todayDeaths", "recovered", "active", "critical", "tests", "casesPerOneMillion", "deathsPerOneMillion", "updated")}
            out["country"].setdefault("name", c.get("country"))
            out["country"].update(flag=ci.get("flag"), population=c.get("population"), continent=c.get("continent"))
            if lat is None and ci.get("lat") is not None:          # fall back to the country centre
                lat, lon = ci["lat"], ci["long"]
                out["country"]["capital"] = out["country"].get("capital") or "(country centre)"
        if who["ok"]:
            rows = [v for v in who["data"].get("value", []) if v.get("NumericValue") is not None]
            if rows:
                best = max(rows, key=lambda v: v["TimeDim"])
                out["who"] = {"value": best["NumericValue"], "year": best["TimeDim"], "indicator": "Life expectancy at birth, both sexes (WHO GHO)"}
        out["country"].update(lat=lat, lon=lon)
        if lat is not None:
            with ThreadPoolExecutor(2) as ex:
                f_air = ex.submit(fetch, "https://air-quality-api.open-meteo.com/v1/air-quality", {"latitude": lat, "longitude": lon, "current": "us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide"})
                f_w = ex.submit(fetch, "https://api.open-meteo.com/v1/forecast", {"latitude": lat, "longitude": lon, "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code"})
                air, w = f_air.result(), f_w.result()
            src["Open-Meteo air"], src["Open-Meteo weather"] = air, w
            if air["ok"]:
                out["air"] = {"current": air["data"].get("current"), "units": air["data"].get("current_units")}
            if w["ok"]:
                out["weather"] = {"current": w["data"].get("current"), "units": w["data"].get("current_units")}
        out["sources"] = _status(src)
        return out

    return J(cached(("country", iso3), 45, build))


def fetch_retry(url, params=None, tries=3, timeout=12):
    """The World Bank API has erratic latency (0.4 s or 50 s for the same call): short timeout + retry beats one long wait."""
    last = None
    for _ in range(tries):
        last = fetch(url, params, timeout)
        if last["ok"]:
            break
    return last


@bp.get("/api/live/wbcodes")
def live_wbcodes():
    return J({"codes": [{"code": c, "label": v[1], "unit": v[2]} for c, v in WB_LIVE.items()]})


@bp.get("/api/live/wb1")
def live_wb1():
    """One indicator, fetched LIVE from the World Bank right now (latest non-empty value), next to the local snapshot's value."""
    iso3 = request.args.get("iso3", "IND").upper()[:3]
    code = request.args.get("code", "SP.DYN.LE00.IN")
    if code not in WB_LIVE:
        return J({"error": "unknown indicator"}, 400)
    col, label, unit = WB_LIVE[code]

    def build():
        r = fetch_retry(f"{core.BASE}/country/{iso3}/indicator/{code}", {"format": "json", "mrnev": 1})
        live_v = live_y = None
        if r["ok"] and len(r["data"]) > 1 and r["data"][1]:
            rec = r["data"][1][0]
            live_v, live_y = rec.get("value"), rec.get("date")
        raw = core.load_raw_observed()
        s = raw[raw.iso3 == iso3].dropna(subset=[col]).sort_values("year").tail(1)
        sv, sy = (float(s[col].iloc[0]), int(s.year.iloc[0])) if len(s) else (None, None)
        return {"code": code, "label": label, "unit": unit, "live": live_v, "live_year": live_y, "snapshot": sv, "snapshot_year": sy,
                "ok": r["ok"], "ms": r["ms"], "error": r.get("error")}

    return J(cached(("wb1", iso3, code), 600, build))


@bp.get("/api/live/global")
def live_global():
    def build():
        a = fetch("https://disease.sh/v3/covid-19/all")
        b = fetch("https://disease.sh/v3/covid-19/countries", {"sort": "todayCases"})
        out = {"fetched_at": time.time(), "global": a["data"] if a["ok"] else None, "top": [], "sources": _status({"disease.sh global": a, "disease.sh countries": b})}
        if b["ok"]:
            out["top"] = [{"country": c["country"], "iso3": (c.get("countryInfo") or {}).get("iso3"), "todayCases": c.get("todayCases"), "cases": c.get("cases"), "todayDeaths": c.get("todayDeaths"), "active": c.get("active")}
                          for c in b["data"][:10]]
        return out
    return J(cached(("global",), 60, build))


@bp.get("/api/live/countries")
def live_countries():
    """Country picker list (name + iso3) for the live pages."""
    df = df_now()
    t = df.groupby(["country", "iso3"]).size().reset_index()[["country", "iso3"]].sort_values("country")
    return J({"countries": t.to_dict("records")})
