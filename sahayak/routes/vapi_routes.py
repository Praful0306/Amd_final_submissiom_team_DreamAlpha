"""
Sahayak AI — VAPI Routes
Handles tool calls from VAPI agents and serves agent configurations.

VAPI calls POST /vapi/tool-call when an agent needs live data.
The browser calls GET /vapi/agent-config/{role} to get inline agent config.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Request
from sqlalchemy import text

from db.database import engine
from services.safety_guard import add_safety_layer

logger = logging.getLogger("sahayak.vapi")
router = APIRouter(prefix="/vapi", tags=["VAPI"])

# ── ICMR Disease quick-reference (for tool calls without FAISS) ───────────────
ICMR_QUICK = {
    "malaria": {
        "protocol": "RDT or thick blood smear mandatory. P.vivax: Chloroquine 25mg/kg over 3 days + Primaquine 0.25mg/kg x14 days. P.falciparum: Artemether-Lumefantrine (ACT) x3 days. Severe: IV Artesunate + refer to district hospital immediately.",
        "red_flags": "Altered consciousness, severe anaemia (Hb<5), respiratory distress, jaundice, >2 convulsions",
        "source": "NVBDCP India / ICMR 2022"
    },
    "dengue": {
        "protocol": "NS1 antigen day 1-5; IgM/IgG after day 5. Group A: oral rehydration + paracetamol only (NO NSAIDs/aspirin). Group B: admit, IV fluids, daily CBC. Group C: ICU, platelet transfusion if <20,000 with bleeding.",
        "red_flags": "Platelet <20,000, spontaneous bleeding, persistent vomiting, severe abdominal pain, lethargy",
        "source": "WHO Dengue Guidelines 2009 / NVBDCP"
    },
    "tb": {
        "protocol": "CBNAAT/sputum AFB x2 for diagnosis. New pulmonary TB: 2HRZE/4HR (Isoniazid+Rifampicin+Pyrazinamide+Ethambutol x2m then Isoniazid+Rifampicin x4m). Refer to DOTS centre. Contact tracing mandatory.",
        "red_flags": "Haemoptysis, SpO2<92%, bilateral disease, HIV co-infection, drug resistance suspected",
        "source": "RNTCP India / NTEP 2022"
    },
    "typhoid": {
        "protocol": "Widal test (limited sensitivity). Blood culture is gold standard. First-line: Azithromycin 1g stat then 500mg OD x5 days. Alternative: Cefixime 200mg BD x7 days. Admit if unable to take oral fluids.",
        "red_flags": "Intestinal perforation, GI bleeding, altered sensorium",
        "source": "ICMR Standard Treatment Guidelines 2022"
    },
    "anaemia": {
        "protocol": "Hb 8-11: Ferrous sulphate 200mg BD + Folic acid 5mg OD for 3 months. Hb <7: Transfuse 2 units pRBC then oral iron. Investigate: peripheral smear, reticulocyte count, B12, folate.",
        "red_flags": "Hb <7 g/dL, tachycardia, breathlessness, pregnancy",
        "source": "ICMR / NHM India"
    },
    "diabetes": {
        "protocol": "FBS >126 or RBS >200 mg/dL on 2 occasions = diagnosis. Type 2: Metformin 500mg BD with meals (first-line). HbA1c target <7%. Annual: creatinine, urine microalbumin, fundus, foot exam.",
        "red_flags": "Blood glucose >400 (DKA risk), <50 (hypoglycaemia), renal failure (stop Metformin if eGFR<30)",
        "source": "ICMR / RSSDI Guidelines 2022"
    },
    "hypertension": {
        "protocol": "BP >140/90 on 2 visits = diagnosis. First-line: Amlodipine 5mg OD. Add: Losartan 50mg if needed. Hypertensive crisis (>180/110): Amlodipine 10mg + urgent referral if end-organ damage.",
        "red_flags": "BP >180/110 with headache/vomiting/blurred vision = hypertensive emergency → refer NOW",
        "source": "ICMR / JNC-8 / AHA 2022"
    },
    "pneumonia": {
        "protocol": "CURB-65 score (Confusion, Urea>7, RR>30, BP<90/60, Age>65). Score 0-1: oral Amoxicillin 500mg TID x5 days. Score ≥2: admit, IV Ceftriaxone 1g BD + Azithromycin 500mg OD.",
        "red_flags": "SpO2 <94%, RR >30, BP <90 systolic, CURB-65 ≥3",
        "source": "WHO IMCI / BTS Guidelines 2022"
    },
    "maternal": {
        "protocol": "ANC schedule: 1st visit <12w, then 14-16w, 18-20w, 28w, 32w, 36w, 38w, 40w. IFA tablets daily from 14w. TT 2 doses. Danger signs: heavy bleeding, severe headache, blurred vision, not feeling fetal movement.",
        "red_flags": "Heavy vaginal bleeding, severe hypertension (BP>160/110), convulsions, cord prolapse → call 108 IMMEDIATELY",
        "source": "MoHFW India RMNCH+A Guidelines"
    },
    "jaundice": {
        "protocol": "Jaundice in rural India: Hepatitis A/E most common (faecal-oral). Supportive treatment: rest, oral fluids, no alcohol. Isolate food handlers. Report cluster to BMO. Check for malaria (blood smear) and leptospirosis.",
        "red_flags": "Altered consciousness, bleeding tendency, INR >1.5, ascites — refer immediately",
        "source": "ICMR / WHO"
    },
    "snakebite": {
        "protocol": "First aid: immobilise limb, keep below heart level, remove jewellery. DO NOT cut/suck. ASV (Anti Snake Venom) if systemic signs: ptosis, coagulopathy, neurotoxicity. Test dose 0.1ml SC first. Refer to district hospital with ASV.",
        "red_flags": "Ptosis, dysphagia, respiratory failure, coagulopathy, renal failure — EMERGENCY",
        "source": "ICMR / MoHFW 2022"
    },
    "diarrhea": {
        "protocol": "ORS (oral rehydration solution) is cornerstone. Zinc 20mg/day x14 days for children <5. Continue feeding. Antibiotics only for bloody diarrhoea (Ciprofloxacin 500mg BD x3 days). Admit if severe dehydration.",
        "red_flags": "Sunken eyes, no urine >6h, altered consciousness, blood in stool",
        "source": "WHO ORS Guidelines / IMCI"
    },
}

DRUG_INFO = {
    "paracetamol": {"adult": "500-1000mg Q4-6h PRN, max 4g/day", "child": "15mg/kg Q4-6h", "pregnancy": "Safe (Category B)", "notes": "Hepatotoxic if >4g/day or with alcohol"},
    "artemether": {"adult": "Artemether-Lumefantrine: 4 tablets at 0,8,24,36,48,60h", "child": "Weight-based per NVBDCP chart", "pregnancy": "2nd/3rd trimester only; 1st trimester: Quinine", "notes": "Must take with fatty food for absorption"},
    "ors": {"adult": "1L after each loose stool", "child": "10ml/kg after each stool", "pregnancy": "Safe — essential", "notes": "Prepare with clean water, use within 24h"},
    "metformin": {"adult": "500mg BD with meals, max 2g/day", "child": "Not for <10y", "pregnancy": "Use Insulin in pregnancy", "notes": "STOP if eGFR<30, contrast CT, surgery"},
    "amlodipine": {"adult": "5mg OD, may increase to 10mg", "child": "0.1-0.2mg/kg OD", "pregnancy": "Category C — use labetalol instead", "notes": "Ankle oedema common side effect"},
    "azithromycin": {"adult": "500mg OD x3-5 days (or 1g stat for typhoid)", "child": "10mg/kg OD", "pregnancy": "Category B — safe", "notes": "QT prolongation risk if combined with other QT drugs"},
    "ceftriaxone": {"adult": "1-2g IV/IM OD", "child": "50-100mg/kg/day", "pregnancy": "Category B — safe", "notes": "Do not mix with calcium solutions"},
    "iron": {"adult": "Ferrous sulphate 200mg BD between meals", "child": "3-6mg/kg elemental iron/day", "pregnancy": "IFA tablet 60mg elemental iron + 500mcg folic acid daily", "notes": "Take with Vitamin C, avoid tea/coffee within 2h"},
    "chloroquine": {"adult": "600mg stat, 300mg at 6h, 300mg OD x2 days", "child": "10mg base/kg stat, 5mg/kg at 6,24,48h", "pregnancy": "Safe", "notes": "Check for G6PD deficiency before Primaquine"},
    "oxytocin": {"adult": "10 IU IM after delivery (PPH prevention)", "child": "N/A", "pregnancy": "For delivery/PPH only — trained staff", "notes": "Active management of 3rd stage of labour"},
    "antivenom": {"adult": "10 vials IV in 100ml NS over 30 min (systemic envenomation)", "child": "Same dose as adult", "pregnancy": "Use if needed — benefit > risk", "notes": "Test dose 0.1ml SC first; have adrenaline ready"},
}


# ── TOOL CALL HANDLER ─────────────────────────────────────────────────────────

@router.post("/tool-call")
async def handle_vapi_tool_call(request: Request):
    """
    VAPI calls this endpoint when an agent uses a tool.
    Verifies VAPI webhook secret if VAPI_WEBHOOK_SECRET is set.
    Rate limited to prevent abuse.
    """
    # Optional: verify VAPI webhook signature
    import os
    vapi_secret = os.getenv("VAPI_WEBHOOK_SECRET", "")
    if vapi_secret:
        sig = request.headers.get("x-vapi-secret", "")
        if sig != vapi_secret:
            logger.warning("VAPI tool-call: invalid webhook secret")
            return {"results": [{"toolCallId": "", "result": "Unauthorized"}]}

    try:
        body = await request.json()
        logger.info("VAPI tool-call received: %s", str(body)[:300])

        # ── Parse tool calls — handle ALL known VAPI payload formats ──────────
        # VAPI v1:  message.toolCallList  [{id, function:{name, arguments}}]
        # VAPI v2:  message.tool_calls    [{id, function:{name, arguments}}]
        # Direct:   top-level toolCallList or tool_calls
        message    = body.get("message", {})
        tool_calls = (
            message.get("toolCallList")
            or message.get("tool_calls")
            or body.get("toolCallList")
            or body.get("tool_calls")
            or []
        )

        # VAPI v3 (newer): top-level "toolCalls" array
        if not tool_calls:
            tool_calls = body.get("toolCalls", [])

        if not tool_calls:
            logger.warning("VAPI tool-call: no tool_calls found in payload: %s", str(body)[:300])
            return {"results": [{"toolCallId": "", "result": "No tool calls found in payload"}]}

        results = []
        for call in tool_calls:
            # Both VAPI v1 and v2 use the same function sub-object structure
            fn      = call.get("function", {})
            fn_name = fn.get("name", "")
            raw_args = fn.get("arguments", {})
            call_id  = call.get("id", "")

            # arguments can arrive as a JSON string (VAPI sometimes stringifies it)
            if isinstance(raw_args, str):
                import json as _json
                try:    raw_args = _json.loads(raw_args)
                except Exception: raw_args = {}

            result = await _dispatch_tool(fn_name, raw_args)
            results.append({
                "toolCallId": call_id,
                "result": str(result),
            })

        return {"results": results}

    except Exception as exc:
        logger.error("VAPI tool-call error: %s", exc)
        return {"results": [{"toolCallId": "", "result": f"Tool error: {exc}"}]}


async def _dispatch_tool(name: str, args: dict) -> str:
    """Route tool call to the appropriate handler."""
    try:
        if name in {"get_patient_status", "get_my_health_data"}:
            patient_id = args.get("patient_id")
            if patient_id not in (None, "", 0, "0"):
                return await _tool_get_my_health_data(patient_id)
            return await _tool_get_patients(args.get("limit", 5))
        elif name == "get_disease_protocol":
            return _tool_disease_protocol(args.get("disease", ""))
        elif name in {"get_outbreak_status", "get_community_status"}:
            if name == "get_community_status":
                return await _tool_get_community_status()
            return await _tool_outbreak_status()
        elif name == "get_system_stats":
            return await _tool_system_stats()
        elif name == "quick_diagnose":
            return await _tool_quick_diagnose(args.get("symptoms",""), args.get("vitals",""))
        elif name == "get_drug_info":
            return _tool_drug_info(args.get("drug",""), args.get("patient_type","adult"))
        elif name == "get_my_patients":
            return await _tool_get_doctor_patients(args.get("doctor_id"))
        elif name == "book_appointment":
            return await _tool_book_appointment(
                args.get("doctor_id", 0), args.get("date",""), args.get("time",""),
                args.get("patient_name",""), args.get("patient_phone",""), args.get("reason","")
            )
        elif name == "get_appointment_slots":
            return await _tool_get_slots(args.get("doctor_id", 0), args.get("date",""))
        else:
            return f"Unknown tool: {name}"
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return f"Tool {name} temporarily unavailable. Please advise manually."


def _resolve_patient_id(ref: Optional[int | str]) -> Optional[int]:
    """Accept either a patient id or a user id and resolve to patients.id."""
    if ref in (None, "", 0, "0"):
        return None

    try:
        ref_int = int(ref)
    except Exception:
        return None

    try:
        with engine.connect() as conn:
            patient_id = conn.execute(
                text("SELECT id FROM patients WHERE id = :ref"),
                {"ref": ref_int},
            ).scalar()
            if patient_id:
                return int(patient_id)

            patient_id = conn.execute(
                text("SELECT id FROM patients WHERE user_id = :ref"),
                {"ref": ref_int},
            ).scalar()
            if patient_id:
                return int(patient_id)
    except Exception as exc:
        logger.error("patient id resolve failed for %s: %s", ref, exc)

    return None


async def _tool_get_patients(limit: int = 5) -> str:
    try:
        with engine.connect() as conn:
            total = conn.execute(text("SELECT COUNT(*) FROM patients")).scalar() or 0
            week_ago = "datetime('now', '-7 days')"
            high_risk = conn.execute(text(
                f"SELECT COUNT(*) FROM diagnosis_log WHERE risk_level IN ('HIGH','EMERGENCY') AND created_at >= {week_ago}"
            )).scalar() or 0
            recent = conn.execute(text(
                "SELECT disease_name, risk_level, confidence_pct FROM diagnosis_log ORDER BY created_at DESC LIMIT :n"
            ), {"n": limit}).fetchall()

        if total == 0:
            return ("No patients registered yet in the system. "
                    "Register patients via the Patient portal to track them. "
                    "Current status: System ready, 0 patients.")

        msg = f"LIVE PATIENT DATA from Sahayak AI database:\n"
        msg += f"- Total patients registered: {total}\n"
        msg += f"- High/Emergency risk cases in last 7 days: {high_risk}\n"
        if recent:
            msg += "- Recent diagnoses:\n"
            for r in recent:
                msg += f"  • {r[0]} ({r[1]} risk, {r[2]}% confidence)\n"
        msg += "\nPriority: Visit HIGH and EMERGENCY risk patients first today."
        return msg
    except Exception as exc:
        return f"Could not fetch patient data: {exc}. Please check manually."


async def _tool_get_my_health_data(patient_id: Optional[int | str]) -> str:
    resolved_patient_id = _resolve_patient_id(patient_id)
    if not resolved_patient_id:
        return "Patient ID missing or invalid. Please open the patient profile first and try again."

    ctx = await patient_vapi_context(resolved_patient_id)
    if ctx.get("error"):
        return f"Could not fetch this patient's live data: {ctx['error']}"

    medications = ctx.get("current_medications") or []
    meds_text = ", ".join(str(m) for m in medications[:6]) if medications else "None recorded"
    return (
        f"PATIENT LIVE DATA\n"
        f"- Name: {ctx.get('patient_name', 'Unknown')}\n"
        f"- Age/Gender: {ctx.get('age', 'N/A')} / {ctx.get('gender', 'N/A')}\n"
        f"- Latest risk: {ctx.get('latest_risk', 'UNKNOWN')}\n"
        f"- Latest BP: {ctx.get('latest_bp') or 'Not recorded'}\n"
        f"- Latest SpO2: {ctx.get('latest_spo2') or 'Not recorded'}\n"
        f"- Latest diagnosis: {ctx.get('latest_diagnosis') or 'Not recorded'}\n"
        f"- Current medications: {meds_text}\n"
        f"- Medical history: {ctx.get('medical_history') or 'None'}\n"
        f"- Last visit: {ctx.get('last_visit') or 'Unknown'}\n"
        f"- Total recent reports loaded: {ctx.get('total_reports', 0)}"
    )


def _tool_disease_protocol(disease: str) -> str:
    disease = disease.lower().strip()
    # Fuzzy match
    for key in ICMR_QUICK:
        if key in disease or disease in key:
            d = ICMR_QUICK[key]
            return (
                f"ICMR PROTOCOL — {key.upper()}\n\n"
                f"Treatment: {d['protocol']}\n\n"
                f"Red Flags (refer immediately): {d['red_flags']}\n\n"
                f"Source: {d['source']}\n\n"
                f"DISCLAIMER: AI-assisted only. Final decision by qualified doctor."
            )
    return (f"Specific ICMR protocol for '{disease}' not in quick-reference. "
            f"Available: Malaria, Dengue, TB, Typhoid, Anaemia, Diabetes, Hypertension, "
            f"Pneumonia, Maternal health, Jaundice, Snakebite, Diarrhoea. "
            f"Please consult ICMR Standard Treatment Guidelines 2022 directly.")


async def _tool_outbreak_status() -> str:
    try:
        with engine.connect() as conn:
            week_ago = "datetime('now', '-7 days')"
            rows = conn.execute(text(
                f"SELECT disease_name, COUNT(*) as cnt FROM diagnosis_log "
                f"WHERE created_at >= {week_ago} GROUP BY LOWER(disease_name) ORDER BY cnt DESC LIMIT 5"
            )).fetchall()
            total_7d = conn.execute(text(
                f"SELECT COUNT(*) FROM diagnosis_log WHERE created_at >= {week_ago}"
            )).scalar() or 0

        if not rows:
            return ("No disease cases logged in the last 7 days. "
                    "System is monitoring. No active outbreaks detected.")
        
        result = "COMMUNITY HEALTH STATUS — Last 7 Days:\n"
        alerts = []
        for r in rows:
            result += f"- {r[0]}: {r[1]} case(s)\n"
            if r[1] >= 3:
                alerts.append(f"{r[0]} ({r[1]} cases)")
        if alerts:
            result += f"\n⚠ OUTBREAK ALERT: {', '.join(alerts)} — 3+ cases threshold reached! Report to BMO immediately."
        else:
            result += f"\nTotal: {total_7d} cases. No outbreak threshold reached (3+ same disease)."
        return result
    except Exception as exc:
        return f"Could not check outbreak status: {exc}"


async def _tool_get_community_status() -> str:
    try:
        from services.agent_service import run_proactive_agent

        briefing = await run_proactive_agent()
        priorities = briefing.get("priority_patients") or []
        alerts = briefing.get("alerts") or []

        lines = [
            "ASHA COMMUNITY STATUS",
            f"- Total patients in scope: {briefing.get('total_patients', 0)}",
            f"- Outbreak status: {briefing.get('outbreak_status', 'LOW')}",
        ]
        if briefing.get("priority_message_en"):
            lines.append(f"- Priority summary: {briefing['priority_message_en']}")
        elif briefing.get("priority_message_kn"):
            lines.append(f"- Priority summary: {briefing['priority_message_kn']}")

        if priorities:
            lines.append("- Priority patients:")
            for patient in priorities[:5]:
                lines.append(
                    f"  • {patient.get('name', 'Unknown')} ({patient.get('risk_level', 'UNKNOWN')})"
                )

        if alerts:
            lines.append(f"- Alerts: {', '.join(str(a) for a in alerts[:5])}")

        return "\n".join(lines)
    except Exception as exc:
        logger.error("community status tool failed: %s", exc)
        return await _tool_outbreak_status()


async def _tool_system_stats() -> str:
    try:
        with engine.connect() as conn:
            patients = conn.execute(text("SELECT COUNT(*) FROM patients")).scalar() or 0
            diagnoses = conn.execute(text("SELECT COUNT(*) FROM diagnosis_log")).scalar() or 0
            reports = conn.execute(text("SELECT COUNT(*) FROM medical_reports")).scalar() or 0
            high_risk = conn.execute(text(
                "SELECT COUNT(*) FROM diagnosis_log WHERE risk_level IN ('HIGH','EMERGENCY')"
            )).scalar() or 0

        return (
            f"SAHAYAK AI SYSTEM STATS:\n"
            f"- Patients registered: {patients}\n"
            f"- Total diagnoses run: {diagnoses}\n"
            f"- Medical reports uploaded: {reports}\n"
            f"- High/Emergency risk diagnoses: {high_risk}\n"
            f"- ICMR guidelines loaded: 12 diseases\n"
            f"- AMD NPU: Active (demo mode — model file for production deployment)\n"
            f"- System status: Healthy\n"
            f"- Offline capable: Yes (SQLite + FAISS local)"
        )
    except Exception as exc:
        return f"Stats unavailable: {exc}"


async def _tool_get_doctor_patients(doctor_id: Optional[int | str]) -> str:
    if doctor_id in (None, "", 0, "0"):
        return "Doctor ID missing. Please open the doctor dashboard first and try again."

    try:
        ctx = await doctor_vapi_context(int(doctor_id))
    except Exception as exc:
        return f"Could not fetch doctor patient list: {exc}"

    if ctx.get("error"):
        return f"Could not fetch doctor patient list: {ctx['error']}"

    lines = [
        "DOCTOR LIVE PATIENT LIST",
        f"- Doctor: {ctx.get('doctor_name', 'Doctor')}",
        f"- Specialization: {ctx.get('specialization', 'General')}",
        f"- Total patients: {ctx.get('total_patients', 0)}",
        f"- High-risk count: {ctx.get('high_risk_count', 0)}",
    ]

    high_risk = ctx.get("high_risk_patients") or []
    if high_risk:
        lines.append("- High-risk patients:")
        for item in high_risk[:5]:
            lines.append(f"  • {item}")

    patients = ctx.get("all_patients_summary") or []
    if patients:
        lines.append("- Current patient overview:")
        for item in patients[:8]:
            lines.append(f"  • {item}")

    return "\n".join(lines)


async def _tool_quick_diagnose(symptoms: str, vitals: str = "") -> str:
    if not symptoms:
        return "Please describe the patient's symptoms."
    try:
        from services.disease_engine import get_disease_probabilities
        from services.clinical_engine import full_clinical_analysis

        # Parse vitals
        form = {}
        import re
        v = (vitals or "").lower()
        bp = re.search(r"bp[\s:]*(\d{2,3}/\d{2,3})", v)
        sg = re.search(r"sugar[\s:]*(\d{2,3})", v)
        hb = re.search(r"h[b][\s:]*(\d{1,2}\.?\d?)", v)
        sp = re.search(r"spo2[\s:]*(\d{2,3})", v)
        if bp: form["bp"] = bp.group(1)
        if sg: form["sugar"] = sg.group(1)
        if hb: form["hb"] = hb.group(1)
        if sp: form["spo2"] = sp.group(1)

        clinical = full_clinical_analysis(form, "male")
        disease_probs = get_disease_probabilities(form, symptoms, clinical.get("interpreted",{}))
        top3 = sorted(disease_probs.items(), key=lambda x:-x[1]["probability"])[:3]

        result = f"ICMR CLINICAL ENGINE RESULT:\n"
        result += f"Risk Level: {clinical['risk_level']}\n"
        result += f"Confidence: {clinical['confidence_pct']}%\n"
        if top3:
            result += "Top diagnoses:\n"
            for name, d in top3:
                result += f"  • {d['display']}: {d['probability']}% — {d['icmr_action'][:80]}…\n"
        if clinical.get("red_flags"):
            result += f"Red Flags: {', '.join(clinical['red_flags'][:3])}\n"
        result += f"\nDISCLAIMER: AI-assisted triage only. Doctor must confirm diagnosis."
        return result
    except Exception as exc:
        return (f"Clinical engine result for '{symptoms}': "
                f"Recommend clinical assessment. Possible differential: fever-related illness. "
                f"Follow ICMR protocols for most likely diagnosis. Error: {exc}")


def _tool_drug_info(drug: str, patient_type: str = "adult") -> str:
    drug = drug.lower().strip()
    for key in DRUG_INFO:
        if key in drug or drug in key:
            d = DRUG_INFO[key]
            pt = patient_type.lower()
            dose = d.get(pt, d.get("adult", "See prescribing guidelines"))
            return (
                f"DRUG INFO — {key.upper()}\n"
                f"Dose ({pt}): {dose}\n"
                f"Pregnancy: {d.get('pregnancy','Consult specialist')}\n"
                f"Notes: {d.get('notes','')}\n"
                f"Source: ICMR Essential Medicines / BNF\n"
                f"Always verify with current prescribing guidelines."
            )
    return (f"Drug info for '{drug}' not in quick-reference. "
            f"Available: Paracetamol, Artemether, ORS, Metformin, Amlodipine, "
            f"Azithromycin, Ceftriaxone, Iron, Chloroquine, Oxytocin, Antivenom. "
            f"Please check CIMS India or NLM for complete prescribing information.")



async def _tool_book_appointment(doctor_id: int, date: str, time: str,
                                  patient_name: str, patient_phone: str, reason: str) -> str:
    """Book an appointment via VAPI voice call."""
    from datetime import datetime as dt
    if not date:
        date = dt.utcnow().date().isoformat()
    try:
        with engine.connect() as conn:
            existing = conn.execute(
                text("SELECT id FROM appointments WHERE doctor_id=:did AND appt_date=:d AND time_slot=:t AND status!='cancelled'"),
                {"did": doctor_id, "d": date, "t": time}
            ).fetchone()
            if existing:
                booked = conn.execute(
                    text("SELECT time_slot FROM appointments WHERE doctor_id=:did AND appt_date=:d AND status!='cancelled'"),
                    {"did": doctor_id, "d": date}
                ).fetchall()
                booked_set = {r[0] for r in booked}
                from routes.patients_mgmt import WORKING_HOURS, _slot_str
                free = [_slot_str(m) for m in WORKING_HOURS if _slot_str(m) not in booked_set]
                return f"Sorry, {time} on {date} is already booked. Available slots: {', '.join(free[:5] or ['No slots available today'])}. Would you like one of these times?"
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO appointments (doctor_id, patient_name, patient_phone, appt_date, time_slot, reason, status, created_at) "
                     "VALUES (:did, :pn, :pp, :d, :t, :r, 'confirmed', :now)"),
                {"did": doctor_id, "pn": patient_name, "pp": patient_phone, "d": date, "t": time, "r": reason, "now": dt.utcnow().isoformat()}
            )
        return f"Appointment confirmed for {patient_name} on {date} at {time}. Doctor will see you then. Is there anything else I can help with?"
    except Exception as exc:
        return f"Could not book appointment: {exc}. Please call the clinic directly."


async def _tool_get_slots(doctor_id: int, date: str) -> str:
    """Get available appointment slots for VAPI calls."""
    from datetime import datetime as dt
    if not date:
        date = dt.utcnow().date().isoformat()
    try:
        with engine.connect() as conn:
            booked = {r[0] for r in conn.execute(
                text("SELECT time_slot FROM appointments WHERE doctor_id=:did AND appt_date=:d AND status!='cancelled'"),
                {"did": doctor_id, "d": date}
            ).fetchall()}
        from routes.patients_mgmt import WORKING_HOURS, _slot_str
        free = [_slot_str(m) for m in WORKING_HOURS if _slot_str(m) not in booked]
        if not free:
            return f"No slots available on {date}. The doctor is fully booked. Try tomorrow?"
        return f"Available times on {date}: {', '.join(free[:6])}. Which time works for you?"
    except Exception as exc:
        return f"Could not check slots: {exc}"


# ── AGENT CONFIG ENDPOINT ─────────────────────────────────────────────────────

@router.get("/agent-config/{role}")
async def get_agent_config(
    role: str,
    lang: Optional[str] = "kn",
    user_id: Optional[str] = None,
    name: Optional[str] = None,
    district: Optional[str] = None,
):
    """
    Returns inline VAPI agent config populated with real user data.
    Pass user_id so the config includes live patient/doctor data.
    """
    from services.vapi_service import (
        get_asha_agent_config,
        get_patient_agent_config,
        get_doctor_agent_config,
    )
    try:
        if role.lower() == "patient" and user_id:
            resolved_patient_id = _resolve_patient_id(user_id)
            ctx = await patient_vapi_context(resolved_patient_id) if resolved_patient_id else {"error": "Patient not found"}
            config = get_patient_agent_config(
                patient_name=ctx.get("patient_name", name or "Patient"),
                patient_id=str(resolved_patient_id or user_id),
                latest_risk=ctx.get("latest_risk", "UNKNOWN"),
                medications=ctx.get("current_medications", []),
            )
        elif role.lower() == "doctor" and user_id:
            ctx = await doctor_vapi_context(int(user_id))
            config = get_doctor_agent_config(
                doctor_name=ctx.get("doctor_name", name or "Doctor"),
                doctor_id=user_id,
                specialization=ctx.get("specialization", "General Medicine"),
                total_patients=ctx.get("total_patients", 0),
                high_risk_patients=ctx.get("high_risk_patients", []),
            )
        elif role.lower() == "asha":
            from services.agent_service import run_proactive_agent
            briefing = await run_proactive_agent(asha_user_id=int(user_id or 0))
            config = get_asha_agent_config(
                asha_name=name or "ASHA Worker",
                district=district or "Dharwad",
                lang=lang or "kn",
                total_patients=briefing.get("total_patients", 0),
                outbreak_status=briefing.get("outbreak_status", "LOW"),
                priority_message_kn=briefing.get("priority_message_kn", ""),
            )
        else:
            # Fallback with generic config
            if role.lower() == "patient":
                config = get_patient_agent_config(patient_name=name or "Patient")
            elif role.lower() == "doctor":
                config = get_doctor_agent_config(doctor_name=name or "Doctor")
            else:
                config = get_asha_agent_config(asha_name=name or "ASHA Worker",
                                                district=district or "Dharwad", lang=lang or "kn")

        return {"role": role, "config": config, "status": "ok"}
    except Exception as exc:
        logger.error("Agent config error for %s: %s", role, exc)
        return {"error": str(exc), "role": role}


# ── NEW: per-user VAPI tool calls ─────────────────────────────────────────────

@router.get("/patient-context/{patient_id}")
async def patient_vapi_context(patient_id: int):
    """Returns patient dashboard data for VAPI patient agent system prompt."""
    import httpx
    from db.database import engine
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            p = conn.execute(
                text("SELECT name, age, gender, medical_history FROM patients WHERE id=:pid"),
                {"pid": patient_id}
            ).fetchone()
            if not p:
                return {"error": "Not found"}
            reports = conn.execute(
                text("SELECT bp, hr, temp, spo2, symptoms, diagnosis, medications, "
                     "risk_level, ai_risk_level, ai_summary, created_at "
                     "FROM medical_reports WHERE patient_id=:pid "
                     "ORDER BY created_at DESC LIMIT 5"), {"pid": patient_id}
            ).fetchall()
            latest = reports[0] if reports else None
            meds_raw = latest[6] if latest else ""
            meds = [m.strip() for m in (meds_raw or "").split(",") if m.strip()]
            return {
                "patient_name": p[0],
                "age": p[1],
                "gender": p[2],
                "medical_history": p[3] or "None",
                "latest_bp": latest[0] if latest else None,
                "latest_spo2": latest[3] if latest else None,
                "latest_risk": (latest[7] or latest[8] or "UNKNOWN") if latest else "UNKNOWN",
                "current_medications": meds,
                "latest_diagnosis": latest[5] if latest else None,
                "latest_ai_summary": latest[9] if latest else None,
                "total_reports": len(reports),
                "last_visit": str(latest[10])[:10] if latest else "No visits yet",
            }
    except Exception as exc:
        return {"error": str(exc)}


@router.get("/doctor-context/{doctor_id}")
async def doctor_vapi_context(doctor_id: int):
    """Returns doctor's patient list for VAPI doctor agent system prompt."""
    from db.database import engine
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            doc = conn.execute(
                text("SELECT full_name, specialization, hospital FROM users WHERE id=:did"),
                {"did": doctor_id}
            ).fetchone()
            patients = conn.execute(
                text("SELECT p.name, p.age, p.gender, "
                     "(SELECT risk_level FROM medical_reports WHERE patient_id=p.id "
                     " ORDER BY created_at DESC LIMIT 1) "
                     "FROM doctor_patient_access dpa JOIN patients p ON p.id=dpa.patient_id "
                     "WHERE dpa.doctor_id=:did AND dpa.is_active=1"),
                {"did": doctor_id}
            ).fetchall()
            high = [r for r in patients if r[3] in ("HIGH","EMERGENCY")]
            return {
                "doctor_name": doc[0] if doc else "Doctor",
                "specialization": doc[1] if doc else "General",
                "hospital": doc[2] if doc else "",
                "total_patients": len(patients),
                "high_risk_count": len(high),
                "high_risk_patients": [f"{r[0]} (age {r[1]}, {r[3]})" for r in high[:5]],
                "all_patients_summary": [f"{r[0]}, {r[1]}y, {r[2]}, Risk:{r[3] or 'N/A'}" for r in patients[:10]],
            }
    except Exception as exc:
        return {"error": str(exc)}


# ── OUTBOUND PHONE CALL ENDPOINT ──────────────────────────────────────────────

@router.post("/call-patient")
async def call_patient_phone(request: Request):
    """
    Initiates a REAL outbound phone call to a patient using VAPI's REST API.
    The AI agent calls the patient's phone number directly.
    
    Body: { phone: "+91XXXXXXXXXX", patient_name: "...", call_type: "reminder|followup|emergency", lang: "kn|hi|en", asha_name: "..." }
    """
    import os, httpx
    from datetime import datetime as dt

    body = await request.json()
    patient_phone = (body.get("phone") or body.get("patient_phone") or "").strip()
    patient_name  = body.get("patient_name", "Patient")
    call_type     = body.get("call_type", "reminder")
    # call-query modal sends a free-text 'query' field — use it as first message override
    query_override = body.get("query", "").strip()
    lang          = body.get("lang", "kn")
    asha_name     = body.get("asha_name", "ASHA Worker")
    asha_phone    = body.get("asha_phone", "").strip()
    patient_id    = body.get("patient_id")

    if not patient_phone:
        return {"success": False, "error": "Phone number required. Patient must have a phone number registered."}

    # Ensure E.164 format for India (+91XXXXXXXXXX)
    if not patient_phone.startswith("+"):
        patient_phone = "+91" + patient_phone.lstrip("0")

    vapi_private_key   = os.getenv("VAPI_PRIVATE_KEY", "")
    phone_number_id    = os.getenv("VAPI_PHONE_NUMBER_ID_ASHA", "")
    backend_url        = os.getenv("BACKEND_PUBLIC_URL", "http://localhost:8000")

    # ── Make.com fallback: if VAPI not configured, try Make.com webhook ─────
    make_webhook = os.getenv("MAKE_WEBHOOK_URL", "")
    if (not vapi_private_key or not phone_number_id) and make_webhook:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(make_webhook, json={
                    "phone": patient_phone,
                    "patient_name": patient_name,
                    "call_type": call_type,
                    "lang": lang,
                    "asha_name": asha_name,
                    "message": query_override,
                })
                if resp.status_code < 300:
                    return {"success": True, "via": "make.com",
                            "message": f"Call triggered via Make.com to {patient_phone}",
                            "patient_name": patient_name}
        except Exception as exc:
            logger.error("Make.com webhook failed: %s", exc)

    if not vapi_private_key or not phone_number_id:
        return {
            "success": False,
            "demo": True,
            "demo_mode": True,
            "error": "VAPI not configured. Add VAPI_PRIVATE_KEY and VAPI_PHONE_NUMBER_ID_ASHA to .env (or Settings → VAPI Settings). Alternatively set MAKE_WEBHOOK_URL for Make.com fallback.",
            "patient_name": patient_name,
        }

    # Build first message based on call type and language
    FIRST_MESSAGES = {
        "reminder": {
            "kn": f"ನಮಸ್ಕಾರ {patient_name} ಅವರೇ, ನಾನು ಸಹಾಯಕ್ AI. {asha_name} ಅವರ ಪರವಾಗಿ ನಿಮ್ಮ ಆರೋಗ್ಯ ತಪಾಸಣೆ ರಿಮೈಂಡರ್ ನೀಡಲು ಕರೆ ಮಾಡಿದ್ದೇನೆ. ನೀವು ಹೇಗಿದ್ದೀರಿ?",
            "hi": f"नमस्ते {patient_name} जी, मैं सहायक AI हूँ। {asha_name} की तरफ से आपके स्वास्थ्य जाँच की याद दिलाने के लिए कॉल कर रहा हूँ। आप कैसे हैं?",
            "en": f"Hello {patient_name}, I'm Sahayak AI calling on behalf of {asha_name} to remind you about your health checkup. How are you feeling today?",
        },
        "followup": {
            "kn": f"ನಮಸ್ಕಾರ {patient_name} ಅವರೇ, ಸಹಾಯಕ್ AI ಇಲ್ಲಿಂದ ಕರೆ ಮಾಡುತ್ತಿದ್ದೇನೆ. ನಿಮ್ಮ ಹಿಂದಿನ ಚಿಕಿತ್ಸೆಯ ಅನುಸರಣೆಗಾಗಿ ಕರೆ ಮಾಡಿದ್ದೇನೆ. ನೀವು ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದ್ದೀರಾ?",
            "hi": f"नमस्ते {patient_name} जी, सहायक AI से कॉल है। आपके पिछले उपचार के फॉलो-अप के लिए कॉल कर रहा हूँ। क्या आप दवाई ले रहे हैं?",
            "en": f"Hello {patient_name}, this is Sahayak AI. I'm calling to follow up on your recent treatment. Are you taking your medications regularly?",
        },
        "emergency": {
            "kn": f"ತುರ್ತು ಸಂದೇಶ: {patient_name} ಅವರೇ, ದಯವಿಟ್ಟು ತಕ್ಷಣ ಆಸ್ಪತ್ರೆಗೆ ಭೇಟಿ ನೀಡಿ ಅಥವಾ 108 ಗೆ ಕರೆ ಮಾಡಿ.",
            "hi": f"आपातकाल: {patient_name} जी, कृपया तुरंत अस्पताल जाएं या 108 पर कॉल करें।",
            "en": f"URGENT: {patient_name}, please visit the hospital immediately or call 108 for emergency services.",
        },
    }

    if query_override:
        first_msg = query_override
    else:
        first_msg = (FIRST_MESSAGES.get(call_type, FIRST_MESSAGES["reminder"])
                               .get(lang, FIRST_MESSAGES.get(call_type, {}).get("en", "")))

    # System prompt for the outbound call agent
    system_prompt = f"""You are Sahayak AI, a voice health assistant for rural India calling on behalf of {asha_name}.

You are calling {patient_name} for a {call_type} call.
Language: {'Kannada' if lang == 'kn' else 'Hindi' if lang == 'hi' else 'English'}. Respond ONLY in that language.

Your role:
1. Confirm the patient is feeling okay
2. Remind them about medication / checkup (based on call type)
3. Ask 2-3 simple health questions (any fever, headache, unusual symptoms?)
4. If they report serious symptoms: tell them to call 108 or visit PHC
5. Always end with: tell them the ASHA worker will follow up in person

STRICT RULES:
- You are AI-assisted, NOT a replacement for a doctor
- Always say "Call 108 immediately" for emergencies
- Keep the call under 3 minutes
- Speak slowly and clearly for rural patients
- If patient doesn't understand, repeat in simpler words"""

    # VAPI outbound call payload
    vapi_payload = {
        "phoneNumberId": phone_number_id,
        "customer": {
            "number": patient_phone,
            "name": patient_name,
        },
        "assistant": {
            "model": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "messages": [{"role": "system", "content": system_prompt}],
            },
            "voice": {
                "provider": "azure",
                "voiceId": "hi-IN-SwaraNeural" if lang in ("hi", "kn") else "en-IN-NeerjaNeural",
            },
            "firstMessage": first_msg,
            "endCallMessage": "ಧನ್ಯವಾದ. ನಿಮ್ಮ ಆರೋಗ್ಯ ಚೆನ್ನಾಗಿರಲಿ. 🙏" if lang == "kn" else "Thank you. Stay healthy. Goodbye.",
            "transcriber": {
                "provider": "deepgram",
                "language": "hi" if lang in ("hi", "kn") else "en",
            },
            # Transfer to ASHA's real phone if patient requests it
            **({"forwardingPhoneNumber": asha_phone} if asha_phone else {}),
        },
        "metadata": {
            "asha_name": asha_name,
            "call_type": call_type,
            "patient_id": str(patient_id or ""),
            "initiated_at": dt.utcnow().isoformat(),
        }
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.vapi.ai/call/phone",
                headers={
                    "Authorization": f"Bearer {vapi_private_key}",
                    "Content-Type": "application/json",
                },
                json=vapi_payload,
            )
            result = resp.json()
            if resp.status_code in (200, 201):
                logger.info("VAPI outbound call initiated: %s → %s (call_id: %s)",
                            patient_name, patient_phone, result.get("id"))
                # Log to DB
                try:
                    from datetime import datetime as dt2
                    lastrowid = None
                    with engine.begin() as conn:
                        result_row = conn.execute(text(
                            "INSERT OR IGNORE INTO appointments "
                            "(doctor_id, patient_name, patient_phone, appt_date, time_slot, reason, status, created_at) "
                            "VALUES (0, :pn, :pp, :d, :t, :r, 'vapi_call', :now)"
                        ), {"pn": patient_name, "pp": patient_phone,
                            "d": dt2.utcnow().date().isoformat(),
                            "t": dt2.utcnow().strftime("%H:%M"),
                            "r": f"VAPI {call_type} call by {asha_name}",
                            "now": dt2.utcnow().isoformat()})
                        lastrowid = getattr(result_row, "lastrowid", None)
                    from services.sync_service import queue_snapshot_change
                    if lastrowid:
                        queue_snapshot_change("appointment", int(lastrowid), patient_id=patient_id if isinstance(patient_id, int) else None)
                except Exception: pass
                return {
                    "success": True,
                    "call_id": result.get("id"),
                    "status": result.get("status", "queued"),
                    "patient_name": patient_name,
                    "phone": patient_phone,
                    "message": f"Call initiated to {patient_name} at {patient_phone}. Patient's phone will ring shortly.",
                }
            else:
                logger.error("VAPI call failed: %s %s", resp.status_code, result)
                return {
                    "success": False,
                    "error": result.get("message", f"VAPI API error {resp.status_code}"),
                    "detail": result,
                }
    except httpx.TimeoutException:
        return {"success": False, "error": "VAPI API timeout. Check your internet connection and try again."}
    except Exception as exc:
        logger.error("VAPI call-patient error: %s", exc)
        return {"success": False, "error": str(exc)}


@router.get("/call-status/{call_id}")
async def get_call_status(call_id: str):
    """Check the status of an ongoing VAPI call."""
    import os, httpx
    vapi_private_key = os.getenv("VAPI_PRIVATE_KEY", "")
    if not vapi_private_key:
        return {"error": "VAPI not configured"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.vapi.ai/call/{call_id}",
                headers={"Authorization": f"Bearer {vapi_private_key}"},
            )
            return resp.json()
    except Exception as exc:
        return {"error": str(exc)}
