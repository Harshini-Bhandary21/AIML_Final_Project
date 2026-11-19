"""PayPal *sandbox* donations to a (fictional) SDG-3 health fund, plus the impact estimate shown next to the buttons.

* Sandbox only: the base URL is hard-coded to api-m.sandbox.paypal.com - no real money can ever move.
* Credentials come from PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET (environment or a local `.env`). The secret never reaches the browser.
* Without credentials the page runs in clearly-labelled SIMULATION mode (no call to PayPal is made).
* Amounts are validated and remembered server-side at create-order time; capture uses the stored values, not what the browser sends.
"""
import json
import os
import threading
import time
import uuid
from pathlib import Path

import requests
from flask import Blueprint, request

import impact
from util import J

bp = Blueprint("paypal", __name__)
HERE = Path(__file__).resolve().parent
SANDBOX = "https://api-m.sandbox.paypal.com"      # deliberately NOT configurable -> sandbox only
LEDGER = HERE / "data" / "donations.json"
MAX_USD = 1000
_LOCK, _TOKEN, _ORDERS = threading.Lock(), {"v": None, "exp": 0}, {}


def _load_env():
    p = HERE / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


_load_env()


def creds():
    return os.environ.get("PAYPAL_CLIENT_ID", "").strip(), os.environ.get("PAYPAL_CLIENT_SECRET", "").strip()


def mode():
    cid, sec = creds()
    return "sandbox" if cid and sec else "demo"


def token():
    if _TOKEN["v"] and time.time() < _TOKEN["exp"] - 60:
        return _TOKEN["v"]
    cid, sec = creds()
    r = requests.post(f"{SANDBOX}/v1/oauth2/token", auth=(cid, sec), data={"grant_type": "client_credentials"}, timeout=25)
    r.raise_for_status()
    j = r.json()
    _TOKEN.update(v=j["access_token"], exp=time.time() + int(j.get("expires_in", 300)))
    return _TOKEN["v"]


def read_ledger():
    try:
        return json.loads(LEDGER.read_text())
    except Exception:
        return []


def add_ledger(entry):
    with _LOCK:
        rows = read_ledger()
        rows.append(entry)
        LEDGER.write_text(json.dumps(rows, indent=1))


def _valid(country, amount):
    try:
        amount = round(float(amount), 2)
    except (TypeError, ValueError):
        raise ValueError("amount must be a number")
    if not (1 <= amount <= MAX_USD):
        raise ValueError(f"amount must be between $1 and ${MAX_USD} (sandbox)")
    t = impact.impact_table()
    if country not in set(t.country):
        raise ValueError("unknown country")
    return amount


@bp.get("/api/paypal/config")
def config():
    cid, _ = creds()
    return J({"mode": mode(), "client_id": cid if mode() == "sandbox" else None, "currency": "USD", "max": MAX_USD, "base": "sandbox.paypal.com"})


@bp.get("/api/impact")
def impact_api():
    q = request.args
    try:
        return J(impact.impact_for(q.get("country", "India"), float(q.get("amount", 25))))
    except KeyError:
        return J({"error": "unknown country"}, 404)


@bp.get("/api/impact/rank")
def impact_rank():
    q = request.args
    amount, n = float(q.get("amount", 1000)), int(q.get("n", 12))
    t = impact.impact_table()
    t = t[t["pop"] >= 1e6].sort_values("py_per_usd", ascending=False)
    t = t if n >= 500 else t.head(n)
    return J({"amount": amount, "rows": [{"country": r.country, "iso3": r.iso3, "income": r.income, "life": r.life, "pop": r["pop"], "cost": r.cost, "gain1": r.gain1,
                                          "person_years": r.py_per_usd * amount} for _, r in t.iterrows()]})


@bp.post("/api/paypal/create-order")
def create_order():
    b = request.get_json(force=True, silent=True) or {}
    try:
        amount = _valid(b.get("country"), b.get("amount"))
    except ValueError as e:
        return J({"error": str(e)}, 400)
    country = b["country"]
    iso3 = impact.impact_for(country, amount)["iso3"]
    if mode() == "demo":
        oid = "SIM-" + uuid.uuid4().hex[:10].upper()
        _ORDERS[oid] = {"amount": amount, "country": country, "iso3": iso3}
        return J({"id": oid, "simulated": True})
    try:
        r = requests.post(f"{SANDBOX}/v2/checkout/orders", headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json", "PayPal-Request-Id": str(uuid.uuid4())},
                          json={"intent": "CAPTURE", "purchase_units": [{"reference_id": iso3, "custom_id": iso3, "description": f"SDG-3 health fund - {country} (sandbox)",
                                                                           "amount": {"currency_code": "USD", "value": f"{amount:.2f}"}}]}, timeout=30)
        r.raise_for_status()
    except Exception as e:
        return J({"error": f"PayPal sandbox error: {type(e).__name__}: {str(e)[:150]}"}, 502)
    oid = r.json()["id"]
    _ORDERS[oid] = {"amount": amount, "country": country, "iso3": iso3}
    return J({"id": oid, "simulated": False})


@bp.post("/api/paypal/capture-order")
def capture_order():
    b = request.get_json(force=True, silent=True) or {}
    oid = b.get("orderID", "")
    info = _ORDERS.get(oid)
    if not info:
        return J({"error": "unknown order"}, 404)
    imp = impact.impact_for(info["country"], info["amount"])
    entry = {"order_id": oid, "time": time.strftime("%Y-%m-%d %H:%M:%S"), "country": info["country"], "iso3": info["iso3"], "amount": info["amount"],
             "person_years": imp["person_years"], "mode": mode(), "simulated": mode() == "demo"}
    if mode() == "demo":
        entry.update(status="COMPLETED", capture_id="SIM-CAPTURE", payer="Simulated donor")
    else:
        try:
            r = requests.post(f"{SANDBOX}/v2/checkout/orders/{oid}/capture", headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}, json={}, timeout=30)
            r.raise_for_status()
            j = r.json()
            cap = (((j.get("purchase_units") or [{}])[0].get("payments") or {}).get("captures") or [{}])[0]
            entry.update(status=j.get("status"), capture_id=cap.get("id"), payer=((j.get("payer") or {}).get("name") or {}).get("given_name", "Sandbox donor"))
        except Exception as e:
            return J({"error": f"PayPal sandbox capture failed: {type(e).__name__}: {str(e)[:150]}"}, 502)
    if entry["status"] == "COMPLETED":
        add_ledger(entry)
    _ORDERS.pop(oid, None)
    return J({"entry": entry, "impact": imp})


@bp.get("/api/donations")
def donations():
    rows = read_ledger()
    by = {}
    for r in rows:
        d = by.setdefault(r["country"], {"country": r["country"], "amount": 0.0, "person_years": 0.0, "n": 0})
        d["amount"] += r["amount"]
        d["person_years"] += r["person_years"]
        d["n"] += 1
    return J({"total": sum(r["amount"] for r in rows), "count": len(rows), "person_years": sum(r["person_years"] for r in rows),
              "by_country": sorted(by.values(), key=lambda x: -x["amount"]), "recent": rows[-12:][::-1], "mode": mode()})
