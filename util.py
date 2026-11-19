"""Small helpers shared by the web routes: JSON encoding that survives numpy/NaN, cached dataframe, query parsing."""
import json
import numpy as np
import pandas as pd
from flask import Response

import datalib as core

_CACHE = {}


def df_now() -> pd.DataFrame:
    v = core.data_version()
    if _CACHE.get("v") != v:
        _CACHE["v"], _CACHE["df"] = v, core.load_clean()
    return _CACHE["df"]


def clean(o):
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (pd.Series, pd.Index, pd.api.extensions.ExtensionArray)):
        return clean(o.tolist())
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        f = float(o)
        return None if (np.isnan(f) or np.isinf(f)) else round(f, 6)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (frozenset, set)):
        return sorted(clean(v) for v in o)
    return o


def J(obj, status=200):
    return Response(json.dumps(clean(obj)), status=status, mimetype="application/json")


def fnum(q, k, d):
    try:
        return float(q.get(k, d))
    except (TypeError, ValueError):
        return d


def inum(q, k, d):
    try:
        return int(float(q.get(k, d)))
    except (TypeError, ValueError):
        return d


def snum(q, k, d):
    return q.get(k, d) or d
