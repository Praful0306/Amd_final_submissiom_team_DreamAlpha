"""
Sahayak AI — Gemini PDF Extraction Service
Priority: Gemini 2.5 Flash reads PDF natively and fills ALL fields.
Fallback: OCR+LLM pipeline in diagnose.py if Gemini fails.
"""
import base64
import json
import logging
import os
import re
import time
from datetime import date
from threading import Lock
from typing import Optional

from dotenv import load_dotenv
load_dotenv(override=True)

logger = logging.getLogger("sahayak.gemini")

# ── Prompt — forces Gemini to fill every single field ────────────────────────
GEMINI_SYSTEM_PROMPT = """Extract every piece of medical data from this PDF report.

Return ONLY a JSON object. No explanation. No markdown. No text before or after the JSON.

You MUST extract ALL of these fields — do not skip any section:

{
  "patient_info": {
    "name": "full patient name",
    "age": "age as written",
    "gender": "Male or Female",
    "id": "patient ID number"
  },
  "report_meta": {
    "date": "date of report",
    "report_type": "type of report e.g. Blood Test",
    "hospital": "hospital or clinic name",
    "doctor": "doctor name",
    "lab_name": "lab name if different from hospital"
  },
  "vitals": {
    "bp": "blood pressure value",
    "hr": "heart rate value",
    "temp": "temperature value",
    "spo2": "oxygen saturation value",
    "weight": "weight value",
    "height": "height value"
  },
  "lab_tests": [
    {
      "test_name": "exact test name from report",
      "value": "numeric value with unit",
      "reference_range": "reference range",
      "flag": "HIGH or LOW or Normal"
    }
  ],
  "clinical": {
    "symptoms": "all symptoms listed verbatim",
    "diagnosis": "full diagnosis text verbatim",
    "medications": "all medications listed verbatim",
    "notes": "doctor notes and advice verbatim",
    "follow_up": "follow up date or instructions"
  },
  "derived": {
    "sugar": "blood sugar / glucose value with unit",
    "hb": "haemoglobin value with unit",
    "cholesterol": "total cholesterol value with unit",
    "creatinine": "creatinine value with unit",
    "urea": "urea or BUN value with unit"
  }
}

Use null for any field truly not present. Copy text exactly as written in the report."""


# ── Per-key rate limit tracker ────────────────────────────────────────────────
class KeyTracker:
    RPM_LIMIT = 5
    RPD_LIMIT = 20

    def __init__(self, api_key: str, label: str):
        self.api_key     = api_key
        self.label       = label
        self._lock       = Lock()
        self._rpm_times: list[float] = []
        self._rpd_date:  date        = date.today()
        self._rpd_count: int         = 0

    def _reset_day_if_needed(self):
        today = date.today()
        if today != self._rpd_date:
            self._rpd_date  = today
            self._rpd_count = 0

    def can_use(self) -> tuple[bool, str]:
        with self._lock:
            self._reset_day_if_needed()
            if self._rpd_count >= self.RPD_LIMIT:
                return False, f"{self.label}: daily limit reached ({self.RPD_LIMIT} RPD)"
            now = time.time()
            self._rpm_times = [t for t in self._rpm_times if now - t < 60]
            if len(self._rpm_times) >= self.RPM_LIMIT:
                wait = int(60 - (now - self._rpm_times[0])) + 1
                return False, f"{self.label}: RPM limit — retry in {wait}s"
            return True, ""

    def consume(self):
        with self._lock:
            self._reset_day_if_needed()
            self._rpm_times.append(time.time())
            self._rpd_count += 1
            logger.info(f"{self.label}: {self._rpd_count}/{self.RPD_LIMIT} RPD, "
                        f"{len(self._rpm_times)}/{self.RPM_LIMIT} RPM")

    def status(self) -> dict:
        with self._lock:
            self._reset_day_if_needed()
            rpm_used = len([t for t in self._rpm_times if time.time() - t < 60])
            return {
                "label":     self.label,
                "rpd_used":  self._rpd_count,
                "rpd_limit": self.RPD_LIMIT,
                "rpm_used":  rpm_used,
                "rpm_limit": self.RPM_LIMIT,
                "available": self._rpd_count < self.RPD_LIMIT and rpm_used < self.RPM_LIMIT,
            }


# ── Key pool ──────────────────────────────────────────────────────────────────
_KEY_POOL:    list[KeyTracker] = []
_POOL_LOADED: bool             = False

def _build_key_pool() -> list[KeyTracker]:
    pool = []
    for i in range(1, 6):
        key = os.getenv(f"GEMINI_API_KEY_{i}", "").strip()
        if key:
            pool.append(KeyTracker(key, f"Gemini-key-{i}"))
    if not pool:
        logger.warning("No GEMINI_API_KEY_* in .env — Gemini disabled")
    else:
        logger.info(f"Gemini key pool: {len(pool)} key(s) ready")
    return pool

def _get_pool() -> list[KeyTracker]:
    global _KEY_POOL, _POOL_LOADED
    if not _POOL_LOADED:
        _KEY_POOL    = _build_key_pool()
        _POOL_LOADED = True
    return _KEY_POOL

def _pick_key() -> Optional[KeyTracker]:
    for tracker in _get_pool():
        allowed, reason = tracker.can_use()
        if allowed:
            return tracker
        logger.debug(f"Skipping {tracker.label}: {reason}")
    return None


# ── Core Gemini API call ──────────────────────────────────────────────────────
def _call_gemini(pdf_bytes: bytes, tracker: KeyTracker) -> str:
    import urllib.request

    model   = "gemini-2.5-flash"
    api_url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={tracker.api_key}"
    )

    body = {
        "system_instruction": {
            "parts": [{"text": (
                "You are a medical data extractor. "
                "Output ONLY raw JSON. Never add any text, explanation or markdown outside the JSON."
            )}]
        },
        "contents": [{
            "role": "user",
            "parts": [
                {"inline_data": {
                    "mime_type": "application/pdf",
                    "data": base64.b64encode(pdf_bytes).decode("utf-8")
                }},
                {"text": GEMINI_SYSTEM_PROMPT}
            ]
        }],
        "generationConfig": {
            "temperature":      0.0,
            "maxOutputTokens":  4096,
            "responseMimeType": "application/json",
        }
    }

    req = urllib.request.Request(
        api_url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    tracker.consume()

    with urllib.request.urlopen(req, timeout=45) as resp:
        result = json.loads(resp.read().decode("utf-8"))

    candidates = result.get("candidates", [])
    if not candidates:
        raise ValueError("Gemini returned no candidates")

    parts = candidates[0].get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts).strip()


# ── Public API ────────────────────────────────────────────────────────────────
def extract_with_gemini(pdf_bytes: bytes, filename: str = "report.pdf") -> dict:
    """
    Send PDF to Gemini 2.5 Flash. Returns full structured data.
    {"success": True,  "data": {...}, "source": "Gemini-key-N"}
    {"success": False, "error": "...", "data": {}}
    """
    tracker = _pick_key()
    if tracker is None:
        return {
            "success": False,
            "error":   "All Gemini keys exhausted for today — falling back to OCR+LLM.",
            "data":    {},
            "key_status": [t.status() for t in _get_pool()],
        }
    try:
        logger.info(f"Sending {filename} ({len(pdf_bytes)} bytes) → {tracker.label}")
        raw  = _call_gemini(pdf_bytes, tracker)
        data = _parse_gemini_json(raw)
        if not data:
            logger.error(f"Gemini parse failed. Raw[:400]:\n{raw[:400]}")
            return {"success": False, "error": "Gemini returned unparseable JSON", "data": {}}
        logger.info(f"Gemini extraction succeeded via {tracker.label}")
        return {"success": True, "data": data, "source": tracker.label}
    except Exception as e:
        logger.error(f"Gemini call failed ({tracker.label}): {e}")
        return {"success": False, "error": str(e), "data": {}}


def gemini_key_status() -> list[dict]:
    return [t.status() for t in _get_pool()]


# ── JSON parser — handles all Gemini response quirks ─────────────────────────
def _parse_gemini_json(raw: str) -> dict:
    if not raw:
        return {}
    clean = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    # Direct parse
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        pass
    # Find outermost { }
    start = clean.find("{")
    end   = clean.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(clean[start:end+1])
        except json.JSONDecodeError:
            pass
    # Fix trailing commas and single quotes
    try:
        fixed = re.sub(r",\s*([}\]])", r"\1", clean[start:end+1] if start != -1 else clean)
        fixed = re.sub(r"'([^']*)'", r'"\1"', fixed)
        return json.loads(fixed)
    except Exception:
        pass
    return {}


# ── Map Gemini JSON → flat form dict (handles nested AND flat responses) ──────
def map_gemini_to_form(gemini_data: dict) -> dict:
    if not gemini_data:
        return {}

    nested_keys = {"patient_info", "report_meta", "vitals", "lab_tests", "clinical", "derived"}
    is_nested   = bool(nested_keys & set(gemini_data.keys()))

    def _get(path, default=None):
        val = gemini_data
        for key in path:
            if isinstance(val, dict):
                val = val.get(key)
            else:
                return default
        return val if val and str(val).lower() not in ("null", "none", "") else default

    def _flat(*keys):
        for k in keys:
            v = gemini_data.get(k)
            if v and str(v).lower() not in ("null", "none", ""):
                return str(v).strip()
        return None

    form = {}

    if is_nested:
        form["patient_name"] = _get(["patient_info", "name"])
        form["age"]          = _get(["patient_info", "age"])
        form["gender"]       = _get(["patient_info", "gender"])
        form["date"]         = _get(["report_meta", "date"])
        form["hospital"]     = _get(["report_meta", "hospital"]) or _get(["report_meta", "lab_name"])
        form["doctor"]       = _get(["report_meta", "doctor"])
        form["report_type"]  = _get(["report_meta", "report_type"])
        form["bp"]           = _get(["vitals", "bp"])
        form["hr"]           = _get(["vitals", "hr"])
        form["temp"]         = _get(["vitals", "temp"])
        form["spo2"]         = _get(["vitals", "spo2"])
        form["weight"]       = _get(["vitals", "weight"])
        form["sugar"]        = _get(["derived", "sugar"])
        form["hb"]           = _get(["derived", "hb"])
        form["cholesterol"]  = _get(["derived", "cholesterol"])
        form["symptoms"]     = _get(["clinical", "symptoms"])
        form["diagnosis"]    = _get(["clinical", "diagnosis"])
        form["medications"]  = _get(["clinical", "medications"])
        form["notes"]        = _get(["clinical", "notes"])

        # Pull sugar/hb/cholesterol from lab_tests if missing from derived
        for test in (gemini_data.get("lab_tests") or []):
            name  = (test.get("test_name") or "").lower()
            value = test.get("value")
            if not value:
                continue
            if not form.get("sugar") and any(k in name for k in ("glucose","sugar","fbs","rbs","ppbs")):
                form["sugar"] = value
            if not form.get("hb") and any(k in name for k in ("haemoglobin","hemoglobin","hgb","hb")):
                form["hb"] = value
            if not form.get("cholesterol") and "cholesterol" in name:
                form["cholesterol"] = value
    else:
        # Flat response — Gemini returned top-level keys directly
        form["patient_name"] = _flat("name", "patient_name", "patient")
        form["age"]          = _flat("age")
        form["gender"]       = _flat("gender")
        form["date"]         = _flat("date", "report_date", "date_of_report")
        form["hospital"]     = _flat("hospital", "hospital_clinic", "clinic", "lab_name")
        form["doctor"]       = _flat("doctor", "doctor_name", "referring_doctor")
        form["report_type"]  = _flat("report_type", "type")
        form["bp"]           = _flat("bp", "blood_pressure")
        form["hr"]           = _flat("hr", "heart_rate", "pulse")
        form["temp"]         = _flat("temp", "temperature")
        form["spo2"]         = _flat("spo2", "oxygen_saturation")
        form["weight"]       = _flat("weight", "wt")
        form["sugar"]        = _flat("sugar", "blood_sugar", "glucose", "fbs", "rbs")
        form["hb"]           = _flat("hb", "haemoglobin", "hemoglobin", "hgb")
        form["cholesterol"]  = _flat("cholesterol", "total_cholesterol")
        form["symptoms"]     = _flat("symptoms", "presenting_symptoms", "complaints")
        form["diagnosis"]    = _flat("diagnosis", "impression", "assessment")
        form["medications"]  = _flat("medications", "medications_prescribed", "prescription")
        form["notes"]        = _flat("notes", "doctor_notes", "advice")

    return {k: v for k, v in form.items() if v}
