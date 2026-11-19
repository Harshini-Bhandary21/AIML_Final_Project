"""Chatbot over the health dataset: a built-in intent parser plus an optional Claude 'text -> JSON query' mode."""
import json
import os
import re

import pandas as pd

METRICS = {
    "life_expectancy": ["life expectancy", "lifespan", "life expect", "longevity"],
    "infant_mortality_per_1000": ["infant mortality", "child mortality", "infant death"],
    "gdp_per_capita_usd": ["gdp per capita", "gdp", "income per", "wealth"],
    "health_expenditure_pct_gdp": ["health spend", "health expenditure", "health budget", "spending on health"],
    "physicians_per_1000": ["physician", "doctor"],
    "hospital_beds_per_1000": ["hospital bed", "beds"],
    "basic_sanitation_pct": ["sanitation"],
    "basic_drinking_water_pct": ["drinking water", "clean water", "water access"],
    "measles_immunization_pct": ["measles", "immunis", "immuniz", "vaccin"],
    "birth_rate_per_1000": ["birth rate"],
    "death_rate_per_1000": ["death rate"],
    "population": ["population"],
    "urban_population_pct": ["urban"],
    "unemployment_pct": ["unemployment"],
}
NICE = {"life_expectancy": "life expectancy (yrs)", "infant_mortality_per_1000": "infant mortality (/1000)", "gdp_per_capita_usd": "GDP per capita (US$)",
        "health_expenditure_pct_gdp": "health spend (% GDP)", "physicians_per_1000": "physicians /1000", "hospital_beds_per_1000": "hospital beds /1000",
        "basic_sanitation_pct": "basic sanitation %", "basic_drinking_water_pct": "drinking water %", "measles_immunization_pct": "measles immunisation %",
        "birth_rate_per_1000": "birth rate /1000", "death_rate_per_1000": "death rate /1000", "population": "population", "urban_population_pct": "urban %",
        "unemployment_pct": "unemployment %"}
LOWER_IS_BETTER = {"infant_mortality_per_1000", "death_rate_per_1000", "unemployment_pct"}

SCHEMA_PROMPT = """You translate a user's question about a World Bank SDG-3 health dataset into ONE JSON query. Output JSON only, no prose.

Dataset columns (one row per country-year, 1970-{ymax}): country, region, income_group, year, {metrics}.
Regions: {regions}. Income groups: Low income, Lower middle income, Upper middle income, High income.

JSON schema:
{"op": "rank" | "value" | "compare" | "trend" | "group_avg" | "change",
  "metric": <one metric column>,
  "countries": [<exact country names>],     // for value/compare/trend/change
  "year": <int or null>,                    // null = latest year available
  "year_from": <int or null>, "year_to": <int or null>,   // for change / trend
  "region": <string or null>, "income_group": <string or null>,  // optional filters
  "group_by": "region" | "income_group" | null,            // for group_avg
  "n": <int, default 10>, "ascending": <bool>}            // for rank

Examples:
Q: Which 5 countries have the highest life expectancy? -> {"op":"rank","metric":"life_expectancy","n":5,"ascending":false,"year":null}
Q: Compare India and China on infant mortality -> {"op":"compare","metric":"infant_mortality_per_1000","countries":["India","China"],"year":null}
Q: How has sanitation changed in Nigeria? -> {"op":"trend","metric":"basic_sanitation_pct","countries":["Nigeria"]}
Q: Average physicians by region in 2015 -> {"op":"group_avg","metric":"physicians_per_1000","group_by":"region","year":2015}
Q: Which country improved life expectancy most since 2000? -> {"op":"change","metric":"life_expectancy","year_from":2000,"year_to":null,"n":10,"ascending":false}
If the question cannot be answered from this dataset, output {"op":"unsupported"}."""


def _find_metric(q):
    ql = q.lower()
    for col, keys in METRICS.items():
        if any(k in ql for k in keys):
            return col
    return None


def _find_countries(q, df):
    names = sorted(df.country.unique(), key=len, reverse=True)
    out, ql = [], " " + q.lower() + " "
    alias = {"usa": "United States", "us ": "United States", "uk": "United Kingdom", "russia": "Russian Federation", "vietnam": "Viet Nam",
             "laos": "Lao PDR", "south korea": "Korea, Rep.", "egypt": "Egypt, Arab Rep.", "iran": "Iran, Islamic Rep.", "turkey": "Turkiye"}
    for a, full in alias.items():
        if re.search(rf"\b{re.escape(a.strip())}\b", ql) and full in set(df.country) and full not in out:
            out.append(full)
    for n in names:
        if re.search(rf"\b{re.escape(n.lower())}\b", ql) and n not in out:
            out.append(n)
            ql = ql.replace(n.lower(), " ")
    return out


def parse_builtin(q, df):
    """Rule/regex intent parser - works offline, no API key."""
    ql = q.lower()
    metric = _find_metric(q) or "life_expectancy"
    years = [int(y) for y in re.findall(r"\b(19[7-9]\d|20[0-3]\d)\b", q)]
    countries = _find_countries(q, df)
    nmatch = re.search(r"\b(?:top|bottom|best|worst|highest|lowest)\s+(\d+)\b|\b(\d+)\s+(?:countries|nations)", ql)
    n = int(next(g for g in nmatch.groups() if g)) if nmatch else 10
    asc = any(w in ql for w in ["lowest", "worst", "bottom", "least", "fewest", "smallest"])
    if metric in LOWER_IS_BETTER and any(w in ql for w in ["best", "top"]):
        asc = True
    if metric in LOWER_IS_BETTER and any(w in ql for w in ["worst", "bottom"]):
        asc = False
    region = next((r for r in df.region.unique() if r.lower() in ql), None)
    income = next((i for i in ["low income", "lower middle income", "upper middle income", "high income"] if i in ql), None)
    spec = {"metric": metric, "year": years[-1] if years else None, "region": region, "income_group": income, "n": n, "ascending": asc}
    if any(w in ql for w in ["average", "mean", " by region", " by income"]) and ("by" in ql or "per region" in ql or "each region" in ql):
        spec.update(op="group_avg", group_by="income_group" if "income" in ql.split("by")[-1] else "region")
    elif any(w in ql for w in ["improv", "progress", "increase", "grew", "change", "decline", "fell", "dropped"]) and not countries:
        spec.update(op="change", year_from=years[0] if years else 2000, year_to=years[1] if len(years) > 1 else None)
        spec["ascending"] = any(w in ql for w in ["decline", "fell", "dropped", "worst"])
    elif len(countries) >= 2 and not any(w in ql for w in ["trend", "over time", "history"]):
        spec.update(op="compare", countries=countries)
    elif countries and any(w in ql for w in ["trend", "over time", "history", "changed", "how has", "since"]):
        spec.update(op="trend", countries=countries)
    elif countries:
        spec.update(op="value", countries=countries)
    elif any(w in ql for w in ["highest", "lowest", "best", "worst", "top", "bottom", "which countr", "rank"]):
        spec.update(op="rank")
    else:
        spec.update(op="unsupported")
    return spec


def run_spec(spec, df):
    """Execute a JSON query spec on the dataframe -> (kind, result_df, headline)."""
    op, m = spec.get("op"), spec.get("metric") or "life_expectancy"
    if op == "unsupported" or m not in df.columns:
        return "none", None, "I can only answer questions about the indicators in this dataset (life expectancy, infant mortality, GDP, sanitation, physicians, ...)."
    d = df
    if spec.get("region"):
        d = d[d.region == spec["region"]]
    if spec.get("income_group"):
        d = d[d.income_group.str.lower() == spec["income_group"].lower()]
    d = d.dropna(subset=[m])                       # only real observations - never imputed values
    if d.empty:
        return "none", None, f"No observed data for {NICE.get(m, m)} with those filters."
    ymax = int(d.year.max())
    year = spec.get("year") or ymax
    asc, n = bool(spec.get("ascending")), int(spec.get("n") or 10)
    label = NICE.get(m, m)
    if op == "rank":
        r = d[d.year == year].sort_values(m, ascending=asc).head(n)[["country", "region", m]].reset_index(drop=True)
        r.index += 1
        return "table", r, f"{'Lowest' if asc else 'Highest'} {len(r)} countries for {label} in {year}"
    if op in ("value", "compare"):
        cs = spec.get("countries") or []
        # latest real observation at or before the requested year, per country
        r = d[(d.year <= year) & (d.country.isin(cs))].sort_values("year").groupby("country").tail(1)[["country", "year", m]]
        if r.empty:
            return "none", None, f"No data for {', '.join(cs) or 'those countries'} in {year}."
        return "bar", r, f"{label}, {year}"
    if op == "trend":
        cs = spec.get("countries") or []
        r = d[d.country.isin(cs)]
        if spec.get("year_from"):
            r = r[r.year >= spec["year_from"]]
        return "line", r[["country", "year", m]], f"{label} over time"
    if op == "group_avg":
        g = spec.get("group_by") or "region"
        r = d[d.year == year].groupby(g)[m].mean().sort_values(ascending=asc).round(2).reset_index()
        return "bar", r, f"Average {label} by {g.replace('_', ' ')}, {year}"
    if op == "change":
        y0, y1 = int(spec.get("year_from") or 2000), int(spec.get("year_to") or ymax)
        a = d[d.year == y0].set_index("country")[m]
        b = d[d.year == y1].set_index("country")[m]
        r = (b - a).dropna().rename("change").sort_values(ascending=asc).head(n).round(2).reset_index()
        return "table", r, f"Change in {label}, {y0} → {y1} ({'biggest falls' if asc else 'biggest gains'})"
    return "none", None, "I could not understand that question."


def llm_parse(question, df, api_key, system_prompt=None, model="claude-haiku-5-5", temperature=0.0):
    """Ask Claude to turn the question into the JSON spec. Raises on any API / parse failure so the caller can fall back."""
    import anthropic
    sys = (system_prompt or SCHEMA_PROMPT).replace("{ymax}", str(int(df.year.max()))) \
        .replace("{metrics}", ", ".join(METRICS)).replace("{regions}", "; ".join(sorted(df.region.unique())))
    client = anthropic.Anthropic(api_key=api_key, timeout=30)
    msg = client.messages.create(model=model, max_tokens=400, temperature=temperature, system=sys,
                                 messages=[{"role": "user", "content": question}])
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError(f"model did not return JSON: {text[:120]}")
    return json.loads(m.group(0))


def llm_explain(question, headline, table, api_key, model="claude-haiku-5-5"):
    import anthropic
    client = anthropic.Anthropic(api_key=api_key, timeout=30)
    csv = table.head(15).to_csv(index=False) if table is not None else "(no data)"
    msg = client.messages.create(
        model=model, max_tokens=250, temperature=0.3,
        system="You are a concise public-health data analyst. Answer in at most 3 sentences using ONLY the numbers in the data given. Do not invent figures.",
        messages=[{"role": "user", "content": f"Question: {question}\nResult ({headline}):\n{csv}"}])
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


def get_key(user_key=""):
    return user_key or os.environ.get("ANTHROPIC_API_KEY", "")
