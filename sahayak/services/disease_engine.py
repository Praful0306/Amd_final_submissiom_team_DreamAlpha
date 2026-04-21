"""
Sahayak AI — Disease Probability + Explainable Clinical Decision Engine

Covers 12 diseases common in rural India (ICMR priority list):
Malaria, Dengue, Typhoid, TB, Pneumonia, Diarrhoea, Anaemia,
Hypertension, Diabetes, Maternal Health, Jaundice, Snakebite

Each disease has:
  - Symptom profile (weighted)
  - Lab abnormality profile
  - ICMR-recommended actions
  - Differential diagnosis hints
"""
import re
import logging

logger = logging.getLogger("sahayak.disease")

# ══════════════════════════════════════════════════════════
# DISEASE KNOWLEDGE BASE — ICMR Standard Treatment Guidelines
# ══════════════════════════════════════════════════════════
DISEASES = {
    "malaria": {
        "display": "Malaria (Plasmodium)",
        "symptoms": {
            "fever": 4, "chills": 4, "sweating": 3, "headache": 2,
            "fatigue": 2, "body ache": 2, "nausea": 2, "vomiting": 2,
            "rigors": 4, "splenomegaly": 3,
        },
        "lab": {"hb": "low", "platelets": "low"},
        "vitals": {"temp": "high"},
        "icmr_action": "Rapid Diagnostic Test (RDT) or thick blood smear mandatory. Artemisinin-based combination therapy (ACT) per NVBDCP guidelines. Severe malaria: refer to district hospital immediately.",
        "red_flags": ["altered consciousness", "severe anaemia", "respiratory distress"],
        "differentials": ["dengue", "typhoid"],
    },
    "dengue": {
        "display": "Dengue Fever",
        "symptoms": {
            "fever": 4, "headache": 3, "joint pain": 4, "muscle pain": 4,
            "rash": 3, "eye pain": 3, "nausea": 2, "vomiting": 2,
            "bleeding": 4, "fatigue": 2,
        },
        "lab": {"platelets": "low", "wbc": "low"},
        "vitals": {"temp": "high"},
        "icmr_action": "NS1 antigen test day 1-5; IgM/IgG after day 5. Oral hydration mandatory. Platelet < 20,000 = admit. Avoid NSAIDs and aspirin.",
        "red_flags": ["bleeding", "platelet < 20000", "abdominal pain severe"],
        "differentials": ["malaria", "typhoid"],
    },
    "typhoid": {
        "display": "Typhoid Fever (Salmonella typhi)",
        "symptoms": {
            "fever": 4, "abdominal pain": 3, "weakness": 3, "headache": 2,
            "constipation": 2, "diarrhoea": 2, "loss of appetite": 3,
            "rose spots": 4, "stepladder fever": 4,
        },
        "lab": {"wbc": "low"},
        "vitals": {"temp": "high"},
        "icmr_action": "Widal test (sensitivity limited). Blood culture gold standard. Azithromycin 1g stat then 500mg OD x 6 days (first-line per ICMR). Admit if unable to take oral fluids.",
        "red_flags": ["intestinal perforation", "gastrointestinal bleeding"],
        "differentials": ["malaria", "dengue"],
    },
    "tuberculosis": {
        "display": "Tuberculosis (TB)",
        "symptoms": {
            "cough": 4, "cough with blood": 5, "night sweats": 4,
            "weight loss": 4, "fatigue": 3, "fever": 3,
            "chest pain": 3, "breathlessness": 3,
        },
        "lab": {"hb": "low"},
        "vitals": {},
        "icmr_action": "Sputum AFB smear x2 + CBNAAT (Xpert MTB/RIF). Refer to DOTS centre. RNTCP Category I regimen: 2HRZE/4HR. Contact tracing mandatory.",
        "red_flags": ["haemoptysis", "SpO2 < 92%", "bilateral disease"],
        "differentials": ["pneumonia"],
    },
    "pneumonia": {
        "display": "Community-Acquired Pneumonia",
        "symptoms": {
            "cough": 3, "fever": 3, "breathlessness": 4, "chest pain": 3,
            "productive sputum": 3, "rapid breathing": 4, "chills": 2,
        },
        "lab": {"wbc": "high"},
        "vitals": {"temp": "high", "spo2": "low", "hr": "high"},
        "icmr_action": "Chest X-ray. CRP/WBC. Amoxicillin 500mg TID x 5 days (outpatient). CURB-65 score ≥ 2: admit. SpO2 < 94%: oxygen therapy.",
        "red_flags": ["SpO2 < 90%", "confusion", "respiratory rate > 30"],
        "differentials": ["tuberculosis"],
    },
    "anaemia": {
        "display": "Iron Deficiency Anaemia",
        "symptoms": {
            "fatigue": 4, "weakness": 4, "pale skin": 4, "shortness of breath": 3,
            "dizziness": 3, "cold hands": 2, "brittle nails": 2, "pica": 3,
        },
        "lab": {"hb": "low"},
        "vitals": {"hr": "high"},
        "icmr_action": "Ferrous sulfate 200mg OD (adult) or 6mg/kg/day (child). Iron-rich diet. Identify and treat cause (hookworm, malnutrition). Severe anaemia (Hb<7): refer for transfusion.",
        "red_flags": ["Hb < 7 g/dL", "cardiac decompensation"],
        "differentials": ["malaria", "tuberculosis"],
    },
    "hypertension": {
        "display": "Hypertension",
        "symptoms": {
            "headache": 3, "dizziness": 3, "blurred vision": 3,
            "chest pain": 2, "nosebleed": 2, "fatigue": 2,
        },
        "lab": {"creatinine": "high"},
        "vitals": {"bp": "high"},
        "icmr_action": "Lifestyle modification + pharmacotherapy. First-line: Amlodipine 5mg OD. Stage 2: dual therapy. BP ≥ 180/120: hypertensive emergency — IV labetalol or oral nifedipine. Monthly monitoring.",
        "red_flags": ["BP >= 180/120", "chest pain", "altered consciousness"],
        "differentials": ["diabetes"],
    },
    "diabetes": {
        "display": "Type 2 Diabetes Mellitus",
        "symptoms": {
            "excessive thirst": 4, "frequent urination": 4, "fatigue": 3,
            "blurred vision": 3, "slow healing": 3, "weight loss": 2,
            "tingling": 2, "numbness": 2,
        },
        "lab": {"sugar": "high"},
        "vitals": {},
        "icmr_action": "HbA1c target < 7%. Metformin 500mg BD (first-line). FBS > 200 or HbA1c > 9: add sulfonylurea or insulin. Foot exam, eye exam, urine microalbumin annually.",
        "red_flags": ["blood sugar > 400", "ketoacidosis", "hyperosmolar state"],
        "differentials": ["hypertension"],
    },
    "diarrhoea": {
        "display": "Acute Gastroenteritis / Diarrhoea",
        "symptoms": {
            "diarrhoea": 5, "vomiting": 3, "abdominal pain": 3, "nausea": 3,
            "fever": 2, "dehydration": 4, "weakness": 2,
        },
        "lab": {},
        "vitals": {"hr": "high", "temp": "high"},
        "icmr_action": "ORS 200-400ml after each loose stool. Zinc 20mg OD x 14 days (child). Do NOT use antibiotics routinely. Metronidazole only if amoebic. Admit if severe dehydration.",
        "red_flags": ["severe dehydration", "bloody stool", "cholera suspicion"],
        "differentials": ["typhoid"],
    },
    "jaundice": {
        "display": "Viral Hepatitis / Jaundice",
        "symptoms": {
            "jaundice": 5, "yellow eyes": 5, "dark urine": 4, "clay stool": 4,
            "nausea": 3, "vomiting": 3, "abdominal pain": 3, "fever": 2,
        },
        "lab": {},
        "vitals": {},
        "icmr_action": "LFT, HBsAg, Anti-HCV, HAV IgM. Rest and high-carb diet. Avoid alcohol and hepatotoxic drugs. Hepatitis B: tenofovir if HBeAg+ or high viral load. Refer to physician.",
        "red_flags": ["coagulopathy", "encephalopathy", "ascites"],
        "differentials": ["typhoid", "malaria"],
    },
    "maternal_complication": {
        "display": "Maternal Health Complication",
        "symptoms": {
            "pregnancy complication": 5, "bleeding in pregnancy": 5,
            "severe headache pregnancy": 4, "blurred vision pregnancy": 4,
            "swelling": 3, "reduced fetal movement": 4,
        },
        "lab": {"hb": "low"},
        "vitals": {"bp": "high"},
        "icmr_action": "Immediate referral to FRU/district hospital. Anaemia: IFA tablets 2 OD. Pre-eclampsia (BP≥140/90 + proteinuria): MgSO4 loading dose 4g IV. ANC check all parameters.",
        "red_flags": ["antepartum haemorrhage", "eclamptic fit", "BP >= 160/110"],
        "differentials": [],
    },
    "snakebite": {
        "display": "Snakebite Envenomation",
        "symptoms": {
            "snakebite": 5, "bite mark": 5, "local swelling": 4,
            "bleeding": 4, "ptosis": 4, "paralysis": 5, "vomiting": 2,
        },
        "lab": {"platelets": "low"},
        "vitals": {},
        "icmr_action": "DO NOT apply tourniquet. Immobilise limb. Anti-Snake Venom (ASV) 10 vials IV immediately — do not wait for lab. Refer to district hospital IMMEDIATELY. WHO 20WBCT every 6 hours.",
        "red_flags": ["neurotoxic symptoms", "coagulopathy", "renal failure"],
        "differentials": [],
    },
}


# ══════════════════════════════════════════════════════════
# CLINICAL RULES ENGINE — deterministic, ICMR-grounded
# ══════════════════════════════════════════════════════════
CLINICAL_RULES = [
    {
        "id":        "severe_anaemia",
        "label":     "Severe Anaemia",
        "severity":  "high",
        "condition": lambda f: _num(f, "hb") is not None and _num(f, "hb") < 7.0,
        "why":       lambda f: f"Haemoglobin = {f.get('hb')} g/dL (< 7 g/dL threshold)",
        "action":    "Urgent referral. Consider blood transfusion. IV iron or oral iron supplementation. Identify cause (hookworm, nutrition, bleeding).",
    },
    {
        "id":        "critical_glucose",
        "label":     "Critically High Blood Sugar",
        "severity":  "high",
        "condition": lambda f: _num(f, "sugar") is not None and _num(f, "sugar") > 300,
        "why":       lambda f: f"Blood sugar = {f.get('sugar')} mg/dL (> 300 — diabetic emergency risk)",
        "action":    "Check for DKA/HHS. IV fluids if indicated. Insulin sliding scale. Urgent medical review. Check HbA1c.",
    },
    {
        "id":        "hypoglycaemia",
        "label":     "Hypoglycaemia",
        "severity":  "high",
        "condition": lambda f: _num(f, "sugar") is not None and _num(f, "sugar") < 60,
        "why":       lambda f: f"Blood sugar = {f.get('sugar')} mg/dL (< 60 — hypoglycaemia)",
        "action":    "Oral glucose if conscious (15g). IV Dextrose 50% 50ml if unconscious. Monitor every 15 min until > 100 mg/dL.",
    },
    {
        "id":        "hypertensive_crisis",
        "label":     "Hypertensive Crisis",
        "severity":  "high",
        "condition": lambda f: _bp_sys(f) is not None and (_bp_sys(f) >= 180 or _bp_dia(f) >= 120),
        "why":       lambda f: f"BP = {f.get('bp')} mmHg (Stage 3 / Crisis)",
        "action":    "Immediate IV antihypertensive (labetalol, hydralazine). Admit ICU. Rule out end-organ damage (ECG, creatinine, fundoscopy).",
    },
    {
        "id":        "hypoxia",
        "label":     "Hypoxia",
        "severity":  "high",
        "condition": lambda f: _num(f, "spo2") is not None and _num(f, "spo2") < 90,
        "why":       lambda f: f"SpO2 = {f.get('spo2')}% (< 90% — critical hypoxia)",
        "action":    "Oxygen therapy immediately. If SpO2 < 88%: consider non-invasive ventilation. Urgent chest X-ray. Admit.",
    },
    {
        "id":        "high_fever",
        "label":     "High Fever",
        "severity":  "medium",
        "condition": lambda f: _num(f, "temp") is not None and _num(f, "temp") >= 38.5,
        "why":       lambda f: f"Temperature = {f.get('temp')}C (>= 38.5C)",
        "action":    "Paracetamol 500mg every 6 hours. Rule out malaria (RDT), dengue, typhoid. Blood culture if persistent. ORS for hydration.",
    },
    {
        "id":        "tachycardia",
        "label":     "Tachycardia",
        "severity":  "medium",
        "condition": lambda f: _num(f, "hr") is not None and _num(f, "hr") > 100,
        "why":       lambda f: f"Heart rate = {f.get('hr')} BPM (> 100)",
        "action":    "Identify cause (fever, anaemia, dehydration, thyrotoxicosis). ECG if HR > 120. Treat underlying cause.",
    },
    {
        "id":        "moderate_anaemia",
        "label":     "Moderate Anaemia",
        "severity":  "medium",
        "condition": lambda f: _num(f, "hb") is not None and 7.0 <= _num(f, "hb") < 10.0,
        "why":       lambda f: f"Haemoglobin = {f.get('hb')} g/dL (7-10 — moderate anaemia)",
        "action":    "Ferrous sulfate 200mg OD. Iron-rich diet counselling. Deworm if needed. Recheck Hb in 4 weeks.",
    },
    {
        "id":        "high_cholesterol",
        "label":     "Hypercholesterolaemia",
        "severity":  "low",
        "condition": lambda f: _num(f, "cholesterol") is not None and _num(f, "cholesterol") >= 240,
        "why":       lambda f: f"Cholesterol = {f.get('cholesterol')} mg/dL (>= 240)",
        "action":    "Statin therapy (atorvastatin 10-20mg OD). Low-fat diet. Cardiovascular risk assessment. Annual lipid profile.",
    },
    {
        "id":        "pre_diabetes",
        "label":     "Pre-Diabetes",
        "severity":  "low",
        "condition": lambda f: _num(f, "sugar") is not None and 100 <= _num(f, "sugar") < 126,
        "why":       lambda f: f"Fasting blood sugar = {f.get('sugar')} mg/dL (100-125 — pre-diabetic range)",
        "action":    "Lifestyle modification: diet control, 150 min/week exercise. HbA1c test. Recheck FBS in 3 months. Metformin if high risk.",
    },
]

def _num(form, field):
    v = form.get(field)
    if v is None: return None
    m = re.search(r"[\d.]+", str(v))
    return float(m.group()) if m else None

def _bp_sys(form):
    bp = form.get("bp")
    if not bp: return None
    m = re.search(r"(\d{2,3})\s*/\s*(\d{2,3})", str(bp))
    return float(m.group(1)) if m else None

def _bp_dia(form):
    bp = form.get("bp")
    if not bp: return None
    m = re.search(r"(\d{2,3})\s*/\s*(\d{2,3})", str(bp))
    return float(m.group(2)) if m else None


# ══════════════════════════════════════════════════════════
# CLINICAL RULES RUNNER
# ══════════════════════════════════════════════════════════
def run_clinical_rules(form: dict) -> list:
    alerts = []
    for rule in CLINICAL_RULES:
        try:
            if rule["condition"](form):
                alerts.append({
                    "id"       : rule["id"],
                    "label"    : rule["label"],
                    "severity" : rule["severity"],
                    "why"      : rule["why"](form),
                    "action"   : rule["action"],
                })
        except Exception as e:
            logger.debug("Rule %s skipped: %s", rule["id"], e)
    return alerts


def triage_level(alerts: list) -> str:
    if any(a["severity"] == "high" for a in alerts):
        return "HIGH"
    elif any(a["severity"] == "medium" for a in alerts):
        return "MEDIUM"
    return "LOW"


# ══════════════════════════════════════════════════════════
# DISEASE PROBABILITY ENGINE + EXPLAINABLE AI
# ══════════════════════════════════════════════════════════
def score_disease(disease_key: str, form: dict, symptoms_text: str,
                  interpreted: dict) -> tuple:
    """Returns (score, reasons_list) for explainable output."""
    profile = DISEASES[disease_key]
    score   = 0
    reasons = []
    syms_lower = (symptoms_text or "").lower()

    # Symptom matching (weighted)
    for sym, weight in profile["symptoms"].items():
        if sym in syms_lower:
            score += weight
            reasons.append(f"Symptom: '{sym}' present (+{weight})")

    # Lab abnormality matching
    for lab, expected_status in profile["lab"].items():
        actual = interpreted.get(lab, {})
        actual_status = actual.get("status", "") if isinstance(actual, dict) else str(actual)
        if expected_status in actual_status:
            score += 4
            reasons.append(f"Lab: {lab} is {expected_status} (+4)")

    # Vitals matching
    for vital, expected_status in profile["vitals"].items():
        actual = interpreted.get(vital, {})
        actual_status = actual.get("status", "") if isinstance(actual, dict) else str(actual)
        if expected_status in actual_status:
            score += 3
            reasons.append(f"Vital: {vital} is {expected_status} (+3)")

    return score, reasons


def get_disease_probabilities(form: dict, symptoms_text: str,
                               interpreted: dict) -> dict:
    """Returns dict of {disease: {probability, reasons, display, action}}."""
    raw_scores = {}
    all_reasons = {}

    for key in DISEASES:
        s, r = score_disease(key, form, symptoms_text, interpreted)
        if s > 0:
            raw_scores[key]  = s
            all_reasons[key] = r

    if not raw_scores:
        return {}

    total = sum(raw_scores.values()) or 1
    result = {}
    for key, score in sorted(raw_scores.items(), key=lambda x: -x[1]):
        prob = round((score / total) * 100, 1)
        if prob >= 5:   # only include if >= 5%
            result[key] = {
                "display"    : DISEASES[key]["display"],
                "probability": prob,
                "reasons"    : all_reasons.get(key, []),
                "icmr_action": DISEASES[key]["icmr_action"],
                "differentials": DISEASES[key]["differentials"],
            }
    return result


# ══════════════════════════════════════════════════════════
# TREND DETECTION (patient history across reports)
# ══════════════════════════════════════════════════════════
def detect_trend(values: list) -> dict:
    """Analyse a time-series of values for trend direction and severity."""
    clean = [v for v in values if v is not None]
    if len(clean) < 2:
        return {"direction": "insufficient_data", "change_pct": 0, "label": "Not enough data"}

    first, last = clean[0], clean[-1]
    change = last - first
    pct    = round((change / abs(first)) * 100, 1) if first != 0 else 0

    if abs(pct) < 5:
        return {"direction": "stable",     "change_pct": pct, "label": "Stable"}
    elif pct > 0:
        return {"direction": "increasing", "change_pct": pct, "label": f"Increasing +{pct}%"}
    else:
        return {"direction": "decreasing", "change_pct": pct, "label": f"Decreasing {pct}%"}


def analyze_patient_trends(reports: list) -> dict:
    """
    Takes a list of report dicts (sorted oldest first).
    Returns trend analysis for key vitals.
    """
    def _extract(field, alt_field=None):
        vals = []
        for r in reports:
            v = r.get(field) or (r.get(alt_field) if alt_field else None)
            m = re.search(r"[\d.]+", str(v)) if v else None
            vals.append(float(m.group()) if m else None)
        return vals

    trends = {}
    for field, alt in [("sugar","blood_sugar"),("hb","hemoglobin"),
                       ("cholesterol",None),("spo2",None),("weight",None)]:
        vals = _extract(field, alt)
        clean = [v for v in vals if v is not None]
        if len(clean) >= 2:
            t = detect_trend(clean)
            trends[field] = {"values": clean, **t}

    # BP systolic trend
    bp_vals = []
    for r in reports:
        bp = r.get("bp")
        m = re.search(r"(\d{2,3})\s*/", str(bp)) if bp else None
        bp_vals.append(float(m.group(1)) if m else None)
    clean_bp = [v for v in bp_vals if v is not None]
    if len(clean_bp) >= 2:
        trends["bp"] = {"values": clean_bp, **detect_trend(clean_bp)}

    return trends


# ══════════════════════════════════════════════════════════
# PATIENT PRIORITISATION (for Doctor Dashboard)
# ══════════════════════════════════════════════════════════
def patient_priority_score(form: dict, alerts: list,
                            disease_probs: dict) -> dict:
    """Compute priority score for doctor dashboard sorting."""
    score = 0

    for alert in alerts:
        if alert["severity"] == "high":   score += 50
        elif alert["severity"] == "medium": score += 20
        else: score += 5

    # Top disease probability
    if disease_probs:
        top_prob = max(d["probability"] for d in disease_probs.values())
        score += top_prob * 0.4

    # Critical vitals boost
    hb   = _num(form, "hb")
    sp   = _num(form, "spo2")
    sg   = _num(form, "sugar")
    sys_ = _bp_sys(form)
    if hb   and hb < 7:     score += 40
    if sp   and sp < 88:    score += 50
    if sg   and sg > 400:   score += 40
    if sys_ and sys_ >= 180: score += 40

    score = min(round(score, 1), 200)

    if score > 80:   level = "CRITICAL"
    elif score > 40: level = "HIGH"
    elif score > 15: level = "MEDIUM"
    else:            level = "LOW"

    return {"score": score, "level": level}
