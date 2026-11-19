"""Unit 1 - a rule-based expert system with forward and backward chaining over country health data."""
from dataclasses import dataclass, field

# ---- knowledge base thresholds (editable in the UI = "knowledge acquisition")
DEFAULT_T = {"sanitation": 60, "water": 85, "physicians": 1.0, "beds": 1.5, "spend": 4.0, "measles": 85, "infant": 30, "gdp": 4000, "urban": 70}

# base facts are derived from raw numbers by these (fact name, FOL-style predicate, test)
def base_facts(row, T):
    f = {}
    f["low_sanitation"] = row.basic_sanitation_pct < T["sanitation"]
    f["low_water"] = row.basic_drinking_water_pct < T["water"]
    f["few_physicians"] = row.physicians_per_1000 < T["physicians"]
    f["few_beds"] = row.hospital_beds_per_1000 < T["beds"]
    f["low_health_spend"] = row.health_expenditure_pct_gdp < T["spend"]
    f["low_measles_cover"] = row.measles_immunization_pct < T["measles"]
    f["high_infant_mortality"] = row.infant_mortality_per_1000 > T["infant"]
    f["low_income_economy"] = row.gdp_per_capita_usd < T["gdp"]
    f["highly_urban"] = row.urban_population_pct > T["urban"]
    return {k for k, v in f.items() if v}


@dataclass
class Rule:
    id: str
    if_all: list
    then: str
    text: str
    kind: str = "inference"   # inference | recommendation

    def fol(self):
        body = " ∧ ".join(f"{c.title().replace('_', '')}(x)" for c in self.if_all)
        return f"∀x  {body}  →  {self.then.title().replace('_', '')}(x)"


RULES = [
    Rule("R1", ["low_sanitation", "low_water"], "wash_crisis", "Poor sanitation AND unsafe water mean a water-sanitation-hygiene (WASH) crisis"),
    Rule("R2", ["few_physicians", "few_beds"], "capacity_gap", "Too few doctors AND beds mean a health-system capacity gap"),
    Rule("R3", ["low_measles_cover"], "immunisation_gap", "Measles cover below target leaves children unprotected"),
    Rule("R4", ["low_health_spend", "low_income_economy"], "fiscal_constraint", "Low health budget in a poor economy: the country cannot fix this alone"),
    Rule("R5", ["wash_crisis", "high_infant_mortality"], "child_survival_emergency", "WASH crisis + high infant mortality = child-survival emergency"),
    Rule("R6", ["immunisation_gap", "high_infant_mortality"], "child_survival_emergency", "Unvaccinated children + high infant mortality = child-survival emergency"),
    Rule("R7", ["capacity_gap", "fiscal_constraint"], "needs_external_aid", "Capacity gap that the budget cannot close needs external support"),
    Rule("R8", ["child_survival_emergency"], "rec_wash_programme", "Fund water & sanitation infrastructure first", "recommendation"),
    Rule("R9", ["immunisation_gap"], "rec_vaccination_drive", "Launch a catch-up measles vaccination campaign", "recommendation"),
    Rule("R10", ["needs_external_aid"], "rec_workforce_partnership", "Seek donor-funded training of doctors and nurses", "recommendation"),
    Rule("R11", ["capacity_gap", "highly_urban"], "rec_urban_hospitals", "Build district hospitals in the large cities", "recommendation"),
    Rule("R12", ["low_health_spend", "highly_urban"], "rec_insurance", "Introduce an urban health-insurance scheme to raise spend", "recommendation"),
]

NICE_FACT = {
    "low_sanitation": "sanitation coverage is low", "low_water": "safe drinking water coverage is low", "few_physicians": "few physicians",
    "few_beds": "few hospital beds", "low_health_spend": "health spending is a small share of GDP", "low_measles_cover": "measles immunisation is low",
    "high_infant_mortality": "infant mortality is high", "low_income_economy": "low-income economy", "highly_urban": "highly urbanised",
    "wash_crisis": "WASH crisis", "capacity_gap": "health-system capacity gap", "immunisation_gap": "immunisation gap", "fiscal_constraint": "fiscal constraint",
    "child_survival_emergency": "child-survival emergency", "needs_external_aid": "needs external aid",
    "rec_wash_programme": "Fund water & sanitation infrastructure", "rec_vaccination_drive": "Run a catch-up measles vaccination drive",
    "rec_workforce_partnership": "Partner with donors to train doctors & nurses", "rec_urban_hospitals": "Build district hospitals in big cities",
    "rec_insurance": "Introduce urban health insurance",
}


def forward_chain(facts, rules=RULES):
    """Data-driven: keep firing rules whose conditions are all known until nothing new can be derived."""
    known, trace, rnd = set(facts), [], 0
    changed = True
    while changed:
        changed, rnd = False, rnd + 1
        for r in rules:
            if r.then not in known and all(c in known for c in r.if_all):
                known.add(r.then)
                trace.append({"round": rnd, "rule": r.id, "fired because": " ∧ ".join(r.if_all), "derives": r.then, "meaning": r.text})
                changed = True
    return known, trace


def backward_chain(goal, facts, rules=RULES, depth=0):
    """Goal-driven: returns (proved, proof_tree). Tries every rule concluding the goal, recursively proving its conditions."""
    if goal in facts:
        return True, {"goal": goal, "how": "observed fact", "children": []}
    for r in rules:
        if r.then == goal:
            subs, ok = [], True
            for c in r.if_all:
                p, tree = backward_chain(c, facts, rules, depth + 1)
                subs.append(tree)
                if not p:
                    ok = False
                    break
            if ok:
                return True, {"goal": goal, "how": f"{r.id}: {r.text}", "children": subs}
    return False, {"goal": goal, "how": "cannot be proved", "children": []}
