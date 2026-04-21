"""
Sahayak AI — Voice Form Filler Service
Converts natural Kannada/Hindi/English speech into structured patient
form fields using the existing call_llm() rotation chain.

Chain: LLaMA 70B → Mixtral 8x7B → Groq key-1 → Groq key-2
Never crashes — always returns a valid dict with fallback values.
"""
import json
import logging
import re

from services.bedrock_service import call_llm
from services.safety_guard import add_safety_layer

logger = logging.getLogger("sahayak.voice_form")

# ── Prompt ────────────────────────────────────────────────────────────────────
SYSTEM = """You are a medical transcription assistant for rural India.
Extract patient details from natural spoken speech (Kannada, Hindi, or English).
Return ONLY raw JSON. Zero explanation. Zero markdown. Zero backticks.

JSON schema:
{
  "patient_name": "string or null",
  "age": number or null,
  "gender": "male|female|other or null",
  "village": "string or null",
  "bp": "systolic/diastolic e.g. 140/90 or null",
  "sugar": "number mg/dL or null",
  "hb": "number g/dL or null",
  "temp": "number Celsius or null",
  "hr": "number BPM or null",
  "spo2": "number % or null",
  "symptoms": "clean English or Kannada symptom list or null",
  "diagnosis": "string or null",
  "medications": "string or null",
  "notes": "string or null"
}
Rules:
- If a field is not mentioned, use null.
- Convert Telugu/Hindi/Kannada numbers to digits.
- BP: extract as "systolic/diastolic" string.
- Return ONLY the JSON object, nothing else."""

USER_TEMPLATE = "Spoken text: {text}\n\nExtract patient fields as JSON:"


def _parse_llm_json(raw: str) -> dict:
    """Robust JSON parser for LLM output."""
    if not raw:
        return {}
    # Unescape markdown backslash-escaped underscores (LLM sometimes outputs patient\_name)
    clean = raw.replace('\\_', '_')
    # Strip markdown fences
    clean = re.sub(r"```(?:json)?", "", clean).strip().rstrip("`")
    try:
        return json.loads(clean)
    except Exception:
        # Try finding JSON object inside the text
        match = re.search(r"\{[\s\S]*\}", clean)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {}


async def fill_form_from_voice(transcribed_text: str) -> dict:
    """
    Main entry point. Takes transcribed speech text, returns structured
    patient form fields ready to fill into the frontend form.
    Always returns a valid dict — never raises.
    """
    if not transcribed_text or not transcribed_text.strip():
        return add_safety_layer({
            "success": False,
            "error": "No text provided",
            "form": {},
        })

    try:
        raw = call_llm(
            system_prompt=SYSTEM,
            user_prompt=USER_TEMPLATE.format(text=transcribed_text[:2000]),
            model="llama",
            max_tokens=600,
            temperature=0.0,   # deterministic — we want structured output
        )
        form = _parse_llm_json(raw)

        if not form:
            logger.warning("LLM returned empty JSON for voice form fill")
            return add_safety_layer({
                "success": False,
                "error": "Could not parse response. Please speak again clearly.",
                "form": {},
                "raw": raw[:200] if raw else "",
            })

        # Count how many fields were filled
        filled = sum(1 for v in form.values() if v is not None)
        logger.info("Voice form fill: %d fields extracted from speech", filled)

        return add_safety_layer({
            "success": True,
            "form": form,
            "fields_filled": filled,
            "filled_by_voice": True,
            "original_text": transcribed_text,
        })

    except Exception as exc:
        logger.error("Voice form fill failed: %s", exc)
        return add_safety_layer({
            "success": False,
            "error": "AI processing failed. Please try again or fill manually.",
            "form": {},
        })
