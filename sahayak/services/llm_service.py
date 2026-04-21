"""
Sahayak AI — LLM Logic and RAG Service logic.
This version restricts LLM to extraction and uses CLINICAL_ENGINE
for all medical reasoning and correctness.
FAISS RAG context is injected into the LLM prompt for ICMR grounding.
"""
import logging
import json
import re
from typing import Optional

from services.bedrock_service import call_llm
# rag_service imported lazily to avoid sentence_transformers loading at startup

logger = logging.getLogger("sahayak.llm")

# ── PROMPTS ──────────────────────────────────────────────────────────────────

# NOTE: {rag_context} is filled at call time — not a static string
DIAGNOSIS_SYSTEM_TEMPLATE = """You are Sahayak AI, an expert medical transcriptionist for Indian clinics.
Your ONLY job: convert raw medical text (symptoms + patient context) into a structured JSON
containing extraction data. You MUST NOT invent a diagnosis or a risk level.
{rag_context}
Return ONLY raw JSON with this exact structure:
{{
  "extracted_symptoms": "...",
  "disease_name": "Possible [Condition Name]",
  "confidence_pct": 75,
  "refer_to_hospital": true/false,
  "medications_suggested": ["...", "..."],
  "warning_signs": ["...", "..."],
  "sources": ["ICMR", "WHO"]
}}
STRICT: Return raw JSON only. Zero explanation. Zero markdown."""

DIAGNOSIS_USER_TEMPLATE = """SYMPTOMS: {symptoms}
CONTEXT: {context}
ADDITIONAL: {additional}

Extract symptoms and provide a suggested condition name based on symptoms alone."""

# ─────────────────────────────────────────────────────────────────────────────

def _get_rag_context(symptoms: str) -> str:
    """
    Query FAISS RAG for ICMR guidelines relevant to the symptoms.
    Returns a formatted string to inject into the system prompt.
    Falls back silently to empty string if RAG is unavailable.
    """
    try:
        from services.rag_service import query_rag
        results = query_rag(symptoms, top_k=3)
        if not results:
            return ""
        # results is a list of dicts: [{text, source, score}, ...]
        chunks = "\n".join(
            f"- {r['text']}" if isinstance(r, dict) else f"- {r}"
            for r in results[:3]
        )
        if not chunks:
            return ""
        return f"\nICMR GUIDELINE CONTEXT (use to inform extraction):\n{chunks}\n"
    except Exception as exc:
        logger.debug("RAG unavailable for diagnosis: %s", exc)
        return ""


async def generate_diagnosis(
    symptoms: str,
    patient_context: Optional[str] = None,
    vitals_context:  Optional[str] = None,
    additional_context: Optional[str] = None
) -> dict:
    """
    Main triage pipeline:
    1. Query FAISS RAG for ICMR context relevant to symptoms.
    2. Call LLaMA 70B (with RAG context) for text extraction and name suggestion.
    3. Call CLINICAL_ENGINE for grounded safety and risk assessment.
    4. Merge results for final response.
    """
    # Step 1: FAISS RAG — get ICMR guideline context for these symptoms
    rag_context = _get_rag_context(symptoms)
    if rag_context:
        logger.info("RAG context injected (%d chars)", len(rag_context))
    else:
        logger.debug("No RAG context — proceeding without ICMR guidelines")

    # Step 2: LLM Extraction (with RAG context injected into system prompt)
    system_prompt = DIAGNOSIS_SYSTEM_TEMPLATE.format(rag_context=rag_context)
    user_prompt = DIAGNOSIS_USER_TEMPLATE.format(
        symptoms=symptoms,
        context=patient_context or "No context provided",
        additional=additional_context or "None"
    )

    llm_raw = ""
    try:
        llm_raw = call_llm(system_prompt, user_prompt, model="llama", max_tokens=1000)
    except Exception as e:
        logger.error("All LLM backends failed: %s", e)
        # Fallback to a basic template if all LLMs are down
        llm_raw = (
            '{"extracted_symptoms": "' + symptoms.replace('"', "'") + '",'
            '"disease_name": "Clinical Evaluation Required", "confidence_pct": 50}'
        )

    # Parse LLM JSON
    llm_data = _parse_json(llm_raw)

    # Step 3: Clinical Grounding (The Reliability Layer)
    from .clinical_engine import full_clinical_analysis

    vitals_form = _parse_vitals_string(vitals_context)

    gender = "male"
    if patient_context and ("female" in patient_context.lower() or "woman" in patient_context.lower()):
        gender = "female"

    clinical = full_clinical_analysis(
        form=vitals_form,
        gender=gender,
        llm_diagnosis=llm_data.get("disease_name")
    )

    # Step 4: Final Merge — clinical engine overrides risk and summary completely
    result = {
        "risk_level"           : clinical["risk_level"],
        "disease_name"         : clinical["safe_diagnosis"],
        "confidence_pct"       : clinical["confidence_pct"],
        "clinical_summary"     : clinical["clinical_summary"],
        "recommendations"      : clinical["recommendations"],
        "red_flags"            : clinical["red_flags"],
        "interpreted_vitals"   : clinical["interpreted"],
        "refer_to_hospital"    : (clinical["risk_level"] in ("HIGH", "EMERGENCY")),
        "medications_suggested": llm_data.get("medications_suggested", []),
        "warning_signs"        : clinical["red_flags"] + llm_data.get("warning_signs", []),
        "followup_days"        : 1 if clinical["risk_level"] == "HIGH" else 7,
        "sources"              : [
            "ICMR Standard Treatment Guidelines 2022",
            "WHO Clinical Protocols 2023",
            *(["FAISS RAG (local)"] if rag_context else []),
        ],
    }

    return result


def _parse_json(raw: str) -> dict:
    """Robust JSON parsing for LLM outputs."""
    if not raw:
        return {}
    clean = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
    try:
        return json.loads(clean)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", clean)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {}


def _parse_vitals_string(vitals_str: str) -> dict:
    """
    Parses "BP: 148/92, Sugar: 186 mg/dL" into a form dict.
    Handles None input safely.
    """
    form = {}
    if not vitals_str:
        return form

    vitals_str = vitals_str.lower()

    patterns = {
        "bp":     r"bp[:\s]*(\d{2,3}/\d{2,3})",
        "sugar":  r"sugar[:\s]*(\d{2,3})",
        "hb":     r"hb[:\s]*(\d{1,2}(?:\.\d)?)",
        "temp":   r"temp[:\s]*(\d{2,3}(?:\.\d)?)",
        "hr":     r"(?:hr|heart rate)[:\s]*(\d{2,3})",
        "spo2":   r"spo2[:\s]*(\d{2,3})",
        "weight": r"weight[:\s]*(\d{2,3}(?:\.\d)?)",
    }

    for k, p in patterns.items():
        m = re.search(p, vitals_str)
        if m:
            form[k] = m.group(1).strip()

    return form


def format_vitals_string(form: dict) -> str:
    """Converts a form dict back for LLM readability if needed."""
    parts = []
    if form.get("bp"):    parts.append(f"BP: {form['bp']}")
    if form.get("sugar"): parts.append(f"Sugar: {form['sugar']} mg/dL")
    if form.get("hb"):    parts.append(f"Hb: {form['hb']} g/dL")
    if form.get("spo2"):  parts.append(f"SpO2: {form['spo2']}%")
    if form.get("hr"):    parts.append(f"HR: {form['hr']} BPM")
    return ", ".join(parts)
