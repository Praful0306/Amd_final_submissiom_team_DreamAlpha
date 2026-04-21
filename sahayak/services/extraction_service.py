"""
Sahayak AI — Extraction Service
Parses medical text into structured form data.
"""
import json
import logging
import re
import boto3

logger = logging.getLogger("sahayak.extraction")

# ── Extraction Prompt ─────────────────────────────────────────────────────────
EXTRACTION_SYSTEM = """You are a medical document parser for Indian hospitals and labs.
Your ONLY job: extract ALL medical information from the text and return it as JSON.

STRICT RULES:
1. Return ONLY raw JSON — zero explanation, zero markdown, zero ```json fences
2. Every field present in JSON — null if not found
3. Keep numeric values as strings with their units (e.g. "7.4 g/dL", "158/102 mmHg")
4. In table-format reports the value is often on the NEXT LINE after the label — read carefully
5. Put ALL lab test results (haemoglobin, blood sugar, creatinine, platelets, etc.) in lab_tests array

RETURN THIS EXACT STRUCTURE:
{
  "patient_info": { "name": null, "age": null, "gender": null },
  "report_meta": { "date": null, "report_type": null, "hospital": null, "doctor": null },
  "vitals": { "bp": null, "hr": null, "temp": null, "spo2": null, "weight": null },
  "lab_tests": [ { "test_name": "Haemoglobin", "value": "7.4 g/dL" }, { "test_name": "Blood Sugar Fasting", "value": "142 mg/dL" } ],
  "clinical": { "symptoms": null, "diagnosis": null, "medications": null, "notes": null }
}"""

EXTRACTION_USER_TEMPLATE = """Extract ALL medical data from this Indian patient report.
REPORT TEXT:
{text}"""

# ── 1. Language Normalization ─────────────────────────────────────────────────
LANGUAGE_MAP = {
    "bukhar": "fever", "sugar jaada": "high blood sugar", "sugar kam": "low blood sugar",
    "sardi": "cold", "khansi": "cough", "badan dard": "body ache", "sar dard": "headache",
    "pet dard": "stomach ache", "kam": "low", "jaada": "high", "jyada": "high",
    "adhik": "high", "ghat": "low", "kamzori": "weakness", "thakan": "fatigue"
}

def normalise_language(text: str) -> str:
    if not text: return ""
    processed = text.lower()
    for k, v in LANGUAGE_MAP.items():
        processed = processed.replace(k, v)
    return processed

# ── 2. AWS Translation ────────────────────────────────────────────────────────
def translate_with_aws(text: str) -> str:
    non_ascii = len([c for c in text if ord(c) > 127])
    if non_ascii / max(len(text), 1) < 0.1:
        return text
    try:
        translate = boto3.client('translate', region_name='us-east-1')
        result = translate.translate_text(
            Text=text, SourceLanguageCode="auto", TargetLanguageCode="en"
        )
        return result.get('TranslatedText', text)
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        return text

# ── 3. Regex Fallback ─────────────────────────────────────────────────────────
def extract_with_regex(text: str) -> dict:
    data = {}
    # re.DOTALL not used here — we use [\s\S]{0,30} to allow newlines between label and value
    patterns = {
        # BP: handle "158/102" or "158/\n102" or "Blood Pressure\n158/102"
        "bp":          r"(?:bp|blood pressure)[^\d]{0,40}(\d{2,3}/\d{2,3})",
        # Sugar: handles "Blood Sugar (Fasting)\n142\nmg/dL"
        "sugar":       r"(?:blood sugar|glucose|fbs|rbs|sugar)[^\d]{0,40}(\d{2,3}(?:\.\d)?)",
        # Hb: handles "Haemoglobin (Hb)\n7.4\ng/dL" — require decimal or 2-digit to avoid "1"
        "hb":          r"(?:haemoglobin|hemoglobin|hgb)\b[^\d]{0,40}(\d{1,2}\.\d+|\d{2}(?:\.\d+)?)",
        "temp":        r"(?:temp|temperature|body temp)[^\d]{0,40}(\d{2,3}(?:\.\d+)?)",
        "hr":          r"(?:hr|heart rate|pulse)[^\d]{0,30}(\d{2,3})",
        "spo2":        r"(?:spo2|oxygen saturation|o2 sat|spO2)[^\d]{0,30}(\d{2,3})",
        "weight":      r"(?:weight|wt)[^\d]{0,20}(\d{2,3}(?:\.\d+)?)",
        "cholesterol": r"(?:cholesterol|total chol|tc)[^\d]{0,30}(\d{2,3})",
        "creatinine":  r"(?:creatinine|serum creatinine|s\.?\s*creatinine)[^\d]{0,30}(\d{1,2}(?:\.\d+)?)",
        "platelet":    r"(?:platelet|plt)[^\d]{0,30}(\d{4,6})",
        "date":        r"(?:date|reported on)[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        "doctor":      r"(?:dr\.|doctor|physician)[:\s]*([a-zA-Z.\s]{3,25})",
        "hospital":    r"(?:hospital|clinic|center|centre)[:\s]*([a-zA-Z\s]{3,35})",
    }
    for field, pat in patterns.items():
        match = re.search(pat, text, re.I | re.DOTALL)
        if match:
            val = match.group(1).strip()
            if field in ("doctor", "hospital"):
                val = val.split('\n')[0].strip()
            data[field] = val
    return data

# ── 4. Safe numeric conversion ────────────────────────────────────────────────
def _to_float(val) -> float | None:
    """Safely convert '186 mg/dL', '11.2 g/dL', or '186' to float."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        match = re.search(r"\d+(?:\.\d+)?", str(val))
        if match:
            try:
                return float(match.group())
            except ValueError:
                pass
    return None

# ── 5. Vital Interpretation ───────────────────────────────────────────────────
def interpret_vitals(form: dict, gender: str = "male") -> dict:
    """
    Interprets vitals and annotates the form dict IN-PLACE.
    Stores results under _private keys so validate_form ignores them.
    Returns the SAME form dict (not a separate analysis dict).
    """
    red_flags = []
    interpretation = {}

    # Blood Pressure
    bp = form.get("bp")
    if bp and "/" in str(bp):
        try:
            nums = re.findall(r"\d+", str(bp))
            if len(nums) >= 2:
                sys_bp, dia_bp = int(nums[0]), int(nums[1])
                if sys_bp >= 180 or dia_bp >= 120:
                    tag = "CRITICAL"
                    red_flags.append(f"Blood Pressure: {bp} (CRITICAL - Hypertensive Crisis)")
                elif sys_bp >= 140 or dia_bp >= 90:
                    tag = "HIGH"
                    red_flags.append(f"Blood Pressure: {bp} (HIGH - normal <120/80)")
                elif sys_bp < 90 or dia_bp < 60:
                    tag = "LOW"
                    red_flags.append(f"Blood Pressure: {bp} (LOW)")
                else:
                    tag = "NORMAL"
                interpretation["bp"] = tag
        except Exception:
            pass

    # Blood Sugar — safely handles "186 mg/dL" strings
    sugar_val = _to_float(form.get("sugar"))
    if sugar_val is not None:
        if sugar_val >= 200:
            tag = "CRITICAL"
            red_flags.append(f"Blood Sugar: {sugar_val} mg/dL (CRITICAL - Diabetic Range)")
        elif sugar_val > 140:
            tag = "HIGH"
            red_flags.append(f"Blood Sugar: {sugar_val} mg/dL (HIGH - normal <140)")
        elif sugar_val < 70:
            tag = "LOW"
            red_flags.append(f"Blood Sugar: {sugar_val} mg/dL (LOW)")
        else:
            tag = "NORMAL"
        interpretation["sugar"] = tag

    # Haemoglobin — safely handles "11.2 g/dL" strings
    hb_val = _to_float(form.get("hb"))
    if hb_val is not None:
        if hb_val < 7:
            tag = "CRITICAL"
            red_flags.append(f"Haemoglobin: {hb_val} g/dL (CRITICAL - Severe Anaemia)")
        elif hb_val < 11:
            tag = "LOW"
            red_flags.append(f"Haemoglobin: {hb_val} g/dL (LOW - normal >12)")
        else:
            tag = "NORMAL"
        interpretation["hb"] = tag

    # Store under _private keys — these are ignored by validate_form's field count
    form["_interpretation"]    = interpretation
    form["_red_flags"]         = red_flags
    form["_abnormal_count"]    = len(red_flags)
    form["_abnormal_findings"] = red_flags

    return form  # ← returns the FORM dict (annotated), NOT a separate analysis dict

# ── 6. Mapping ────────────────────────────────────────────────────────────────
def map_to_form(llm_data: dict) -> dict:
    """Map LLM nested JSON -> flat form fields. Also parses lab_tests array."""
    form = {}

    def _get(path, default=None):
        val = llm_data
        for p in path:
            if isinstance(val, dict):
                val = val.get(p)
            else:
                return default
        return val if val and str(val).lower() not in ("null", "none", "") else default

    form["date"]        = _get(["report_meta", "date"])
    form["hospital"]    = _get(["report_meta", "hospital"])
    form["doctor"]      = _get(["report_meta", "doctor"])
    form["report_type"] = _get(["report_meta", "report_type"])
    form["bp"]          = _get(["vitals", "bp"])
    form["hr"]          = _get(["vitals", "hr"])
    form["temp"]        = _get(["vitals", "temp"])
    form["spo2"]        = _get(["vitals", "spo2"])
    form["weight"]      = _get(["vitals", "weight"])
    form["sugar"]       = _get(["vitals", "sugar"])
    form["hb"]          = _get(["vitals", "hb"])
    form["cholesterol"] = _get(["vitals", "cholesterol"])
    form["symptoms"]    = _get(["clinical", "symptoms"])
    form["diagnosis"]   = _get(["clinical", "diagnosis"])
    form["medications"] = _get(["clinical", "medications"])
    form["notes"]       = _get(["clinical", "notes"])

    # ── Parse lab_tests array (LLM puts hemoglobin, blood sugar, etc. here) ──
    lab_tests = llm_data.get("lab_tests", []) or []
    # Map common test names → form field names
    LAB_MAP = {
        # Haemoglobin / Hemoglobin (incl. parenthetical variants like "Haemoglobin (Hb)")
        "haemoglobin": "hb", "hemoglobin": "hb", "hb": "hb", "hgb": "hb",
        "haemoglobin (hb)": "hb", "hemoglobin (hb)": "hb",
        # Blood Sugar (incl. parenthetical variants)
        "blood sugar fasting": "sugar", "fasting blood sugar": "sugar",
        "blood sugar (fasting)": "sugar", "fasting blood glucose": "sugar",
        "fbs": "sugar", "fasting glucose": "sugar", "glucose fasting": "sugar",
        "blood sugar": "sugar", "glucose": "sugar", "rbs": "sugar",
        "blood sugar pp": "sugar_pp", "blood sugar (pp)": "sugar_pp",
        "blood sugar ogtt 2hr": "sugar_pp", "ogtt 2hr": "sugar_pp",
        "pp glucose": "sugar_pp", "post prandial": "sugar_pp",
        # Cholesterol
        "cholesterol": "cholesterol", "total cholesterol": "cholesterol", "tc": "cholesterol",
        # Creatinine
        "creatinine": "creatinine", "s. creatinine": "creatinine",
        "serum creatinine": "creatinine",
        # Urea
        "urea": "urea", "blood urea": "urea", "bun": "urea",
        # Platelets
        "platelet": "platelet", "platelets": "platelet", "plt": "platelet",
        "platelet count": "platelet",
        # WBC
        "wbc": "wbc", "white blood cell": "wbc", "total wbc": "wbc",
        "white blood cells": "wbc",
        # SpO2
        "spo2": "spo2", "oxygen saturation": "spo2", "spO2": "spo2",
        "spo2 (oxygen saturation)": "spo2",
        # Heart rate
        "heart rate": "hr", "pulse": "hr", "pulse rate": "hr",
        # Uric acid
        "uric acid": "uric_acid", "s. uric acid": "uric_acid",
    }
    for lab in lab_tests:
        if not isinstance(lab, dict):
            continue
        name_raw = str(lab.get("test_name") or lab.get("name") or "").lower().strip()
        value    = lab.get("value") or lab.get("result")
        if not name_raw or value is None:
            continue
        # Try exact match first, then partial match
        field = LAB_MAP.get(name_raw)
        if not field:
            for key, mapped in LAB_MAP.items():
                if key in name_raw or name_raw in key:
                    field = mapped
                    break
        if field and not form.get(field):
            # Strip units from value: "9.8 g/dL" → "9.8"
            clean = re.sub(r"[a-zA-Z/%\s]", "", str(value)).strip(" .")
            form[field] = clean if clean else value

    return form


def merge_results(llm_form: dict, regex_data: dict) -> dict:
    """Merge LLM and Regex results. LLM wins, Regex fills nulls."""
    merged = llm_form.copy()
    for k, v in regex_data.items():
        if not merged.get(k):
            merged[k] = v
    return merged


def validate_form(form: dict) -> dict:
    """Calculate completion and track missing core fields. Ignores _private keys."""
    core    = ["date", "hospital", "doctor", "bp", "symptoms", "diagnosis"]
    public  = {k: v for k, v in form.items() if not k.startswith("_")}
    filled  = {k: v for k, v in public.items() if v and str(v).lower() not in ("null", "none", "")}
    missing = [k for k in core if not public.get(k)]
    total   = 17
    pct     = int(len(filled) / total * 100) if total > 0 else 0

    return {
        "form":           form,
        "filled_count":   len(filled),
        "total_fields":   total,
        "completion_pct": min(pct, 100),
        "missing_core":   missing,
    }


def parse_llm_json(raw: str) -> dict:
    if not raw:
        return {}
    text = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {}
