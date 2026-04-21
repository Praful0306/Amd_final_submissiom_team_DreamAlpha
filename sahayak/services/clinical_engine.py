"""
Sahayak AI - Clinical Reliability Engine

Replaces free-form LLM diagnosis with structured, ICMR/WHO-grounded
clinical interpretation. LLM only reads text - this module provides
all medical correctness.

Sections:
  1. ICMR/WHO Reference Ranges
  2. Value Normaliser
  3. Clinical Interpretation Engine
  4. Red Flag Detector
  5. Safe Clinical Summary Generator
  6. Safety Filter (removes hallucinated diagnoses)
  7. Risk Scorer (LOW / MEDIUM / HIGH / EMERGENCY)
"""
import re
import logging

logger = logging.getLogger("sahayak.clinical")

# =======================================================================
# 1. ICMR / WHO REFERENCE RANGES
#    Source: ICMR Standard Treatment Guidelines 2022 + WHO 2023
# =======================================================================
RANGES = {
    # Haemoglobin g/dL
    "hb_male"              : (13.0, 17.0),
    "hb_female"            : (12.0, 16.0),
    "hb_child"             : (11.0, 16.0),
    "hb_pregnant"          : (11.0, 16.0),
    # Blood glucose mg/dL
    "glucose_fasting"      : (70.0, 100.0),
    "glucose_random"       : (70.0, 140.0),
    "glucose_pp"           : (70.0, 140.0),    # post-prandial
    # Cholesterol mg/dL (ICMR 2022)
    "cholesterol_total"    : (0.0, 200.0),
    "ldl"                  : (0.0, 100.0),
    "hdl_male"             : (40.0, 60.0),
    "hdl_female"           : (50.0, 60.0),
    # Blood pressure mmHg (JNC-8 / AHA 2022)
    "bp_systolic"          : (90.0, 120.0),
    "bp_diastolic"         : (60.0,  80.0),
    # Heart rate BPM
    "heart_rate"           : (60.0, 100.0),
    # Temperature Celsius
    "temperature"          : (36.1,  37.2),
    # SpO2 %
    "spo2"                 : (95.0, 100.0),
    # Weight kg (broad adult range)
    "weight_adult"         : (35.0,  90.0),
    # Creatinine mg/dL
    "creatinine_male"      : (0.7,   1.3),
    "creatinine_female"    : (0.5,   1.1),
    # WBC cells/uL
    "wbc"                  : (4000.0, 10000.0),
    # Platelets /uL
    "platelets"            : (150000.0, 400000.0),
    # HbA1c %
    "hba1c"                : (4.0,   5.6),
}

# Critical thresholds - values beyond these = EMERGENCY regardless of risk score
CRITICAL_LOW = {
    "hb"         : 7.0,
    "sugar"      : 50.0,
    "spo2"       : 88.0,
    "platelets"  : 50000.0,
    "bp_sys"     : 80.0,
}
CRITICAL_HIGH = {
    "hb"         : 20.0,
    "sugar"      : 400.0,
    "temp"       : 40.0,
    "bp_sys"     : 180.0,
    "bp_dia"     : 120.0,
    "hr"         : 140.0,
    "creatinine" : 5.0,
    "wbc"        : 30000.0,
}

# =======================================================================
# 2. VALUE NORMALISER
#    Handles: "11.2 g/dL", "11,2", "~11", ">200", "148/92"
# =======================================================================
def normalize_value(raw) -> float or None:
    """Extract clean float from any messy value string."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() in ("null","none","-","n/a","na"):
        return None
    # Replace comma-decimal (European format)
    s = s.replace(",", ".")
    # Remove approximate markers
    s = s.replace("~", "").replace("approx", "").replace(">", "").replace("<", "")
    # Extract first number
    m = re.search(r"(\d+\.?\d*)", s)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None


def normalize_bp(raw) -> tuple or None:
    """Parse BP string '148/92' -> (148.0, 92.0)."""
    if not raw:
        return None
    m = re.search(r"(\d{2,3})\s*/\s*(\d{2,3})", str(raw))
    if m:
        try:
            return float(m.group(1)), float(m.group(2))
        except ValueError:
            return None
    return None


# =======================================================================
# 3. CLINICAL INTERPRETATION ENGINE
# =======================================================================
def interpret_value(field: str, value: float, gender: str = "male",
                    is_fasting: bool = True) -> str:
    """
    Return: 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high' | 'unknown'
    """
    if value is None:
        return "unknown"

    # Check critical thresholds first
    if field in CRITICAL_LOW and value < CRITICAL_LOW[field]:
        return "critical_low"
    if field in CRITICAL_HIGH and value > CRITICAL_HIGH[field]:
        return "critical_high"

    # Get reference range key
    key = _range_key(field, gender, is_fasting)
    if key not in RANGES:
        return "unknown"

    low, high = RANGES[key]
    if value < low:
        return "low"
    elif value > high:
        return "high"
    return "normal"


def interpret_bp(raw: str) -> dict:
    """Interpret blood pressure string, return dict with status."""
    bp = normalize_bp(raw)
    if not bp:
        return {"raw": raw, "status": "unknown"}
    sys_, dia_ = bp
    sys_status = interpret_value("bp_sys", sys_)
    dia_status = interpret_value("bp_dia", dia_)
    # JNC-8 BP classification
    if sys_ >= 180 or dia_ >= 120:
        label = "Hypertensive Crisis"
    elif sys_ >= 140 or dia_ >= 90:
        label = "Stage 2 Hypertension"
    elif sys_ >= 130 or dia_ >= 80:
        label = "Stage 1 Hypertension"
    elif sys_ >= 120:
        label = "Elevated"
    else:
        label = "Normal"
    # Worst status wins
    worst = "critical_high" if "critical" in (sys_status, dia_status) \
        else "high" if "high" in (sys_status, dia_status) \
        else "low" if "low" in (sys_status, dia_status) else "normal"
    return {
        "raw": raw, "systolic": sys_, "diastolic": dia_,
        "status": worst, "label": label,
        "systolic_status": sys_status, "diastolic_status": dia_status,
    }


def _range_key(field: str, gender: str, is_fasting: bool) -> str:
    """Map form field name -> RANGES key."""
    g = (gender or "male").lower()
    is_f = g in ("female", "f", "woman", "girl")
    mapping = {
        "hb"          : "hb_female" if is_f else "hb_male",
        "hemoglobin"  : "hb_female" if is_f else "hb_male",
        "sugar"       : "glucose_fasting" if is_fasting else "glucose_random",
        "glucose"     : "glucose_fasting" if is_fasting else "glucose_random",
        "cholesterol" : "cholesterol_total",
        "bp_sys"      : "bp_systolic",
        "bp_dia"      : "bp_diastolic",
        "hr"          : "heart_rate",
        "heart_rate"  : "heart_rate",
        "temp"        : "temperature",
        "temperature" : "temperature",
        "spo2"        : "spo2",
        "weight"      : "weight_adult",
        "creatinine"  : "creatinine_female" if is_f else "creatinine_male",
        "wbc"         : "wbc",
        "platelets"   : "platelets",
        "hba1c"       : "hba1c",
    }
    return mapping.get(field, field)


# =======================================================================
# 4. RED FLAG DETECTOR (ICMR emergency thresholds)
# =======================================================================
def detect_red_flags(form: dict, gender: str = "male") -> list:
    """
    Returns list of red flag strings - each is a specific clinical concern.
    Based on ICMR Standard Treatment Guidelines emergency criteria.
    """
    flags = []

    def _check(field, label, unit, critical_low=None, critical_high=None,
                warn_low=None, warn_high=None):
        val = normalize_value(form.get(field))
        if val is None:
            return
        if critical_low is not None and val < critical_low:
            flags.append(f"CRITICAL: {label} = {val} {unit} (< {critical_low} threshold - immediate care)")
        elif critical_high is not None and val > critical_high:
            flags.append(f"CRITICAL: {label} = {val} {unit} (> {critical_high} threshold - immediate care)")
        elif warn_low is not None and val < warn_low:
            flags.append(f"WARNING: {label} = {val} {unit} (below normal {warn_low})")
        elif warn_high is not None and val > warn_high:
            flags.append(f"WARNING: {label} = {val} {unit} (above normal {warn_high})")

    is_f = (gender or "male").lower() in ("female", "f", "woman")
    hb_low  = 7.0
    hb_warn = 12.0 if is_f else 13.0

    _check("hb",          "Haemoglobin",   "g/dL",   critical_low=hb_low,   warn_low=hb_warn)
    _check("sugar",       "Blood Sugar",   "mg/dL",  critical_low=50,  critical_high=400, warn_high=126)
    _check("spo2",        "SpO2",          "%",      critical_low=88,  warn_low=95)
    _check("temp",        "Temperature",   "C",      critical_high=40, warn_high=38.5)
    _check("hr",          "Heart Rate",    "BPM",    critical_low=40,  critical_high=140, warn_high=100)
    _check("cholesterol", "Cholesterol",   "mg/dL",  warn_high=200)

    # BP special case
    bp = normalize_bp(form.get("bp"))
    if bp:
        sys_, dia_ = bp
        if sys_ >= 180 or dia_ >= 120:
            flags.append(f"CRITICAL: Blood Pressure {form['bp']} - Hypertensive Crisis, immediate care")
        elif sys_ >= 140 or dia_ >= 90:
            flags.append(f"WARNING: Blood Pressure {form['bp']} - Stage 2 Hypertension")

    return flags


# =======================================================================
# 5. SAFE CLINICAL SUMMARY GENERATOR
#    No hallucination - everything grounded in actual values
# =======================================================================
def generate_clinical_summary(form: dict, gender: str = "male",
                                red_flags: list = None) -> str:
    """
    Generates structured clinical findings text from actual values only.
    Never invents diagnoses. Always includes safety disclaimer.
    """
    lines = ["CLINICAL FINDINGS (ICMR/WHO Reference Ranges):"]
    is_f  = (gender or "male").lower() in ("female", "f", "woman")
    found_any = False

    def _line(field, label, unit, range_key, decimals=0):
        nonlocal found_any
        val = normalize_value(form.get(field))
        if val is None:
            return
        status = interpret_value(field, val, gender)
        rng    = RANGES.get(range_key, None)
        rng_str = f"Normal: {rng[0]}-{rng[1]} {unit}" if rng else ""
        status_label = {
            "critical_low" : "CRITICAL LOW",
            "critical_high": "CRITICAL HIGH",
            "low"          : "LOW",
            "high"         : "HIGH",
            "normal"       : "Normal",
        }.get(status, "")
        fmt = f"{val:.{decimals}f}" if decimals else f"{val:g}"
        lines.append(f"- {label}: {fmt} {unit} - {status_label}. {rng_str}".strip())
        found_any = True

    _line("sugar",       "Blood Sugar",   "mg/dL", "glucose_fasting")
    _line("hb",          "Haemoglobin",   "g/dL",  "hb_female" if is_f else "hb_male", 1)
    _line("cholesterol", "Cholesterol",   "mg/dL", "cholesterol_total")
    _line("spo2",        "SpO2",          "%",     "spo2")
    _line("temp",        "Temperature",   "C",     "temperature", 1)
    _line("hr",          "Heart Rate",    "BPM",   "heart_rate")
    _line("weight",      "Weight",        "kg",    "weight_adult")

    # BP
    bp = normalize_bp(form.get("bp"))
    if bp:
        bp_info = interpret_bp(form["bp"])
        lines.append(
            f"- Blood Pressure: {form['bp']} mmHg - {bp_info['label']}. "
            f"Normal: < 120/80 mmHg"
        )
        found_any = True

    if not found_any:
        lines.append("- No vital signs recorded for this report.")

    # Symptoms + Diagnosis (from report - not invented)
    if form.get("symptoms"):
        lines.append(f"\nSYMPTOMS REPORTED: {form['symptoms']}")
    if form.get("diagnosis"):
        lines.append(f"DOCTOR'S DIAGNOSIS: {form['diagnosis']}")
    if form.get("medications"):
        lines.append(f"MEDICATIONS: {form['medications']}")

    # Red flags section
    if red_flags:
        lines.append("\nCLINICAL ALERTS:")
        for flag in red_flags:
            lines.append(f"  {flag}")

    # Recommendations based on risk
    risk = compute_risk_score(form, gender)
    lines.append(f"\nRISK LEVEL: {risk['level']}")
    lines.append("\nRECOMMENDATIONS (ICMR Standard Treatment Guidelines):")
    for rec in risk["recommendations"]:
        lines.append(f"- {rec}")

    lines.append(
        "\nIMPORTANT: This report is AI-assisted clinical support based on ICMR/WHO "
        "guidelines. It is NOT a diagnosis. Always consult a qualified doctor before "
        "making any medical decision."
    )

    return "\n".join(lines)


# =======================================================================
# 6. SAFETY FILTER
#    Strips any hallucinated diagnoses or dangerous advice from LLM output
# =======================================================================
BANNED_PHRASES = [
    "you have diabetes", "you have cancer", "you are dying",
    "take this medicine", "stop your medication", "do not see a doctor",
    "no need to see", "definitely diagnosed", "confirmed diagnosis of",
    "prescribed for you",
]

SAFE_REPLACEMENT = (
    "Please consult a qualified doctor for proper medical diagnosis and treatment."
)

def safe_output(text: str) -> str:
    """Remove dangerous AI phrases and replace with safe message."""
    if not text:
        return text
    t_lower = text.lower()
    for phrase in BANNED_PHRASES:
        if phrase in t_lower:
            logger.warning("Safety filter triggered: '%s' found in output", phrase)
            return SAFE_REPLACEMENT
    return text


# =======================================================================
# 7. RISK SCORER
#    Returns LOW / MEDIUM / HIGH / EMERGENCY with specific recommendations
# =======================================================================
def compute_risk_score(form: dict, gender: str = "male") -> dict:
    """
    Numeric risk scoring based on ICMR triage criteria.
    Returns risk level + specific actionable recommendations.
    """
    score = 0
    details = []

    def _add(pts, reason):
        nonlocal score
        score += pts
        if pts > 0:
            details.append(reason)

    is_f = (gender or "male").lower() in ("female", "f", "woman")

    # Blood pressure
    bp = normalize_bp(form.get("bp"))
    if bp:
        sys_, dia_ = bp
        if sys_ >= 180 or dia_ >= 120: _add(50, f"Hypertensive Crisis ({form['bp']})")
        elif sys_ >= 140 or dia_ >= 90: _add(25, f"Stage 2 Hypertension ({form['bp']})")
        elif sys_ >= 130:               _add(10, f"Stage 1 Hypertension ({form['bp']})")

    # Blood sugar
    s = normalize_value(form.get("sugar"))
    if s is not None:
        if s >= 400:   _add(50, f"Critically high blood sugar ({s} mg/dL)")
        elif s >= 200: _add(25, f"Diabetic range blood sugar ({s} mg/dL)")
        elif s >= 126: _add(12, f"Pre-diabetic blood sugar ({s} mg/dL)")
        elif s < 50:   _add(50, f"Critically low blood sugar ({s} mg/dL)")

    # Haemoglobin
    hb = normalize_value(form.get("hb"))
    if hb is not None:
        hb_low = 12.0 if is_f else 13.0
        if hb < 7.0:    _add(40, f"Severe anaemia (Hb {hb} g/dL)")
        elif hb < 10.0: _add(20, f"Moderate anaemia (Hb {hb} g/dL)")
        elif hb < hb_low: _add(10, f"Mild anaemia (Hb {hb} g/dL)")

    # SpO2
    sp = normalize_value(form.get("spo2"))
    if sp is not None:
        if sp < 88:   _add(50, f"Critical hypoxia (SpO2 {sp}%)")
        elif sp < 92: _add(30, f"Low SpO2 ({sp}%)")
        elif sp < 95: _add(15, f"Below-normal SpO2 ({sp}%)")

    # Temperature
    t = normalize_value(form.get("temp"))
    if t is not None:
        if t >= 40.0:   _add(25, f"High fever ({t}C)")
        elif t >= 38.5: _add(12, f"Fever ({t}C)")

    # Cholesterol
    ch = normalize_value(form.get("cholesterol"))
    if ch is not None:
        if ch >= 240: _add(15, f"High cholesterol ({ch} mg/dL)")
        elif ch >= 200: _add(8, f"Borderline cholesterol ({ch} mg/dL)")

    # Determine level
    if score >= 50:
        level = "EMERGENCY"
        recs  = [
            "Call 108 or go to nearest government hospital IMMEDIATELY.",
            "Do NOT delay - this is a life-threatening condition.",
            "Take all prescribed medications. Do not stop any medication.",
            "Inform family members or ASHA worker immediately.",
        ]
    elif score >= 25:
        level = "HIGH"
        recs  = [
            "Visit a doctor within 24 hours. Do not ignore these readings.",
            "Avoid strenuous physical activity until reviewed by a doctor.",
            "Continue all current medications without interruption.",
            "Monitor vitals every 6 hours if possible.",
            "If condition worsens, go to emergency immediately.",
        ]
    elif score >= 12:
        level = "MEDIUM"
        recs  = [
            "Schedule a doctor appointment within 1-2 weeks.",
            "Follow ICMR dietary guidelines: low salt, low sugar diet.",
            "Walk 30 minutes daily. Avoid smoking and alcohol.",
            "Monitor weight and BP weekly.",
            "Take prescribed medications regularly.",
        ]
    else:
        level = "LOW"
        recs  = [
            "Continue healthy lifestyle. Routine checkup in 3-6 months.",
            "Maintain balanced diet per ICMR Recommended Dietary Allowances.",
            "30 minutes of moderate exercise 5 days per week.",
            "Annual blood tests recommended.",
        ]

    return {
        "level"          : level,
        "score"          : score,
        "contributing"   : details,
        "recommendations": recs,
    }


# =======================================================================
# MASTER FUNCTION - run all steps, return complete clinical output
# =======================================================================
def full_clinical_analysis(form: dict, gender: str = "male",
                            llm_diagnosis: str = None) -> dict:
    """
    Runs the complete clinical pipeline on a mapped form.
    Returns everything the frontend and PDF report need.
    """
    gender = gender or "male"

    # Safe-filter any LLM-generated diagnosis
    safe_diag = safe_output(llm_diagnosis or form.get("diagnosis") or "")

    # Red flags
    red_flags = detect_red_flags(form, gender)

    # Risk score
    risk = compute_risk_score(form, gender)

    # Interpretation per field
    interpreted = {}
    for field in ("sugar","hb","cholesterol","spo2","temp","hr","weight"):
        val = normalize_value(form.get(field))
        if val is not None:
            interpreted[field] = {
                "value" : val,
                "status": interpret_value(field, val, gender),
            }
    if form.get("bp"):
        interpreted["bp"] = interpret_bp(form["bp"])

    # Clinical summary (no hallucination)
    summary = generate_clinical_summary(form, gender, red_flags)

    # Confidence
    public_fields = {k: v for k, v in form.items() if not k.startswith("_")}
    filled_count  = sum(1 for v in public_fields.values() if v)
    confidence    = round(filled_count / max(len(public_fields), 1) * 100, 1)

    logger.info(
        "Clinical analysis: risk=%s, red_flags=%d, confidence=%.0f%%",
        risk["level"], len(red_flags), confidence
    )

    return {
        "risk_level"     : risk["level"],
        "risk_score"     : risk["score"],
        "risk_details"   : risk["contributing"],
        "recommendations": risk["recommendations"],
        "interpreted"    : interpreted,
        "red_flags"      : red_flags,
        "clinical_summary": summary,
        "safe_diagnosis" : safe_diag,
        "confidence_pct" : confidence,
    }
