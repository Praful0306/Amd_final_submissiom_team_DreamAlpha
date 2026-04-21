"""
Sahayak AI — Voice agent tool routes.

These endpoints are designed for Retell/VAPI/custom voice agents so prompts can
map to real backend actions instead of generic text instructions.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from db.database import engine
from routes.patients_mgmt import WORKING_HOURS, _slot_str, _get_booked_slots
from services.sync_service import queue_snapshot_change

router = APIRouter(prefix="/voice-agents", tags=["Voice Agents"])
VOICE_AGENT_LOG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "_runtime",
    "sahayak",
    "voice_agent_logs.jsonl",
)


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _normalize_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    if len(digits) > 10:
        digits = digits[-10:]
    return digits


def _specialization_matches(doctor_type: str, specialization: Optional[str]) -> bool:
    kind = (doctor_type or "").strip().lower()
    spec = (specialization or "").strip().lower()
    if not kind:
        return True
    if kind in {"general", "general medicine", "family", "family medicine"}:
        return spec == "" or any(token in spec for token in ("general", "family", "physician", "mbbs"))
    if kind in {"women", "womens", "women's", "gynecology", "gynaecology", "obgyn", "ob-gyn"}:
        return any(token in spec for token in ("gyn", "ob", "women", "mater"))
    if kind in {"child", "children", "pediatric", "paediatric", "pediatrics", "paediatrics"}:
        return any(token in spec for token in ("pedi", "paed", "child"))
    return kind in spec


def _list_matching_doctors(doctor_type: str = "", district: str = "", q: str = "") -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, full_name, specialization, hospital, district "
                "FROM users WHERE role='doctor' AND is_active=1 "
                "ORDER BY full_name"
            )
        ).fetchall()

    doctors = []
    for row in rows:
        doctor = {
            "doctor_id": row[0],
            "doctor_name": row[1],
            "specialization": row[2] or "General Medicine",
            "hospital": row[3] or "",
            "district": row[4] or "",
        }
        if district and district.lower() not in doctor["district"].lower():
            continue
        if q and q.lower() not in " ".join(
            [doctor["doctor_name"], doctor["specialization"], doctor["hospital"]]
        ).lower():
            continue
        if doctor_type and not _specialization_matches(doctor_type, doctor["specialization"]):
            continue
        doctors.append(doctor)
    return doctors


def _resolve_doctor_id(doctor_id: Optional[int], doctor_type: Optional[str], district: Optional[str]) -> Optional[int]:
    if doctor_id:
        return doctor_id
    doctors = _list_matching_doctors(doctor_type or "", district or "")
    if doctors:
        return int(doctors[0]["doctor_id"])
    return None


def _fetch_patient_record(patient_id: Optional[int], phone: str = "", name: str = "") -> Optional[dict]:
    with engine.connect() as conn:
        if patient_id:
            row = conn.execute(
                text(
                    "SELECT id, user_id, name, age, gender, phone, village, district, "
                    "medical_history, asha_worker_id "
                    "FROM patients WHERE id=:pid"
                ),
                {"pid": patient_id},
            ).fetchone()
            if row:
                return {
                    "patient_id": row[0],
                    "user_id": row[1],
                    "name": row[2],
                    "age": row[3],
                    "gender": row[4],
                    "phone": row[5],
                    "village": row[6],
                    "district": row[7],
                    "medical_history": row[8],
                    "asha_worker_id": row[9],
                }

        if phone:
            rows = conn.execute(
                text(
                    "SELECT id, user_id, name, age, gender, phone, village, district, "
                    "medical_history, asha_worker_id "
                    "FROM patients WHERE phone IS NOT NULL"
                )
            ).fetchall()
            wanted = _normalize_phone(phone)
            for row in rows:
                if _normalize_phone(row[5]) == wanted:
                    return {
                        "patient_id": row[0],
                        "user_id": row[1],
                        "name": row[2],
                        "age": row[3],
                        "gender": row[4],
                        "phone": row[5],
                        "village": row[6],
                        "district": row[7],
                        "medical_history": row[8],
                        "asha_worker_id": row[9],
                    }

        if name:
            row = conn.execute(
                text(
                    "SELECT id, user_id, name, age, gender, phone, village, district, "
                    "medical_history, asha_worker_id "
                    "FROM patients WHERE LOWER(name) LIKE :name ORDER BY updated_at DESC LIMIT 1"
                ),
                {"name": f"%{name.lower()}%"},
            ).fetchone()
            if row:
                return {
                    "patient_id": row[0],
                    "user_id": row[1],
                    "name": row[2],
                    "age": row[3],
                    "gender": row[4],
                    "phone": row[5],
                    "village": row[6],
                    "district": row[7],
                    "medical_history": row[8],
                    "asha_worker_id": row[9],
                }
    return None


class VoiceBookingRequest(BaseModel):
    doctor_id: Optional[int] = None
    doctor_type: Optional[str] = None
    district: Optional[str] = None
    patient_id: Optional[int] = None
    patient_name: str
    patient_phone: Optional[str] = None
    age: Optional[int] = None
    village: Optional[str] = None
    reason: Optional[str] = None
    date: str
    time_slot: str


class VoiceRescheduleRequest(BaseModel):
    appt_id: int
    date: str
    time_slot: str


class VoiceCancelRequest(BaseModel):
    appt_id: int


class FollowupLogRequest(BaseModel):
    patient_id: Optional[int] = None
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    asha_user_id: Optional[int] = None
    asha_name: Optional[str] = None
    summary: str
    outcome: str = "stable"
    urgency: Optional[str] = "low"
    needs_handoff: bool = False
    requested_action: Optional[str] = None
    metadata: Optional[dict] = None


class SupportLogRequest(BaseModel):
    patient_id: Optional[int] = None
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    summary: str
    outcome: str = "resolved"
    urgency: Optional[str] = "low"
    requested_action: Optional[str] = None
    doctor_id: Optional[int] = None
    asha_user_id: Optional[int] = None
    metadata: Optional[dict] = None


class HandoffRequest(BaseModel):
    patient_id: Optional[int] = None
    patient_phone: Optional[str] = None
    patient_name: Optional[str] = None
    asha_user_id: Optional[int] = None
    asha_phone: Optional[str] = None
    fallback_phone: Optional[str] = None
    reason: Optional[str] = None


class TriggerFollowupRequest(BaseModel):
    patient_id: int
    phone_number: str
    patient_name: Optional[str] = None
    asha_user_id: Optional[int] = None
    asha_name: Optional[str] = None
    lang: str = "kn"


def _create_voice_log(
    *,
    agent_type: str,
    patient_id: Optional[int],
    doctor_id: Optional[int],
    asha_user_id: Optional[int],
    patient_name: Optional[str],
    patient_phone: Optional[str],
    summary: str,
    outcome: str,
    urgency: Optional[str],
    requested_action: Optional[str],
    needs_handoff: bool,
    handoff_target: Optional[str],
    metadata: Optional[dict],
) -> int:
    try:
        os.makedirs(os.path.dirname(VOICE_AGENT_LOG_FILE), exist_ok=True)
        payload = {
            "id": int(datetime.utcnow().timestamp() * 1000),
            "agent_type": agent_type,
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "asha_user_id": asha_user_id,
            "patient_name": patient_name,
            "patient_phone": patient_phone,
            "summary": summary,
            "outcome": outcome,
            "urgency": urgency,
            "requested_action": requested_action,
            "needs_handoff": needs_handoff,
            "handoff_target": handoff_target,
            "metadata": metadata or {},
            "created_at": _now_iso(),
        }
        with open(VOICE_AGENT_LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=True) + "\n")
        return int(payload["id"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save voice log: {exc}") from exc


def _read_voice_logs(limit: int = 50, agent_type: str = "", patient_id: Optional[int] = None) -> list[dict]:
    if not os.path.exists(VOICE_AGENT_LOG_FILE):
        return []
    rows: list[dict] = []
    with open(VOICE_AGENT_LOG_FILE, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except Exception:
                continue
            if agent_type and payload.get("agent_type") != agent_type:
                continue
            if patient_id is not None and payload.get("patient_id") != patient_id:
                continue
            rows.append(payload)
    rows.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
    return rows[:limit]


@router.get("/doctors")
async def lookup_doctors(
    doctor_type: str = Query(default=""),
    district: str = Query(default=""),
    q: str = Query(default=""),
    limit: int = Query(default=10, ge=1, le=25),
):
    doctors = _list_matching_doctors(doctor_type, district, q)[:limit]
    return {
        "success": True,
        "count": len(doctors),
        "doctors": doctors,
    }


@router.get("/logs")
async def get_voice_agent_logs(
    limit: int = Query(default=50, ge=1, le=200),
    agent_type: str = Query(default=""),
    patient_id: Optional[int] = None,
):
    logs = _read_voice_logs(limit=limit, agent_type=agent_type, patient_id=patient_id)
    return {"success": True, "count": len(logs), "logs": logs}


@router.get("/patients/lookup")
async def lookup_patient(
    patient_id: Optional[int] = None,
    phone: str = "",
    name: str = "",
):
    patient = _fetch_patient_record(patient_id=patient_id, phone=phone, name=name)
    if not patient:
        return {"success": False, "message": "Patient not found"}

    linked_doctor = None
    with engine.connect() as conn:
        if patient["patient_id"]:
            row = conn.execute(
                text(
                    "SELECT u.id, u.full_name, u.specialization, u.hospital "
                    "FROM doctor_patient_access dpa "
                    "JOIN users u ON u.id = dpa.doctor_id "
                    "WHERE dpa.patient_id = :pid AND COALESCE(dpa.is_active, 1) = 1 "
                    "ORDER BY dpa.granted_at DESC LIMIT 1"
                ),
                {"pid": patient["patient_id"]},
            ).fetchone()
            if row:
                linked_doctor = {
                    "doctor_id": row[0],
                    "doctor_name": row[1],
                    "specialization": row[2],
                    "hospital": row[3],
                }

    return {
        "success": True,
        "patient": patient,
        "linked_doctor": linked_doctor,
    }


@router.get("/appointments/slots")
async def voice_agent_slots(
    doctor_id: Optional[int] = None,
    doctor_type: str = "",
    district: str = "",
    date: str = "",
):
    resolved_doctor_id = _resolve_doctor_id(doctor_id, doctor_type, district)
    if not resolved_doctor_id:
        return {
            "success": False,
            "message": "No matching doctor found for this booking request.",
        }

    if not date:
        date = datetime.utcnow().date().isoformat()

    with engine.connect() as conn:
        booked = _get_booked_slots(conn, resolved_doctor_id, date)

    all_slots = [_slot_str(m) for m in WORKING_HOURS]
    free_slots = [slot for slot in all_slots if slot not in booked]
    return {
        "success": True,
        "doctor_id": resolved_doctor_id,
        "date": date,
        "free_slots": free_slots,
        "booked_slots": booked,
        "message": (
            f"Available slots on {date}: {', '.join(free_slots[:6])}"
            if free_slots
            else f"No slots available on {date}."
        ),
    }


@router.post("/appointments/book")
async def voice_agent_book(req: VoiceBookingRequest):
    resolved_doctor_id = _resolve_doctor_id(req.doctor_id, req.doctor_type, req.district)
    if not resolved_doctor_id:
        return {"success": False, "message": "No doctor available for that request right now."}

    patient = _fetch_patient_record(patient_id=req.patient_id, phone=req.patient_phone or "", name=req.patient_name)
    patient_id = patient["patient_id"] if patient else req.patient_id
    patient_phone = req.patient_phone or (patient["phone"] if patient else "")
    patient_name = req.patient_name or (patient["name"] if patient else "")

    with engine.begin() as conn:
        existing = conn.execute(
            text(
                "SELECT id FROM appointments WHERE doctor_id=:did AND appt_date=:d "
                "AND time_slot=:t AND status!='cancelled'"
            ),
            {"did": resolved_doctor_id, "d": req.date, "t": req.time_slot},
        ).fetchone()
        if existing:
            booked = _get_booked_slots(conn, resolved_doctor_id, req.date)
            free_slots = [_slot_str(m) for m in WORKING_HOURS if _slot_str(m) not in booked]
            return {
                "success": False,
                "error": f"{req.time_slot} is already booked",
                "free_slots": free_slots[:5],
                "message": f"That slot is taken. Available: {', '.join(free_slots[:3])}",
            }

        result = conn.execute(
            text(
                "INSERT INTO appointments "
                "(doctor_id, patient_id, patient_name, patient_phone, appt_date, time_slot, "
                "reason, status, created_at, updated_at) "
                "VALUES (:did, :pid, :pn, :pp, :d, :t, :r, 'confirmed', :now, :now)"
            ),
            {
                "did": resolved_doctor_id,
                "pid": patient_id,
                "pn": patient_name,
                "pp": patient_phone,
                "d": req.date,
                "t": req.time_slot,
                "r": req.reason or "",
                "now": _now_iso(),
            },
        )
        appt_id = int(result.lastrowid)

    queue_snapshot_change(
        "appointment",
        appt_id,
        patient_id=patient_id,
        actor_id=resolved_doctor_id,
        actor_role="voice_agent",
    )
    return {
        "success": True,
        "appt_id": appt_id,
        "doctor_id": resolved_doctor_id,
        "date": req.date,
        "time_slot": req.time_slot,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "message": f"Appointment confirmed for {req.date} at {req.time_slot}",
    }


@router.post("/appointments/reschedule")
async def voice_agent_reschedule(req: VoiceRescheduleRequest):
    with engine.begin() as conn:
        appointment = conn.execute(
            text(
                "SELECT id, doctor_id, patient_id FROM appointments "
                "WHERE id=:id AND status!='cancelled'"
            ),
            {"id": req.appt_id},
        ).fetchone()
        if not appointment:
            return {"success": False, "message": "Appointment not found."}

        slot_taken = conn.execute(
            text(
                "SELECT id FROM appointments WHERE doctor_id=:did AND appt_date=:d "
                "AND time_slot=:t AND status!='cancelled' AND id!=:id"
            ),
            {
                "did": appointment[1],
                "d": req.date,
                "t": req.time_slot,
                "id": req.appt_id,
            },
        ).fetchone()
        if slot_taken:
            booked = _get_booked_slots(conn, int(appointment[1]), req.date)
            free_slots = [_slot_str(m) for m in WORKING_HOURS if _slot_str(m) not in booked]
            return {
                "success": False,
                "message": "That slot is already taken.",
                "free_slots": free_slots[:5],
            }

        conn.execute(
            text(
                "UPDATE appointments SET appt_date=:d, time_slot=:t, updated_at=:now "
                "WHERE id=:id"
            ),
            {"d": req.date, "t": req.time_slot, "now": _now_iso(), "id": req.appt_id},
        )

    queue_snapshot_change(
        "appointment",
        req.appt_id,
        patient_id=int(appointment[2]) if appointment[2] is not None else None,
        actor_id=int(appointment[1]),
        actor_role="voice_agent",
    )
    return {
        "success": True,
        "appt_id": req.appt_id,
        "date": req.date,
        "time_slot": req.time_slot,
        "message": f"Appointment {req.appt_id} rescheduled to {req.date} at {req.time_slot}",
    }


@router.post("/appointments/cancel")
async def voice_agent_cancel(req: VoiceCancelRequest):
    with engine.begin() as conn:
        appointment = conn.execute(
            text("SELECT id, doctor_id, patient_id FROM appointments WHERE id=:id"),
            {"id": req.appt_id},
        ).fetchone()
        if not appointment:
            return {"success": False, "message": "Appointment not found."}
        conn.execute(
            text("UPDATE appointments SET status='cancelled', updated_at=:now WHERE id=:id"),
            {"id": req.appt_id, "now": _now_iso()},
        )

    queue_snapshot_change(
        "appointment",
        req.appt_id,
        patient_id=int(appointment[2]) if appointment[2] is not None else None,
        actor_id=int(appointment[1]),
        actor_role="voice_agent",
    )
    return {"success": True, "message": f"Appointment {req.appt_id} cancelled"}


@router.post("/followups/log")
async def log_followup(req: FollowupLogRequest):
    log_id = _create_voice_log(
        agent_type="asha_followup",
        patient_id=req.patient_id,
        doctor_id=None,
        asha_user_id=req.asha_user_id,
        patient_name=req.patient_name,
        patient_phone=req.patient_phone,
        summary=req.summary,
        outcome=req.outcome,
        urgency=req.urgency,
        requested_action=req.requested_action,
        needs_handoff=req.needs_handoff,
        handoff_target=None,
        metadata=req.metadata,
    )
    return {"success": True, "log_id": log_id, "message": "Follow-up saved"}


@router.post("/support/log")
async def log_support_call(req: SupportLogRequest):
    log_id = _create_voice_log(
        agent_type="patient_support",
        patient_id=req.patient_id,
        doctor_id=req.doctor_id,
        asha_user_id=req.asha_user_id,
        patient_name=req.patient_name,
        patient_phone=req.patient_phone,
        summary=req.summary,
        outcome=req.outcome,
        urgency=req.urgency,
        requested_action=req.requested_action,
        needs_handoff=False,
        handoff_target=None,
        metadata=req.metadata,
    )
    return {"success": True, "log_id": log_id, "message": "Support call saved"}


@router.post("/handoffs/asha")
async def transfer_to_asha(req: HandoffRequest):
    patient = _fetch_patient_record(patient_id=req.patient_id, phone=req.patient_phone or "", name=req.patient_name or "")
    asha_user_id = req.asha_user_id or (patient["asha_worker_id"] if patient else None)
    patient_id = patient["patient_id"] if patient else req.patient_id
    patient_name = req.patient_name or (patient["name"] if patient else None)
    patient_phone = req.patient_phone or (patient["phone"] if patient else None)

    target_phone = req.asha_phone or req.fallback_phone or ""
    asha_name = "ASHA Worker"
    if asha_user_id:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT full_name FROM users WHERE id=:id AND role='asha'"),
                {"id": asha_user_id},
            ).fetchone()
            if row:
                asha_name = row[0] or asha_name

    if not target_phone:
        raise HTTPException(status_code=404, detail="ASHA phone number not provided. Pass asha_phone or fallback_phone.")

    log_id = _create_voice_log(
        agent_type="handoff_request",
        patient_id=patient_id,
        doctor_id=None,
        asha_user_id=asha_user_id,
        patient_name=patient_name,
        patient_phone=patient_phone,
        summary=req.reason or "Patient requested ASHA handoff",
        outcome="handoff_requested",
        urgency="medium",
        requested_action="transfer_to_asha",
        needs_handoff=True,
        handoff_target=target_phone,
        metadata={"asha_name": asha_name},
    )
    return {
        "success": True,
        "log_id": log_id,
        "asha_user_id": asha_user_id,
        "asha_name": asha_name,
        "target_phone": target_phone,
        "message": f"Connect the caller to {asha_name} at {target_phone}",
    }


@router.post("/trigger-followup")
async def trigger_followup(req: TriggerFollowupRequest):
    retell_api_key = os.getenv("RETELL_API_KEY", "").strip()
    retell_agent_id = os.getenv("RETELL_ASHA_AGENT_ID", "").strip()
    from_number = os.getenv("RETELL_FROM_NUMBER", "").strip()

    if not retell_api_key:
        raise HTTPException(status_code=500, detail="RETELL_API_KEY is not configured.")
    if not retell_agent_id:
        raise HTTPException(status_code=500, detail="RETELL_ASHA_AGENT_ID is not configured.")
    if not from_number:
        raise HTTPException(status_code=500, detail="RETELL_FROM_NUMBER is not configured.")

    patient = _fetch_patient_record(patient_id=req.patient_id, phone=req.phone_number, name=req.patient_name or "")
    patient_name = req.patient_name or (patient["name"] if patient else None) or "Patient"
    patient_phone = req.phone_number or (patient["phone"] if patient else "")
    asha_user_id = req.asha_user_id or (patient["asha_worker_id"] if patient else None)
    asha_name = req.asha_name or "ASHA Worker"

    if asha_user_id and not req.asha_name:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT full_name FROM users WHERE id=:id AND role='asha'"),
                {"id": asha_user_id},
            ).fetchone()
            if row and row[0]:
                asha_name = row[0]

    payload = {
        "from_number": from_number,
        "to_number": patient_phone,
        "override_agent_id": retell_agent_id,
        "metadata": {
            "patient_id": req.patient_id,
            "patient_name": patient_name,
            "asha_user_id": asha_user_id,
            "asha_name": asha_name,
            "agent_type": "asha_followup",
        },
        "retell_llm_dynamic_variables": {
            "patient_name": patient_name,
            "asha_name": asha_name,
            "language": req.lang,
        },
    }

    headers = {
        "Authorization": f"Bearer {retell_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.retellai.com/v2/create-phone-call",
                json=payload,
                headers=headers,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Retell request failed: {exc}") from exc

    data = response.json() if response.content else {}
    if response.status_code != 201:
        raise HTTPException(
            status_code=500,
            detail=f"Retell call failed: {data or response.text}",
        )

    log_id = _create_voice_log(
        agent_type="asha_followup_trigger",
        patient_id=req.patient_id,
        doctor_id=None,
        asha_user_id=asha_user_id,
        patient_name=patient_name,
        patient_phone=patient_phone,
        summary="Outbound ASHA follow-up call initiated",
        outcome="call_initiated",
        urgency="low",
        requested_action="retell_outbound_call",
        needs_handoff=False,
        handoff_target=None,
        metadata={
            "retell_call_id": data.get("call_id"),
            "retell_agent_id": data.get("agent_id"),
            "retell_status": data.get("call_status"),
        },
    )

    return {
        "success": True,
        "status": "call_initiated",
        "log_id": log_id,
        "retell_response": data,
    }
