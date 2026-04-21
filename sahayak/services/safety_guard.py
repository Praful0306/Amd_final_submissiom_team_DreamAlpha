"""
Sahayak AI — Safety Guard
Adds mandatory SAHI-compliant disclaimer to every AI output.

SAHI 2026 requires: physician oversight, explainability, and
"augmentation not replacement" language on all AI suggestions.
"""
import logging
from datetime import datetime

logger = logging.getLogger("sahayak.safety")

DISCLAIMER_KN = (
    "ಇದು AI ಸಹಾಯಕ ಮಾತ್ರ. "
    "ಡಾಕ್ಟರ್ ಅವರ ಅಂತಿಮ ತೀರ್ಮಾನ ಅಗತ್ಯ."
)
DISCLAIMER_EN = (
    "AI-assisted suggestion only. "
    "Final clinical decision must be made by a qualified doctor."
)


def add_safety_layer(result: dict) -> dict:
    """
    Adds mandatory safety fields to any AI response dict.
    Safe to call even if result already has these keys.
    Never raises — always returns a valid dict.
    """
    if not isinstance(result, dict):
        result = {"raw": str(result)}

    result.setdefault("disclaimer", DISCLAIMER_KN)
    result.setdefault("disclaimer_en", DISCLAIMER_EN)
    result.setdefault("timestamp", datetime.now().isoformat())
    result.setdefault("requires_doctor_review", True)

    # Source attribution for SAHI explainability requirement
    if "diagnosis" in result or "disease_name" in result:
        result.setdefault("source", "ICMR RAG (FAISS) + Clinical Engine")

    return result
