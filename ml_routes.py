"""ML endpoints for the HTML front-end: regression, classification, trees/SVM/ensembles/tuning, discovery."""
import time
import warnings

import numpy as np
import pandas as pd
from flask import Blueprint, request
from mlxtend.frequent_patterns import apriori, association_rules
from scipy.cluster.hierarchy import dendrogram, linkage
from sklearn.cluster import DBSCAN, AgglomerativeClustering, KMeans
from sklearn.decomposition import PCA
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.ensemble import (AdaBoostClassifier, BaggingClassifier, GradientBoostingClassifier, IsolationForest,
                              RandomForestClassifier, StackingClassifier, VotingClassifier)
from sklearn.linear_model import ElasticNet, Lasso, LinearRegression, LogisticRegression, Ridge
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, log_loss, mean_absolute_error, mean_squared_error,
                             precision_score, r2_score, recall_score, roc_auc_score, roc_curve, silhouette_score)
from sklearn.model_selection import GridSearchCV, GroupKFold, RandomizedSearchCV, cross_val_score
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

import datalib as core
from util import J, df_now, fnum, inum, snum

warnings.filterwarnings("ignore")
bp = Blueprint("ml", __name__)
TARGETS = {"life_expectancy": "Life expectancy (years)", "infant_mortality_per_1000": "Infant mortality (per 1000)"}


def sample_idx(n, m, seed=0):
    return np.arange(n) if n <= m else np.sort(np.random.RandomState(seed).choice(n, m, replace=False))


# ======================================================================== regression
def reg_metrics(y, p):
    mse = mean_squared_error(y, p)
    return {"MSE": mse, "RMSE": mse ** .5, "MAE": mean_absolute_error(y, p), "R2": r2_score(y, p)}


@bp.get("/api/reg/fit")
def reg_fit():
    """Each algorithm returns exactly what ITS signature picture needs.
    1-feature models (simple, polynomial, KNN, tree) -> a drawable fitted function; all-feature models (multiple, ridge, lasso, elastic net) -> coefficients."""
    df = df_now()
    q = request.args
    target = snum(q, "target", "life_expectancy")
    model = snum(q, "model", "Multiple linear")
    feat = snum(q, "feature", "log_gdp_per_capita")
    degree, alpha, l1, k, depth, qpct = inum(q, "degree", 3), 10 ** fnum(q, "logalpha", 0), fnum(q, "l1", .5), inum(q, "k", 7), inum(q, "depth", 4), fnum(q, "qpct", 50)
    single = model.startswith(("Simple", "Polynomial", "KNN", "Decision"))
    feats = [feat] if single else core.FEATURES
    dfo = core.observed_df(df, [feat]) if single else df       # 1-feature pictures use real observations only (no median-imputed stripes)
    Xtr, Xte, ytr, yte, dtr, dte = core.split(dfo, target, features=feats)
    if model.startswith("Simple") or model == "Multiple linear":
        m = make_pipeline(StandardScaler(), LinearRegression())
    elif model.startswith("Polynomial"):
        m = make_pipeline(StandardScaler(), PolynomialFeatures(degree, include_bias=False), StandardScaler(), LinearRegression())
    elif model == "Ridge":
        m = make_pipeline(StandardScaler(), Ridge(alpha=alpha))
    elif model == "Lasso":
        m = make_pipeline(StandardScaler(), Lasso(alpha=alpha, max_iter=20000))
    elif model == "Elastic Net":
        m = make_pipeline(StandardScaler(), ElasticNet(alpha=alpha, l1_ratio=l1, max_iter=20000))
    elif model.startswith("KNN"):
        m = make_pipeline(StandardScaler(), KNeighborsRegressor(k))
    else:
        m = DecisionTreeRegressor(max_depth=depth, random_state=0)
    m.fit(Xtr, ytr)
    ptr, pte = m.predict(Xtr), m.predict(Xte)
    res = yte - pte
    out = {"model": model, "target": target, "single": single, "metrics": {"train": reg_metrics(ytr, ptr), "test": reg_metrics(yte, pte)},
           "resid": {"pred": pte[sample_idx(len(yte), 1500)], "res": res[sample_idx(len(yte), 1500)], "all": res[sample_idx(len(res), 4000)]}}
    d = dte.assign(predicted=pte, residual=res)
    out["worst"] = d.reindex(d.residual.abs().sort_values(ascending=False).index[:8])[["country", "year", target, "predicted", "residual"]].round(2).to_dict("records")
    if single:
        itr, ite = sample_idx(len(ytr), 450, 1), sample_idx(len(yte), 700, 2)
        out["train"] = {"x": Xtr[itr, 0], "y": ytr[itr]}
        out["test"] = {"x": Xte[ite, 0], "y": yte[ite], "country": dte.country.values[ite], "year": dte.year.values[ite]}
        g = np.linspace(np.percentile(dfo[feat], .3), np.percentile(dfo[feat], 99.7), 400).reshape(-1, 1)
        out["line"] = {"x": g.ravel(), "y": m.predict(g)}
        out["feature_label"] = core.NICE[feat]
        out["rmse_test"] = out["metrics"]["test"]["RMSE"]
        out["n_obs"] = int(len(dfo))
        if model.startswith("Simple"):
            sc, lr = m[0], m[-1]
            b1s = float(lr.coef_[0])
            out["equation"] = {"b0": float(lr.intercept_ - b1s * sc.mean_[0] / sc.scale_[0]), "b1": b1s / float(sc.scale_[0])}
            j = sample_idx(len(yte), 45, 3)                       # residual segments: vertical distance from each point to the line
            out["segments"] = {"x": Xte[j, 0], "y": yte[j], "yhat": pte[j]}
        elif model.startswith("KNN"):
            qx = float(np.percentile(dfo[feat], qpct))
            _, idx = m[-1].kneighbors(m[0].transform([[qx]]))
            out["knn"] = {"qx": qx, "pred": float(m.predict([[qx]])[0]), "k": k, "nx": Xtr[idx[0], 0], "ny": ytr[idx[0]]}
        elif model.startswith("Decision"):
            t = m.tree_
            out["tree"] = {"splits": np.sort(t.threshold[t.feature >= 0]), "leaves": int(m.get_n_leaves())}
    else:
        ix = sample_idx(len(yte), 1500)
        s = {"actual": yte[ix], "pred": pte[ix], "country": dte.country.values[ix], "income": dte.income_group.values[ix], "year": dte.year.values[ix]}
        out["scatter"] = s
        coef = m[-1].coef_
        out["coef"] = [{"feature": core.NICE[f], "value": c} for f, c in zip(feats, coef)]
        if model in ("Ridge", "Lasso", "Elastic Net"):
            ols = LinearRegression().fit(StandardScaler().fit_transform(Xtr), ytr)
            out["coef_ols"] = [{"feature": core.NICE[f], "value": c} for f, c in zip(feats, ols.coef_)]
            out["zeroed"] = int((coef == 0).sum())
            out["alpha"] = alpha
    return J(out)


@bp.get("/api/reg/path")
def reg_path():
    df, q = df_now(), request.args
    target, which = snum(q, "target", "life_expectancy"), snum(q, "method", "Ridge")
    Xtr, Xte, ytr, yte, *_ = core.split(df, target)
    sc = StandardScaler().fit(Xtr)
    Xs, Xt = sc.transform(Xtr), sc.transform(Xte)
    alphas = np.logspace(-3, 2, 30)
    cls = {"Ridge": Ridge, "Lasso": Lasso, "Elastic Net": ElasticNet}
    coefs = {f: [] for f in core.FEATURES}
    for a in alphas:
        mdl = cls[which](alpha=a, max_iter=20000).fit(Xs, ytr)
        for f, c in zip(core.FEATURES, mdl.coef_):
            coefs[f].append(c)
    err = {n: [mean_squared_error(yte, c(alpha=a, max_iter=20000).fit(Xs, ytr).predict(Xt)) ** .5 for a in alphas] for n, c in cls.items()}
    return J({"alphas": alphas, "coefs": {core.NICE[f]: v for f, v in coefs.items()}, "rmse": err})


@bp.get("/api/reg/poly")
def reg_poly():
    df, q = df_now(), request.args
    target, feat = snum(q, "target", "life_expectancy"), snum(q, "feature", "log_gdp_per_capita")
    Xtr, Xte, ytr, yte, *_ = core.split(df, target, features=[feat])
    rows = []
    for d in range(1, 11):
        m = make_pipeline(StandardScaler(), PolynomialFeatures(d, include_bias=False), StandardScaler(), LinearRegression()).fit(Xtr, ytr)
        rows.append({"degree": d, "train": mean_squared_error(ytr, m.predict(Xtr)) ** .5, "test": mean_squared_error(yte, m.predict(Xte)) ** .5})
    return J({"rows": rows, "best": min(rows, key=lambda r: r["test"])["degree"]})


@bp.get("/api/reg/cv")
def reg_cv():
    df, q = df_now(), request.args
    target, kf = snum(q, "target", "life_expectancy"), inum(q, "k", 5)
    X, y, g = df[core.FEATURES].values, df[target].values, df.country.values
    zoo = {"Multiple linear": make_pipeline(StandardScaler(), LinearRegression()), "Ridge": make_pipeline(StandardScaler(), Ridge(1.0)),
           "Lasso": make_pipeline(StandardScaler(), Lasso(0.05, max_iter=20000)), "KNN (k=7)": make_pipeline(StandardScaler(), KNeighborsRegressor(7)),
           "Decision tree (d=6)": DecisionTreeRegressor(max_depth=6, random_state=0)}
    out = {n: cross_val_score(m, X, y, groups=g, cv=GroupKFold(kf), scoring="r2") for n, m in zoo.items()}
    return J({"scores": out, "summary": [{"model": n, "mean": float(np.mean(v)), "std": float(np.std(v))} for n, v in out.items()]})


# ======================================================================== classification
def clf_setup(thr, obs=()):
    """Train/test split (grouped by country). `obs` = features whose rows must be real observations (1-2 feature pictures)."""
    df = df_now()
    d = core.observed_df(df, obs) if obs else df
    Xtr, Xte, _, _, dtr, dte = core.split(d, "life_expectancy")
    return df, Xtr, Xte, core.good_label(dtr, thr).values, core.good_label(dte, thr).values, dtr, dte


@bp.get("/api/clf/run")
def clf_run():
    q = request.args
    thr, k, C, dec = inum(q, "thr", 70), inum(q, "k", 9), 10 ** fnum(q, "logC", 0), fnum(q, "dec", .5)
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr)
    zoo = {"Naive Bayes": make_pipeline(StandardScaler(), GaussianNB()),
           "Logistic Regression": make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=2000)),
           f"KNN (k={k})": make_pipeline(StandardScaler(), KNeighborsClassifier(k))}
    rows, cms, rocs = [], {}, {}
    for n, m in zoo.items():
        m.fit(Xtr, ytr)
        p = m.predict_proba(Xte)[:, 1]
        pr = (p >= dec).astype(int)
        rows.append({"model": n, "Accuracy": accuracy_score(yte, pr), "Precision": precision_score(yte, pr, zero_division=0), "Recall": recall_score(yte, pr),
                     "F1": f1_score(yte, pr), "ROC-AUC": roc_auc_score(yte, p), "Log-loss": log_loss(yte, np.clip(p, 1e-6, 1 - 1e-6))})
        cms[n] = confusion_matrix(yte, pr).tolist()
        fpr, tpr, _ = roc_curve(yte, p)
        ix = sample_idx(len(fpr), 120)
        rocs[n] = {"fpr": fpr[ix], "tpr": tpr[ix]}
    return J({"rows": rows, "cm": cms, "roc": rocs, "share": {"train": ytr.mean(), "test": yte.mean()}})


@bp.get("/api/clf/bayes")
def clf_bayes():
    q = request.args
    thr, f, share = inum(q, "thr", 70), snum(q, "feature", "basic_sanitation_pct"), fnum(q, "q", .5)
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr)
    cut = dtr[f].quantile(1 - share)
    good = core.good_label(dtr, thr).astype(bool)
    ev = dtr[f] >= cut
    prior, lik, pev = good.mean(), ev[good].mean(), ev.mean()
    cm = dtr[core.FEATURES].corr()
    return J({"prior": prior, "likelihood": lik, "evidence": pev, "posterior": lik * prior / pev, "cut": cut,
              "corr": {"labels": [core.NICE[c] for c in cm.columns], "z": cm.values}})


@bp.get("/api/clf/knn")
def clf_knn():
    thr = inum(request.args, "thr", 70)
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr)
    sc = StandardScaler().fit(Xtr)
    rows = []
    for kk in range(1, 41, 2):
        m = KNeighborsClassifier(kk).fit(sc.transform(Xtr), ytr)
        rows.append({"k": kk, "train": m.score(sc.transform(Xtr), ytr), "test": m.score(sc.transform(Xte), yte)})
    return J({"rows": rows})


@bp.get("/api/clf/country")
def clf_country():
    q = request.args
    thr, k, C, dec = inum(q, "thr", 70), inum(q, "k", 9), 10 ** fnum(q, "logC", 0), fnum(q, "dec", .5)
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr)
    country, year = snum(q, "country", "India"), inum(q, "year", int(df.year.max()))
    cy = df[df.country == country]
    row = cy[cy.year == min(max(year, cy.year.min()), cy.year.max())].iloc[0]
    x = row[core.FEATURES].values.astype(float).reshape(1, -1)
    zoo = {"Naive Bayes": GaussianNB(), "Logistic Regression": LogisticRegression(C=C, max_iter=2000), f"KNN (k={k})": KNeighborsClassifier(k)}
    probs = {n: float(make_pipeline(StandardScaler(), m).fit(Xtr, ytr).predict_proba(x)[0, 1]) for n, m in zoo.items()}
    return J({"country": country, "year": int(row.year), "life_expectancy": row.life_expectancy, "truly_good": bool(row.life_expectancy >= thr),
              "probs": probs, "years": [int(cy.year.min()), int(cy.year.max())]})


def _rng(x, lo=.5, hi=99.5):
    return np.percentile(x, [lo, hi])


@bp.get("/api/clf/nb")
def clf_nb():
    """Naive Bayes, one feature: the two class-conditional Gaussians P(x|class), the priors, and the posterior P(good|x) they produce."""
    from scipy.stats import norm
    q = request.args
    thr, f, xq_pct = inum(q, "thr", 70), snum(q, "feature", "basic_sanitation_pct"), fnum(q, "xq", 50)
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr, [f])
    x, xt = dtr[f].values, dte[f].values
    g = GaussianNB().fit(x.reshape(-1, 1), ytr)
    mu, sd, pri = g.theta_[:, 0], np.sqrt(g.var_[:, 0]), g.class_prior_
    lo, hi = _rng(x)
    bins = np.linspace(lo, hi, 31)
    centers = (bins[:-1] + bins[1:]) / 2
    hist = {int(c): np.histogram(x[ytr == c], bins=bins, density=True)[0] for c in (0, 1)}
    xs = np.linspace(lo, hi, 260)
    p0, p1 = norm.pdf(xs, mu[0], sd[0]), norm.pdf(xs, mu[1], sd[1])
    post = p1 * pri[1] / (p1 * pri[1] + p0 * pri[0] + 1e-300)
    cross = np.where(np.diff(np.sign(post - .5)) != 0)[0]
    xq = float(np.percentile(x, xq_pct))
    l0, l1 = float(norm.pdf(xq, mu[0], sd[0])), float(norm.pdf(xq, mu[1], sd[1]))
    return J({"feature": core.NICE[f], "mu": mu, "sd": sd, "prior": pri, "centers": centers, "hist0": hist[0], "hist1": hist[1], "xs": xs, "pdf0": p0, "pdf1": p1, "post": post,
              "boundary": float(xs[cross[0]]) if len(cross) else None, "xq": xq, "lik0": l0, "lik1": l1, "evidence": l0 * pri[0] + l1 * pri[1], "posterior": l1 * pri[1] / (l0 * pri[0] + l1 * pri[1] + 1e-300),
              "acc_one": g.score(xt.reshape(-1, 1), yte), "acc_all": GaussianNB().fit(Xtr, ytr).score(Xte, yte)})


@bp.get("/api/clf/logit")
def clf_logit():
    """Logistic regression, one feature: the fitted sigmoid P(good|x) over the 0/1 data, its 50 % boundary, plus odds ratios of the full model."""
    q = request.args
    thr, f, C = inum(q, "thr", 70), snum(q, "feature", "log_gdp_per_capita"), 10 ** fnum(q, "logC", 0)
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr, [f])
    x, xt = dtr[f].values.reshape(-1, 1), dte[f].values.reshape(-1, 1)
    sc = StandardScaler().fit(x)
    lr = LogisticRegression(C=C, max_iter=2000).fit(sc.transform(x), ytr)
    b1s, b0s, mu, s = float(lr.coef_[0, 0]), float(lr.intercept_[0]), float(sc.mean_[0]), float(sc.scale_[0])
    b1, b0 = b1s / s, b0s - b1s * mu / s
    lo, hi = _rng(x.ravel(), .3, 99.7)
    xs = np.linspace(lo, hi, 300)
    ix = sample_idx(len(ytr), 600, 5)
    sc2 = StandardScaler().fit(Xtr)
    full = LogisticRegression(C=C, max_iter=2000).fit(sc2.transform(Xtr), ytr)
    odds = sorted([{"feature": core.NICE[n], "odds": float(np.exp(c)), "coef": float(c)} for n, c in zip(core.FEATURES, full.coef_[0])], key=lambda r: r["odds"])
    return J({"feature": core.NICE[f], "b0": b0, "b1": b1, "xs": xs, "p": 1 / (1 + np.exp(-(b0 + b1 * xs))), "xstar": (-b0 / b1) if b1 else None,
              "pts": {"x": x.ravel()[ix], "y": ytr[ix]}, "acc_one": lr.score(sc.transform(xt), yte), "acc_all": full.score(sc2.transform(Xte), yte), "odds": odds, "odds_per_unit": float(np.exp(b1))})


@bp.get("/api/clf/knn2d")
def clf_knn2d():
    """KNN made visible: 2 features, decision regions, the query point, its k nearest neighbours and their vote.
    The query country is held OUT of the training rows, otherwise its own earlier years would be its nearest neighbours."""
    q = request.args
    thr, k, fx, fy = inum(q, "thr", 70), inum(q, "k", 9), snum(q, "fx", "log_gdp_per_capita"), snum(q, "fy", "basic_sanitation_pct")
    country = snum(q, "country", "India")
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr, [fx, fy])
    keep = (dtr.country != country).values
    X2, y2 = dtr[[fx, fy]].values[keep], ytr[keep]
    sc = StandardScaler().fit(X2)
    knn = KNeighborsClassifier(k).fit(sc.transform(X2), y2)
    cy = core.observed_df(df[df.country == country], [fx, fy])                       # query only on years where both features were really observed
    if cy.empty:
        return J({"error": f"{country} has no year with both features observed"})
    year = int(cy.year.iloc[(cy.year - inum(q, "year", int(df.year.max()))).abs().argmin()])
    row = cy[cy.year == year].iloc[0]
    qv = row[[fx, fy]].values.astype(float).reshape(1, -1)
    dist, idx = knn.kneighbors(sc.transform(qv))
    nb_lab = y2[idx[0]]
    rx, ry = float(dist[0].max() * sc.scale_[0]), float(dist[0].max() * sc.scale_[1])
    (x0, x1), (y0, y1) = _rng(X2[:, 0]), _rng(X2[:, 1])
    if q.get("zoom", "1") == "1":                    # zoom to the neighbourhood so the k neighbours and their radius are actually visible
        sx, sy = max(rx, (x1 - x0) * .02), max(ry, (y1 - y0) * .02)
        x0, x1, y0, y1 = qv[0, 0] - 3.2 * sx, qv[0, 0] + 3.2 * sx, qv[0, 1] - 3.2 * sy, qv[0, 1] + 3.2 * sy
    gx, gy = np.linspace(x0, x1, 70), np.linspace(y0, y1, 70)
    G = np.array([[a, b] for b in gy for a in gx])
    z = knn.predict_proba(sc.transform(G))[:, 1].reshape(len(gy), len(gx))
    inside = np.where((X2[:, 0] >= x0) & (X2[:, 0] <= x1) & (X2[:, 1] >= y0) & (X2[:, 1] <= y1))[0]
    ip = inside[sample_idx(len(inside), 1500, 7)] if len(inside) else np.array([], int)
    return J({"fx": core.NICE[fx], "fy": core.NICE[fy], "gx": gx, "gy": gy, "z": z, "pts": {"x": X2[ip, 0], "y": X2[ip, 1], "label": y2[ip]}, "n_in_view": int(len(inside)),
              "query": {"x": qv[0, 0], "y": qv[0, 1], "country": country, "year": year, "years": [int(cy.year.min()), int(cy.year.max())], "n_obs": int(len(dtr)), "life": row.life_expectancy, "truly_good": bool(row.life_expectancy >= thr)},
              "nb": {"x": X2[idx[0], 0], "y": X2[idx[0], 1], "label": nb_lab, "dist": dist[0]}, "votes_good": int(nb_lab.sum()), "k": k, "pred_good": bool(nb_lab.sum() * 2 > k),
              "radius_x": float(dist[0].max() * sc.scale_[0]), "radius_y": float(dist[0].max() * sc.scale_[1]),
              "acc2": float(knn.score(sc.transform(dte[[fx, fy]].values), yte))})


@bp.get("/api/regions")
def regions_api():
    """Feature-space partition learned by a tree (and, optionally, a random forest) on 2 features: P(good) over a grid + the data."""
    q = request.args
    thr, depth, crit, fx, fy = inum(q, "thr", 70), inum(q, "depth", 4), snum(q, "criterion", "gini"), snum(q, "fx", "log_gdp_per_capita"), snum(q, "fy", "physicians_per_1000")
    want_rf = q.get("rf", "0") == "1"
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr, [fx, fy])
    X2, Xt2 = dtr[[fx, fy]].values, dte[[fx, fy]].values
    (x0, x1), (y0, y1) = _rng(X2[:, 0]), _rng(X2[:, 1])
    gx, gy = np.linspace(x0, x1, 90), np.linspace(y0, y1, 90)
    G = np.array([[a, b] for b in gy for a in gx])
    dt = DecisionTreeClassifier(criterion=crit, max_depth=depth, random_state=0).fit(X2, ytr)
    out = {"fx": core.NICE[fx], "fy": core.NICE[fy], "gx": gx, "gy": gy, "dt_z": dt.predict_proba(G)[:, 1].reshape(len(gy), len(gx)), "acc_dt": dt.score(Xt2, yte), "acc_dt_train": dt.score(X2, ytr), "depth": depth}
    t = dt.tree_
    out["splits"] = [{"axis": "x" if t.feature[i] == 0 else "y", "thr": float(t.threshold[i])} for i in range(t.node_count) if t.feature[i] >= 0][:40]
    if want_rf:
        rf = RandomForestClassifier(80, max_depth=12, n_jobs=-1, random_state=0).fit(X2, ytr)
        out.update(rf_z=rf.predict_proba(G)[:, 1].reshape(len(gy), len(gx)), acc_rf=rf.score(Xt2, yte), acc_rf_train=rf.score(X2, ytr))
    ip = sample_idx(len(ytr), 1000, 9)
    out["pts"] = {"x": X2[ip, 0], "y": X2[ip, 1], "label": ytr[ip]}
    return J(out)


# ======================================================================== trees / svm / ensembles / tuning
@bp.get("/api/tree")
def tree_api():
    """The fitted tree (top 3 levels) + the exact decision PATH one chosen country-year takes through it."""
    q = request.args
    thr, crit, depth, ccp = inum(q, "thr", 70), snum(q, "criterion", "gini"), inum(q, "depth", 4), fnum(q, "ccp", 0)
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr)
    dt = DecisionTreeClassifier(criterion=crit, max_depth=depth, ccp_alpha=ccp, random_state=0).fit(Xtr, ytr)
    t = dt.tree_
    names = [core.NICE[f] for f in core.FEATURES]
    sample, path = None, set()
    country = q.get("country")
    if country and country in set(df.country):
        cy = df[df.country == country]
        year = min(max(inum(q, "year", int(df.year.max())), int(cy.year.min())), int(cy.year.max()))
        row = cy[cy.year == year].iloc[0]
        xv = row[core.FEATURES].values.astype(float).reshape(1, -1)
        path = set(dt.decision_path(xv).indices.tolist())
        sample = {"country": country, "year": year, "life": row.life_expectancy, "truly_good": bool(row.life_expectancy >= thr), "pred_good": bool(dt.predict(xv)[0]),
                  "depth_reached": len(path) - 1}

    def node(i, d):
        v = t.value[i][0]
        n = {"id": i, "on": i in path, "samples": int(t.n_node_samples[i]), "impurity": float(t.impurity[i]), "value": [int(round(x * t.n_node_samples[i] / max(v.sum(), 1e-9))) for x in v],
             "cls": "good" if v[1] > v[0] else "not good", "frac": float(v[1] / max(v.sum(), 1e-9))}
        if t.children_left[i] != -1:
            n["rule"] = f"{names[t.feature[i]]} <= {t.threshold[i]:.2f}"
            if sample:
                n["val"] = float(xv[0, t.feature[i]])
            if d < 3:
                n["left"], n["right"] = node(t.children_left[i], d + 1), node(t.children_right[i], d + 1)
            else:
                n["more"] = True
        return n

    pth = DecisionTreeClassifier(criterion=crit, random_state=0).cost_complexity_pruning_path(Xtr, ytr)
    alphas = np.unique(np.quantile(pth.ccp_alphas[:-1], np.linspace(0, 1, 25)))  # drop the last alpha: it prunes to the bare root
    pr = []
    for a in alphas:
        tt = DecisionTreeClassifier(criterion=crit, ccp_alpha=a, random_state=0).fit(Xtr, ytr)
        pr.append({"alpha": a, "train": tt.score(Xtr, ytr), "test": tt.score(Xte, yte), "leaves": int(tt.get_n_leaves())})
    return J({"train": dt.score(Xtr, ytr), "test": dt.score(Xte, yte), "leaves": int(dt.get_n_leaves()), "depth": int(dt.get_depth()), "tree": node(0, 0), "sample": sample,
              "importance": sorted([{"feature": n, "value": float(v)} for n, v in zip(names, dt.feature_importances_)], key=lambda r: r["value"]), "prune": pr})


@bp.get("/api/svm")
def svm_api():
    """SVM in 2 features: decision boundary, the +/-1 margin lines, and the support vectors (the only points that define the boundary)."""
    q = request.args
    thr, kern, C, gam, deg = inum(q, "thr", 70), snum(q, "kernel", "rbf"), 10 ** fnum(q, "logC", 0), 10 ** fnum(q, "loggamma", -1), inum(q, "degree", 3)
    fx, fy = snum(q, "fx", "log_gdp_per_capita"), snum(q, "fy", "basic_sanitation_pct")
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr, [fx, fy])
    sub = np.random.RandomState(0).choice(len(dtr), min(2000, len(dtr)), replace=False)
    ds = dtr.iloc[sub]
    ys = core.good_label(ds, thr).values
    gkw = dict(gamma=gam) if kern != "linear" else {}
    m2 = make_pipeline(StandardScaler(), SVC(kernel=kern, C=C, degree=deg, **gkw)).fit(ds[[fx, fy]].values, ys)
    (x0, x1), (y0, y1) = _rng(ds[fx].values, .3, 99.7), _rng(ds[fy].values, .3, 99.7)
    xs, yy = np.linspace(x0, x1, 80), np.linspace(y0, y1, 80)
    z = m2.decision_function(np.array([[a, b] for b in yy for a in xs])).reshape(len(yy), len(xs))
    svi = m2[-1].support_
    ix = sample_idx(len(ds), 800, 11)
    full = make_pipeline(StandardScaler(), SVC(kernel=kern, C=C, degree=deg, **gkw)).fit(ds[core.FEATURES].values, ys)
    kt = []
    for kn in ["linear", "poly", "rbf", "sigmoid"]:
        t0 = time.time()
        mm = make_pipeline(StandardScaler(), SVC(kernel=kn, C=C)).fit(ds[core.FEATURES].values, ys)
        kt.append({"kernel": kn, "test_acc": mm.score(Xte, yte), "support_vectors": int(mm[-1].n_support_.sum()), "fit_s": round(time.time() - t0, 2)})
    return J({"x": xs, "y": yy, "z": np.clip(z, -3, 3), "pts": {"x": ds[fx].values[ix], "y": ds[fy].values[ix], "label": ys[ix]},
              "sv": {"x": ds[fx].values[svi][:400], "y": ds[fy].values[svi][:400], "label": ys[svi][:400]}, "n_sv": int(len(svi)), "n": len(ys),
              "acc2": m2.score(dte[[fx, fy]].values, yte), "acc_all": full.score(Xte, yte), "fx": core.NICE[fx], "fy": core.NICE[fy], "kernels": kt})


_ENS = {}


@bp.get("/api/ens")
def ens_api():
    thr = inum(request.args, "thr", 70)
    key = (core.data_version(), thr)
    if key in _ENS:
        return J(_ENS[key])
    df, Xa, Xb, ya, yb, da, db = clf_setup(thr)
    dt8 = lambda: DecisionTreeClassifier(max_depth=8, random_state=0)
    knn = lambda: make_pipeline(StandardScaler(), KNeighborsClassifier(9))
    nb = lambda: make_pipeline(StandardScaler(), GaussianNB())
    lr = lambda: make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))
    base = {"Decision tree (single)": ("single", dt8()),
            "Bagging (100 trees)": ("bagging", BaggingClassifier(DecisionTreeClassifier(max_depth=10), n_estimators=100, n_jobs=-1, random_state=0)),
            "Random Forest": ("bagging", RandomForestClassifier(300, max_depth=12, n_jobs=-1, random_state=0)),
            "AdaBoost": ("boosting", AdaBoostClassifier(n_estimators=200, learning_rate=.5, random_state=0)),
            "Gradient Boosting": ("boosting", GradientBoostingClassifier(n_estimators=200, max_depth=3, random_state=0)),
            "Voting (soft)": ("combining", VotingClassifier([("dt", dt8()), ("knn", knn()), ("nb", nb()), ("lr", lr())], voting="soft")),
            "Stacking (logistic meta)": ("combining", StackingClassifier([("dt", dt8()), ("knn", knn()), ("nb", nb()), ("rf", RandomForestClassifier(100, max_depth=10, n_jobs=-1, random_state=0))],
                                                                         final_estimator=LogisticRegression(max_iter=2000), cv=3))}
    rows, stage = [], {}
    for n, (fam, m) in base.items():
        t0 = time.time()
        m.fit(Xa, ya)
        p = m.predict_proba(Xb)[:, 1]
        rows.append({"model": n, "family": fam, "train": m.score(Xa, ya), "test": m.score(Xb, yb), "f1": f1_score(yb, m.predict(Xb)), "auc": roc_auc_score(yb, p), "fit_s": round(time.time() - t0, 1)})
        if n in ("AdaBoost", "Gradient Boosting"):
            stage[n] = [accuracy_score(yb, s) for s in m.staged_predict(Xb)]
    _ENS[key] = {"rows": rows, "stage": stage}
    return J(_ENS[key])


@bp.get("/api/tune")
def tune_api():
    q = request.args
    thr, mode = inum(q, "thr", 70), snum(q, "mode", "grid")
    df, Xtr, Xte, ytr, yte, dtr, dte = clf_setup(thr)
    cv, g = GroupKFold(4), dtr.country.values
    if mode == "grid":
        grid = {"max_depth": [2, 3, 4, 6, 8, 10, 14], "min_samples_leaf": [1, 5, 20, 50, 100]}
        gs = GridSearchCV(DecisionTreeClassifier(random_state=0), grid, cv=cv, n_jobs=-1).fit(Xtr, ytr, groups=g)
        r = pd.DataFrame(gs.cv_results_)
        piv = r.pivot(index="param_max_depth", columns="param_min_samples_leaf", values="mean_test_score").astype(float)
        base = DecisionTreeClassifier(random_state=0).fit(Xtr, ytr)
        out = {"heat": {"x": [int(c) for c in piv.columns], "y": [int(i) for i in piv.index], "z": piv.values}}
    else:
        dist = {"n_estimators": [50, 100, 200, 300], "max_depth": [4, 6, 8, 12, None], "min_samples_leaf": [1, 3, 5, 10], "max_features": ["sqrt", 0.5, 0.8]}
        gs = RandomizedSearchCV(RandomForestClassifier(random_state=0, n_jobs=-1), dist, n_iter=12, cv=cv, random_state=0).fit(Xtr, ytr, groups=g)
        r = pd.DataFrame(gs.cv_results_).sort_values("rank_test_score")
        base = RandomForestClassifier(random_state=0, n_jobs=-1).fit(Xtr, ytr)
        out = {"table": [{"rank": int(a), "mean": float(b), "std": float(c), "params": str(d)} for a, b, c, d in zip(r.rank_test_score, r.mean_test_score, r.std_test_score, r.params)]}
    out.update({"best": {k: (None if v is None else v) for k, v in gs.best_params_.items()}, "default_acc": base.score(Xte, yte), "tuned_acc": gs.best_estimator_.score(Xte, yte)})
    return J(out)


# ======================================================================== discovery
UF = core.FEATURES + ["life_expectancy", "infant_mortality_per_1000", "birth_rate_per_1000"]


def snapshot(year):
    df = df_now()
    s = df[df.year == year].reset_index(drop=True)
    X = StandardScaler().fit_transform(s[UF])
    return df, s, X


@bp.get("/api/disc/cluster")
def disc_cluster():
    """Clustering with each algorithm's own signature: K-means centroids, dendrogram cut at k, DBSCAN core/border/noise."""
    q = request.args
    algo, k, link, eps, ms = snum(q, "algo", "kmeans"), inum(q, "k", 4), snum(q, "linkage", "ward"), fnum(q, "eps", 1.2), inum(q, "ms", 4)
    df = df_now()
    year = inum(q, "year", int(df.year.max()) - 2)
    df, s, X = snapshot(year)
    pca = PCA(2).fit(X)
    Z = pca.transform(X)
    out = {"year": year, "evr": pca.explained_variance_ratio_}
    kind = None
    if algo == "kmeans":
        rows = []
        for kk in range(2, 11):
            km_ = KMeans(kk, n_init=10, random_state=0).fit(X)
            rows.append({"k": kk, "inertia": km_.inertia_, "silhouette": silhouette_score(X, km_.labels_)})
        out["elbow"] = rows
        km = KMeans(k, n_init=10, random_state=0).fit(X)
        labels = km.labels_
        out["centroids"] = {"pc1": pca.transform(km.cluster_centers_)[:, 0], "pc2": pca.transform(km.cluster_centers_)[:, 1], "size": np.bincount(labels, minlength=k)}
        out["inertia"] = float(km.inertia_)
    elif algo == "hier":
        labels = AgglomerativeClustering(k, linkage=link).fit_predict(X)
        reg = snum(q, "region", "South Asia")
        sub = s[s.region == reg]
        if len(sub) >= 3:
            Zl = linkage(StandardScaler().fit_transform(sub[UF]), link)
            kk = min(k, len(sub))
            cut = float((Zl[-kk, 2] + Zl[-(kk - 1), 2]) / 2) if kk >= 2 else None
            d = dendrogram(Zl, labels=sub.country.tolist(), color_threshold=cut, no_plot=True)
            out["dendro"] = {"icoord": d["icoord"], "dcoord": d["dcoord"], "labels": d["ivl"], "colors": d["color_list"], "cut": cut, "region": reg, "k": kk}
    else:
        db = DBSCAN(eps=eps, min_samples=ms).fit(X)
        labels = db.labels_
        core_m = np.zeros(len(labels), bool)
        core_m[db.core_sample_indices_] = True
        kind = np.where(labels == -1, "noise", np.where(core_m, "core", "border"))
        out["noise"] = int((labels == -1).sum())
        out["nclusters"] = len(set(labels) - {-1})
        out["kinds"] = {"core": int((kind == "core").sum()), "border": int((kind == "border").sum()), "noise": int((kind == "noise").sum())}
    m = labels >= 0
    out["silhouette"] = float(silhouette_score(X[m], labels[m])) if m.sum() > 2 and len(set(labels[m])) > 1 else None
    s = s.assign(cluster=labels.astype(str), PC1=Z[:, 0], PC2=Z[:, 1])
    prof = s.groupby("cluster")[["life_expectancy", "infant_mortality_per_1000", "gdp_per_capita_usd", "basic_sanitation_pct", "physicians_per_1000"]].mean().round(1)
    prof["countries"] = s.groupby("cluster").size()
    out["points"] = {"pc1": s.PC1, "pc2": s.PC2, "cluster": s.cluster, "country": s.country, "income": s.income_group, "iso3": s.iso3, "kind": kind}
    out["profiles"] = prof.reset_index().to_dict("records")
    return J(out)


@bp.get("/api/disc/pca")
def disc_pca():
    df = df_now()
    year = inum(request.args, "year", int(df.year.max()) - 2)
    df, s, X = snapshot(year)
    pf = PCA().fit(X)
    Z = pf.transform(X)[:, :2]
    ev = pf.explained_variance_ratio_
    lda = LinearDiscriminantAnalysis(n_components=2).fit(X, s.income_group)
    L = lda.transform(X)
    return J({"ev": ev, "cum": np.cumsum(ev), "n95": int(np.searchsorted(np.cumsum(ev), .95) + 1),
              "loadings": [{"feature": core.NICE.get(f, f), "pc1": a, "pc2": b} for f, a, b in zip(UF, pf.components_[0], pf.components_[1])],
              "points": {"pc1": Z[:, 0], "pc2": Z[:, 1], "income": s.income_group, "country": s.country},
              "lda": {"x": L[:, 0], "y": L[:, 1], "income": s.income_group, "country": s.country}})


@bp.get("/api/disc/anomaly")
def disc_anomaly():
    q = request.args
    df = df_now()
    cont, ctry, win = fnum(q, "cont", 1.5) / 100, snum(q, "country", "Rwanda"), inum(q, "win", 5)
    F = ["life_expectancy", "infant_mortality_per_1000", "death_rate_per_1000", "birth_rate_per_1000", "log_gdp_per_capita", "basic_sanitation_pct"]
    Z = StandardScaler().fit_transform(df[F])
    iso = IsolationForest(contamination=cont, random_state=0, n_estimators=200).fit(Z)
    d = df.assign(score=-iso.score_samples(Z), anomaly=iso.predict(Z) == -1)
    top = d[d.anomaly].sort_values("score", ascending=False)
    c = df[df.country == ctry].sort_values("year")
    sm = c.life_expectancy.rolling(win, center=True, min_periods=1).median()
    res = c.life_expectancy - sm
    flag = res.abs() > 2.5 * res.std()
    ix = sample_idx(len(d), 4000)
    return J({"scatter": {"x": d.log_gdp_per_capita.values[ix], "y": d.life_expectancy.values[ix], "anomaly": d.anomaly.values[ix], "country": d.country.values[ix], "year": d.year.values[ix]},
              "n": len(top), "top": top[["country", "year", "life_expectancy", "infant_mortality_per_1000", "death_rate_per_1000", "score"]].head(25).round(2).to_dict("records"),
              "series": {"year": c.year, "raw": c.life_expectancy, "smooth": sm, "flag": flag}, "country": ctry})


@bp.get("/api/disc/apriori")
def disc_apriori():
    q = request.args
    df = df_now()
    y0, y1 = inum(q, "y0", 2000), inum(q, "y1", int(df.year.max()))
    ms, mc, ml = fnum(q, "support", .08), fnum(q, "conf", .8), fnum(q, "lift", 1.3)
    only = q.get("only", "1") == "1"
    ind = {"basic_sanitation_pct": "sanitation", "physicians_per_1000": "physicians", "hospital_beds_per_1000": "beds", "health_expenditure_per_capita_usd": "health-spend",
           "measles_immunization_pct": "measles-vax", "infant_mortality_per_1000": "infant-mortality", "life_expectancy": "life-exp", "log_gdp_per_capita": "gdp", "basic_drinking_water_pct": "water"}
    sub = df[(df.year >= y0) & (df.year <= y1)]
    items = pd.DataFrame(index=sub.index)
    for col, nm in ind.items():
        cut = pd.qcut(sub[col].rank(method="first"), 3, labels=["low", "mid", "high"])
        for lvl in ["low", "mid", "high"]:
            items[f"{nm}={lvl}"] = cut == lvl
    freq = apriori(items, min_support=ms, use_colnames=True, max_len=3)
    if freq.empty:
        return J({"itemsets": 0, "rules": []})
    rules = association_rules(freq, metric="confidence", min_threshold=mc)
    rules = rules[rules.lift >= ml].sort_values("lift", ascending=False)
    rules = rules.assign(rule=rules.antecedents.apply(lambda s: " & ".join(sorted(s))) + "  =>  " + rules.consequents.apply(lambda s: " & ".join(sorted(s))))
    total = len(rules)
    if only:
        rules = rules[rules.consequents.apply(lambda s: any(x.startswith(("infant", "life")) for x in s))]
    return J({"itemsets": len(freq), "total": total, "rules": rules[["rule", "support", "confidence", "lift"]].head(60).round(3).to_dict("records")})
