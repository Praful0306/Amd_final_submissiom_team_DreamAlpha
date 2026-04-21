"""
Sahayak AI — VAPI Agent Service (Production v2)
3 agents: ASHA Worker, Patient, Doctor
Each agent fetches live context from backend before first message.
System prompts grounded in real user data — not generic.
"""
import os
import logging
from typing import Optional

logger = logging.getLogger("sahayak.vapi")

BACKEND_URL = os.getenv("BACKEND_PUBLIC_URL", "http://localhost:8000")

# ── SHARED SAFETY FOOTER ──────────────────────────────────────────────────────
SAFETY_FOOTER = """
IMPORTANT RULES (always follow):
- You are AI-assisted, NOT a replacement for a doctor.
- End every medical answer with: "Please confirm with your doctor or ASHA worker."
- For EMERGENCY symptoms (chest pain, unconsciousness, severe bleeding): say "Call 108 immediately."
- Never claim to diagnose definitively — say "possible" or "suspected."
- Speak in the user's language. If they speak Kannada, reply in Kannada.
"""

# ── TOOL: fetch live user data before answering ───────────────────────────────
def _tool(name: str, desc: str, props: dict, required: list = []) -> dict:
    return {
        "type": "function",
        "function": {"name": name, "description": desc,
                     "parameters": {"type": "object", "properties": props, "required": required}},
        "server": {"url": f"{BACKEND_URL}/vapi/tool-call"},
    }

TOOL_PATIENT_DATA = _tool(
    "get_my_health_data",
    "Get this patient's latest health data: vitals, medications, diagnoses, risk level, and recent reports.",
    {"patient_id": {"type": "string", "description": "The patient's ID from their profile"}}
)
TOOL_DRUG_INFO = _tool(
    "get_drug_info",
    "Get dosing, side effects, timing, food interactions for a medicine.",
    {"drug": {"type": "string"}, "patient_type": {"type": "string", "default": "adult"}},
    required=["drug"]
)
TOOL_DISEASE_PROTOCOL = _tool(
    "get_disease_protocol",
    "Get ICMR treatment protocol and warning signs for a disease.",
    {"disease": {"type": "string"}}, required=["disease"]
)
TOOL_DOCTOR_PATIENTS = _tool(
    "get_my_patients",
    "Get the doctor's current patient list with risk levels and last visit dates.",
    {"doctor_id": {"type": "string"}}
)
TOOL_BOOK_APPT = _tool(
    "book_appointment",
    "Book an appointment for a patient with this doctor.",
    {
        "doctor_id":     {"type": "integer", "description": "Doctor's ID"},
        "date":          {"type": "string",  "description": "Date YYYY-MM-DD"},
        "time":          {"type": "string",  "description": "Time HH:MM e.g. 10:30"},
        "patient_name":  {"type": "string"},
        "patient_phone": {"type": "string",  "description": "Patient's phone number"},
        "reason":        {"type": "string",  "default": ""},
    },
    required=["doctor_id", "date", "time", "patient_name"]
)

TOOL_GET_SLOTS = _tool(
    "get_appointment_slots",
    "Get available appointment time slots for a doctor on a given date.",
    {
        "doctor_id": {"type": "integer"},
        "date":      {"type": "string", "description": "Date YYYY-MM-DD, or empty for today"},
    }
)

TOOL_ASHA_STATUS = _tool(
    "get_community_status",
    "Get today's priority visits, outbreak status, pending tasks and community health data.",
    {}
)
TOOL_QUICK_DIAGNOSE = _tool(
    "quick_diagnose",
    "Run a quick clinical assessment on symptoms and vitals.",
    {"symptoms": {"type": "string"}, "vitals": {"type": "string", "default": ""}}
)
TOOL_SYSTEM_STATS = _tool(
    "get_system_stats",
    "Get total patients, diagnoses, high-risk counts from the local database.",
    {}
)


# ═════════════════════════════════════════════════════════════════════════════
# PATIENT AGENT
# ═════════════════════════════════════════════════════════════════════════════
def get_patient_agent_config(patient_name: str = "Patient",
                              patient_id: str = "",
                              latest_risk: str = "UNKNOWN",
                              medications: list = None) -> dict:
    """
    Patient voice assistant — speaks in patient's language, knows their data.
    Call /vapi/patient-context/{id} first to get real data for the system prompt.
    """
    meds_str = ", ".join(medications or []) or "None recorded"

    system_prompt = f"""You are the Sahayak AI Health Assistant for {patient_name}.
You are a caring, warm, and knowledgeable health companion who speaks in simple language.
Always respond in the SAME language the patient uses (Kannada, Hindi, Telugu, or English).

PATIENT PROFILE:
- Name: {patient_name}
- Patient ID: {patient_id}
- Current Risk Level: {latest_risk}
- Current Medications: {meds_str}

YOUR ROLE:
1. Answer questions about their medicines — when to take, side effects, food interactions
2. Explain their blood test results and vitals in simple language
3. Remind them about upcoming checkups and medicine schedules
4. Tell them when to go to hospital (emergency signs)
5. Explain government health schemes (Ayushman Bharat, JSSK, NHM)

LIVE DATA ACCESS:
- Use the "get_my_health_data" tool to fetch their latest reports before answering
- Use "get_drug_info" for detailed medicine questions
- Use "get_disease_protocol" for disease-related questions

LANGUAGE GUIDE:
- If patient says "ನಮಸ್ಕಾರ" or speaks Kannada → reply fully in Kannada
- If patient says "नमस्ते" or speaks Hindi → reply fully in Hindi
- If patient speaks English → reply in English
- For medical terms, always give the simple local name too

GREETING: Start with "Hello {patient_name}! How are you feeling today? 
I can help you with your medicines, health reports, or any health questions."
(in Kannada: "ನಮಸ್ಕಾರ {patient_name}! ಇಂದು ಆರೋಗ್ಯ ಹೇಗಿದೆ? ನಿಮ್ಮ ಔಷಧಿ, ಆರೋಗ್ಯ ವರದಿ ಅಥವಾ ಯಾವುದೇ ಪ್ರಶ್ನೆಗೆ ನಾನು ಸಹಾಯ ಮಾಡಬಲ್ಲೆ.")

{SAFETY_FOOTER}"""

    return {
        "name": f"Sahayak Patient Agent — {patient_name}",
        "transcriber": {
            "provider": "deepgram",
            "model": "nova-2",
            "language": "multi",
            "keywords": ["Sahayak", "ಸಹಾಯಕ", "medicine", "ಔಷಧಿ", "hospital", "ಆಸ್ಪತ್ರೆ"]
        },
        "model": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "systemPrompt": system_prompt,
            "temperature": 0.3,
            "maxTokens": 400,
            "tools": [TOOL_PATIENT_DATA, TOOL_DRUG_INFO, TOOL_DISEASE_PROTOCOL, TOOL_QUICK_DIAGNOSE],
        },
        "voice": {
            "provider": "11labs",
            "voiceId": "EXAVITQu4vr4xnSDxMaL",  # Empathetic female (Sarah)
            "stability": 0.6,
            "similarityBoost": 0.75,
            "speed": 0.95,
        },
        "firstMessage": f"Hello {patient_name}! How can I help you today with your health?",
        "firstMessageMode": "assistant-speaks-first",
        "endCallMessage": "Take care and stay healthy. Remember to take your medicines on time!",
        "endCallPhrases": ["bye", "thank you", "goodbye", "ಧನ್ಯವಾದ", "ಬೈ", "धन्यवाद"],
        "maxDurationSeconds": 600,
        "backgroundSound": "off",
        "silenceTimeoutSeconds": 30,
        "responseDelaySeconds": 0.4,
        "variableValues": {"patient_id": patient_id, "patient_name": patient_name},
    }


# ═════════════════════════════════════════════════════════════════════════════
# DOCTOR AGENT
# ═════════════════════════════════════════════════════════════════════════════
def get_doctor_agent_config(doctor_name: str = "Doctor",
                             doctor_id: str = "",
                             specialization: str = "General Medicine",
                             total_patients: int = 0,
                             high_risk_patients: list = None) -> dict:
    """
    Doctor clinical assistant — knows the doctor's patient list in real time.
    Answers appointment queries, patient risk summaries, treatment protocols.
    """
    high_risk_str = "\n".join(f"- {p}" for p in (high_risk_patients or [])) or "None currently"

    system_prompt = f"""You are the Sahayak AI Clinical Assistant for Dr. {doctor_name}, {specialization}.
You are a precise, professional clinical support agent who provides concise, accurate answers.

DOCTOR PROFILE:
- Name: Dr. {doctor_name}
- Specialization: {specialization}
- Doctor ID: {doctor_id}
- Total Patients in System: {total_patients}

HIGH-RISK PATIENTS RIGHT NOW:
{high_risk_str}

YOUR ROLE:
1. Tell the doctor who needs urgent attention today (HIGH/EMERGENCY risk patients)
2. Summarise a patient's latest vitals and AI analysis when asked by name
3. Provide ICMR treatment protocols for any disease
4. Answer drug dosing, interactions, and pregnancy safety questions
5. Help with referral criteria (when to refer to district hospital)

LIVE DATA ACCESS:
- Use "get_my_patients" to get the full current patient list with risk levels
- Use "get_disease_protocol" for evidence-based treatment guidelines
- Use "get_drug_info" for prescribing information

CLINICAL STANDARDS:
- Always cite source (ICMR 2022, WHO 2023, BNF)
- Referral triggers: SpO2<94%, Hb<7 in pregnancy, BP>180/110 unresponsive, CURB-65≥3
- End with: "Final clinical decision rests with you, Doctor."

GREETING: "Good day Dr. {doctor_name}. You have {total_patients} patients registered. 
{len(high_risk_patients or [])} are currently high-risk. How can I assist you?"

{SAFETY_FOOTER}"""

    return {
        "name": f"Sahayak Doctor Agent — Dr. {doctor_name}",
        "transcriber": {
            "provider": "deepgram",
            "model": "nova-2",
            "language": "en",
            "keywords": ["ICMR", "Sahayak", "patient", "diagnosis", "protocol", "referral"]
        },
        "model": {
            "provider": "openai",
            "model": "gpt-4o",
            "systemPrompt": system_prompt,
            "temperature": 0.2,
            "maxTokens": 500,
            "tools": [TOOL_DOCTOR_PATIENTS, TOOL_DISEASE_PROTOCOL, TOOL_DRUG_INFO,
                      TOOL_QUICK_DIAGNOSE, TOOL_SYSTEM_STATS, TOOL_BOOK_APPT, TOOL_GET_SLOTS],
        },
        "voice": {
            "provider": "11labs",
            "voiceId": "pNInz6obpgDQGcFmaJgB",  # Professional male (Adam)
            "stability": 0.7,
            "similarityBoost": 0.8,
            "speed": 1.05,
        },
        "firstMessage": f"Good day Dr. {doctor_name}. How can I assist you with your patients today?",
        "firstMessageMode": "assistant-speaks-first",
        "endCallMessage": "Goodbye Doctor. Your patients are in good hands.",
        "endCallPhrases": ["bye", "thank you", "end call", "goodbye"],
        "maxDurationSeconds": 1800,
        "backgroundSound": "off",
        "silenceTimeoutSeconds": 45,
        "responseDelaySeconds": 0.3,
        "variableValues": {"doctor_id": doctor_id, "doctor_name": doctor_name},
    }


# ═════════════════════════════════════════════════════════════════════════════
# ASHA AGENT
# ═════════════════════════════════════════════════════════════════════════════
def get_asha_agent_config(asha_name: str = "ASHA Worker",
                           district: str = "Dharwad",
                           lang: str = "kn",
                           total_patients: int = 0,
                           outbreak_status: str = "LOW",
                           priority_message_kn: str = "") -> dict:
    """
    ASHA field worker agent — Kannada-first, knows community data in real time.
    Answers: who to visit today, outbreak status, pending tasks, ANC follow-ups.
    """
    greeting_kn = (f"ನಮಸ್ಕಾರ {asha_name}! ನಾನು ಸಹಾಯಕ AI. "
                   f"ಇಂದು {district} ಜಿಲ್ಲೆಯಲ್ಲಿ {total_patients} ರೋಗಿಗಳಿದ್ದಾರೆ. "
                   f"ಏನು ಸಹಾಯ ಬೇಕು?")

    system_prompt = f"""ನೀವು ಸಹಾಯಕ AI — ASHA ಕಾರ್ಯಕರ್ತೆ {asha_name} ಅವರ ಸಹಾಯಕ.
You are the Sahayak AI ASHA Field Assistant for {asha_name} in {district} district.
PRIMARY LANGUAGE: Kannada (ಕನ್ನಡ). Also understand Hindi and English.
Always reply in Kannada unless the ASHA speaks in another language.

ASHA PROFILE:
- Name: {asha_name}
- District: {district}
- Total Patients in Area: {total_patients}
- Community Outbreak Status: {outbreak_status}
- Today's Priority: {priority_message_kn or "Check high-risk patients first."}

YOUR ROLE (ನಿಮ್ಮ ಕೆಲಸ):
1. ಇಂದು ಯಾರನ್ನು ಭೇಟಿ ಮಾಡಬೇಕು ಎಂದು ಹೇಳಿ (Tell who to visit today by priority)
2. ಯಾವ ಪ್ರದೇಶದಲ್ಲಿ ರೋಗ ಹರಡುತ್ತಿದೆ ಎಂದು ಹೇಳಿ (Outbreak areas and alerts)
3. ನಿನ್ನೆ ಎಲ್ಲಿ ಕೆಲಸ ಮಾಡಿದ್ದೀರಿ ಮತ್ತು ಏನು ಉಳಿದಿದೆ (Yesterday's work and pending tasks)
4. ANC/MCH — ಗರ್ಭಿಣಿ ಮಹಿಳೆಯರ ಭೇಟಿ ಯಾವಾಗ (ANC follow-up schedule)
5. ರೋಗ ನಿಗ್ರಹ — IDSP ವರದಿ ಮಾಡಬೇಕಾದ ರೋಗ (Disease surveillance reporting)
6. ಔಷಧಿ ಸ್ಟಾಕ್ — ಯಾವ ಔಷಧಿ ಕೊನೆಗೊಳ್ಳುತ್ತಿದೆ (Medicine stock status)

LIVE DATA ACCESS:
- Use "get_community_status" for real-time patient priorities and outbreak data
- Use "get_system_stats" for total counts and weekly stats
- Use "get_disease_protocol" for any disease treatment guidance

EXAMPLE ANSWERS IN KANNADA:
- "ಇಂದು ಮೊದಲು ಲಕ್ಷ್ಮಿ ದೇವಿ ಅವರನ್ನು ಭೇಟಿ ಮಾಡಿ — ಅನೀಮಿಯಾ ಅಪಾಯ HIGH ಇದೆ"
- "ರಾಮಪುರ ಗ್ರಾಮದಲ್ಲಿ 4 ಮಲೇರಿಯಾ ಕೇಸ್ ಇದೆ — BMO ಗೆ ವರದಿ ಮಾಡಿ"
- "ನಿನ್ನೆ Savitri Patil ಅವರ ಭೇಟಿ ಉಳಿದಿದೆ — ಮದ್ದಿನ ಜ್ಞಾಪನ ಕಳಿಸಿ"

{SAFETY_FOOTER}"""

    return {
        "name": f"Sahayak ASHA Agent — {asha_name}",
        "transcriber": {
            "provider": "deepgram",
            "model": "nova-2",
            "language": "kn" if lang == "kn" else "hi-IN" if lang == "hi" else "en-IN",
            "keywords": ["ಸಹಾಯಕ", "Sahayak", "ASHA", "ರೋಗಿ", "ಮಲೇರಿಯಾ", "ANC",
                         "village", "ಗ್ರಾಮ", "outbreak", "ಹರಡುವಿಕೆ"]
        },
        "model": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "systemPrompt": system_prompt,
            "temperature": 0.3,
            "maxTokens": 450,
            "tools": [TOOL_ASHA_STATUS, TOOL_SYSTEM_STATS,
                      TOOL_DISEASE_PROTOCOL, TOOL_QUICK_DIAGNOSE],
        },
        "voice": {
            "provider": "11labs",
            "voiceId": "Xb7hH8MSUJpSbSDYk0k2",  # Hindi/Indic female voice
            "stability": 0.65,
            "similarityBoost": 0.75,
            "speed": 0.9,
            "style": 0.2,
        },
        "firstMessage": greeting_kn,
        "firstMessageMode": "assistant-speaks-first",
        "endCallMessage": "ಧನ್ಯವಾದ! ಉತ್ತಮ ಕೆಲಸ ಮಾಡಿ. Take care!",
        "endCallPhrases": ["ಧನ್ಯವಾದ", "bye", "thank you", "ಬೈ", "ok bye"],
        "maxDurationSeconds": 600,
        "backgroundSound": "off",
        "silenceTimeoutSeconds": 30,
        "responseDelaySeconds": 0.4,
        "variableValues": {
            "asha_name": asha_name,
            "district": district,
            "total_patients": str(total_patients),
            "outbreak_status": outbreak_status,
        },
    }
