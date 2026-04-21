"""
Sahayak AI — Patient Management Routes (ASHA creates patients, doctors book appointments)

New endpoints:
  POST /patients/create-by-asha  — ASHA registers a patient with phone, links to herself
  GET  /patients/my-patients     — ASHA gets all patients she registered
  GET  /patients/{id}/full       — Full patient profile with latest vitals
  POST /patients/{id}/profile    — Patient updates their own profile (phone, age, etc.)
  POST /appointments/book        — Book a doctor appointment
  GET  /appointments/today       — Today's appointments for a doctor
  GET  /appointments/slots       — Available slots for a doctor on a date
  POST /appointments/cancel      — Cancel an appointment
"""

import os
import logging
from typing import Optional, List
from datetime import datetime, date, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from db.database import get_db, User, Patient, engine
from routes.auth import get_current_user

logger = logging.getLogger("sahayak.patients_mgmt")

router = APIRouter(tags=["Patient Management"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreatePatientRequest(BaseModel):
    """ASHA creates a patient record with full profile."""
    name:            str
    phone:           str          # REQUIRED — needed for VAPI outbound calls
    age:             Optional[int]  = 0
    gender:          Optional[str]  = "Not specified"
    village:         Optional[str]  = None
    district:        Optional[str]  = None
    medical_history: Optional[str]  = None
    is_pregnant:     Optional[bool] = False
    blood_group:     Optional[str]  = None
    # ASHA identification
    asha_firebase_uid: Optional[str] = None
    asha_worker_id:    Optional[int] = None

class UpdateProfileRequest(BaseModel):
    """Patient updates their own profile."""
    name:            Optional[str]  = None
    phone:           Optional[str]  = None
    age:             Optional[int]  = None
    gender:          Optional[str]  = None
    village:         Optional[str]  = None
    district:        Optional[str]  = None
    medical_history: Optional[str]  = None
    blood_group:     Optional[str]  = None
    is_pregnant:     Optional[bool] = None
    weight_kg:       Optional[float]= None

class BookAppointmentRequest(BaseModel):
    doctor_id:   int
    patient_id:  Optional[int] = None
    date:        str            # YYYY-MM-DD
    time_slot:   str            # HH:MM e.g. "10:30"
    reason:      Optional[str] = None
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    firebase_uid:  Optional[str] = None


# ── Patient creation by ASHA ──────────────────────────────────────────────────

@router.post("/patients/create-by-asha")
async def create_patient_by_asha(
    req: CreatePatientRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    ASHA creates a patient record. The patient is linked to this ASHA worker.
    Phone number is required — used for VAPI outbound calls.
    Returns the patient's share_code so they can link to their own account.
    """
    from services.auth_service import generate_share_code

    # Resolve ASHA identity from token
    asha_uid = req.asha_firebase_uid or ""
    asha_id  = req.asha_worker_id or 0

    auth_hdr = request.headers.get("Authorization", "")
    # ALWAYS extract user identity from token — more reliable than request body
    if auth_hdr.startswith("Bearer "):
        try:
            from services.firebase_auth import verify_firebase_token, firebase_is_configured
            if firebase_is_configured():
                fb = verify_firebase_token(auth_hdr[7:])
                if fb:
                    asha_uid = fb["uid"]
                    user = db.query(User).filter(User.firebase_uid == asha_uid).first()
                    if user:
                        asha_id = user.id
        except Exception:
            pass
        if not asha_uid:
            try:
                from services.auth_service import decode_token
                pl = decode_token(auth_hdr[7:])
                if pl:
                    tok_id = int(pl.get("sub", 0) or 0)
                    if tok_id:
                        asha_id = tok_id  # ALWAYS trust token over request body
            except Exception:
                pass

    # Validate phone
    phone = req.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    # Check if patient with same phone already exists under this ASHA
    existing = db.query(Patient).filter(
        Patient.phone == phone,
        Patient.asha_firebase_uid == asha_uid if asha_uid else Patient.asha_worker_id == asha_id
    ).first()
    if existing:
        return {
            "success": True,
            "patient_id": existing.id,
            "share_code": existing.share_code,
            "message": "Patient already registered",
            "is_existing": True,
        }

    # Generate unique share code
    share = generate_share_code()
    while db.query(Patient).filter(Patient.share_code == share).first():
        share = generate_share_code()

    # Create patient (no user account needed — ASHA creates on their behalf)
    patient = Patient(
        name=req.name.strip(),
        age=req.age or 0,
        gender=req.gender or "Not specified",
        phone=phone,
        village=req.village,
        district=req.district or (
            db.query(User).filter(User.id == asha_id).first().district
            if asha_id else None
        ),
        medical_history=req.medical_history,
        is_pregnant=req.is_pregnant or False,
        blood_group=req.blood_group,
        share_code=share,
        share_code_active=True,
        asha_worker_id=asha_id or None,
        asha_firebase_uid=asha_uid or None,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("patient", patient.id, actor_id=asha_id or None, actor_role="asha")

    logger.info("ASHA %s created patient: %s (id=%d)", asha_uid[:8] if asha_uid else asha_id, req.name, patient.id)
    return {
        "success":    True,
        "patient_id": patient.id,
        "share_code": share,
        "name":       patient.name,
        "phone":      patient.phone,
        "message":    f"Patient {req.name} registered. Share code: {share}",
        "is_existing": False,
    }


@router.get("/patients/my-patients")
async def get_my_patients_asha(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    ASHA gets all patients she registered — for her dashboard list.
    Scoped strictly to this ASHA worker.
    """
    asha_uid = ""
    asha_id  = 0

    auth_hdr = request.headers.get("Authorization", "")
    if auth_hdr.startswith("Bearer "):
        try:
            from services.firebase_auth import verify_firebase_token, firebase_is_configured
            if firebase_is_configured():
                fb = verify_firebase_token(auth_hdr[7:])
                if fb:
                    asha_uid = fb["uid"]
        except Exception:
            pass
        if not asha_uid:
            try:
                from services.auth_service import decode_token
                pl = decode_token(auth_hdr[7:])
                if pl:
                    tok_id = int(pl.get("sub", 0) or 0)
                    if tok_id:
                        asha_id = tok_id  # Trust token
            except Exception:
                pass

    if not asha_uid and not asha_id:
        return []

    # Query patients registered by this ASHA
    # Uses OR logic to catch: correct asha_worker_id, Firebase uid, OR
    # patients with NULL asha_worker_id (saved when bootstrap hadn't run yet)
    # ALSO repairs orphaned patients by setting their asha_worker_id on read
    from sqlalchemy import or_, and_
    if asha_uid:
        patients = db.query(Patient).filter(
            or_(
                Patient.asha_firebase_uid == asha_uid,
                and_(Patient.asha_worker_id == None, Patient.user_id == None,
                     ~Patient.share_code.like("DEMO_%")),
            ),
            ~Patient.share_code.like("DEMO_%"),
        ).order_by(Patient.created_at.desc()).all()
    else:
        # Also include recently-added patients with NULL asha_worker_id
        # if they were registered in the same session (no owner at all)
        patients = db.query(Patient).filter(
            or_(
                Patient.asha_worker_id == asha_id,
                # Catch patients saved without asha_worker_id (bootstrap timing issue)
                # These have no user_id, no asha_worker_id, no firebase_uid = likely just added
                and_(Patient.asha_worker_id == None,
                     Patient.user_id == None,
                     Patient.firebase_uid == None,
                     ~Patient.share_code.like("DEMO_%")),
            ),
            ~Patient.share_code.like("DEMO_%"),
        ).order_by(Patient.created_at.desc()).all()
        # Repair: set asha_worker_id on orphaned patients so they show correctly next time
        for p in patients:
            if p.asha_worker_id is None and p.user_id is None:
                p.asha_worker_id = asha_id
        try:
            db.commit()
        except Exception:
            pass

    return [
        {
            "id":             p.id,
            "name":           p.name,
            "age":            p.age,
            "gender":         p.gender,
            "phone":          p.phone,
            "village":        p.village,
            "district":       p.district,
            "share_code":     p.share_code,
            "is_pregnant":    p.is_pregnant,
            "blood_group":    p.blood_group,
            "medical_history": p.medical_history,
            "registered_at":  p.created_at.isoformat() if p.created_at else None,
        }
        for p in patients
    ]


@router.post("/patients/{patient_id}/profile")
async def update_patient_profile(
    patient_id: int,
    req: UpdateProfileRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Patient updates their own profile — or ASHA updates a patient they registered.
    Also syncs to backend DB so doctor can see latest info.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Build update dict with only the fields that were provided
    updates: dict = {}
    if req.name is not None:            updates["name"]            = req.name.strip()
    if req.phone is not None:           updates["phone"]           = req.phone.strip()
    if req.age is not None:             updates["age"]             = req.age
    if req.gender is not None:          updates["gender"]          = req.gender
    if req.village is not None:         updates["village"]         = req.village
    if req.district is not None:        updates["district"]        = req.district
    if req.medical_history is not None: updates["medical_history"] = req.medical_history
    if req.blood_group is not None:     updates["blood_group"]     = req.blood_group
    if req.is_pregnant is not None:     updates["is_pregnant"]     = req.is_pregnant
    if req.weight_kg is not None:       updates["weight_kg"]       = req.weight_kg

    if not updates:
        return {"success": True, "patient_id": patient_id, "message": "No changes"}

    # Use raw SQL to avoid ORM column-existence issues (e.g. updated_at migration)
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["_pid"] = patient_id
    try:
        with engine.begin() as conn:
            conn.execute(
                text(f"UPDATE patients SET {set_clause} WHERE id = :_pid"),
                updates,
            )
    except Exception as exc:
        logger.error("update_patient_profile DB error: %s", exc)
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("patient", patient_id)
    logger.info("Patient %d profile updated: %s", patient_id, list(updates.keys()))
    return {"success": True, "patient_id": patient_id, "message": "Profile updated"}


@router.get("/patients/{patient_id}/full")
async def get_patient_full(patient_id: int, db: Session = Depends(get_db)):
    """Full patient profile + latest 5 reports + latest vitals."""
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")

    with engine.connect() as conn:
        reports = conn.execute(
            text("SELECT id, report_type, bp, hr, temp, spo2, symptoms, diagnosis, "
                 "medications, risk_level, ai_risk_level, ai_summary, created_at "
                 "FROM medical_reports WHERE patient_id=:pid "
                 "ORDER BY created_at DESC LIMIT 5"),
            {"pid": patient_id}
        ).fetchall()

    latest = reports[0] if reports else None
    return {
        "id":             p.id,
        "name":           p.name,
        "age":            p.age,
        "gender":         p.gender,
        "phone":          p.phone,
        "village":        p.village,
        "district":       p.district,
        "blood_group":    p.blood_group,
        "medical_history": p.medical_history,
        "is_pregnant":    p.is_pregnant,
        "share_code":     p.share_code,
        "latest_bp":      latest[2] if latest else None,
        "latest_risk":    (latest[9] or latest[10] or "UNKNOWN") if latest else "UNKNOWN",
        "latest_diagnosis": latest[7] if latest else None,
        "current_medications": latest[8] if latest else None,
        "recent_reports": [
            {"id": r[0], "type": r[1], "bp": r[2], "spo2": r[5],
             "diagnosis": r[7], "risk": r[9] or r[10], "date": str(r[12])[:10]}
            for r in reports
        ],
    }


# ── Share Code endpoints ──────────────────────────────────────────────────────

@router.get("/patients/{patient_id}/share-code")
async def get_share_code(patient_id: int, db: Session = Depends(get_db)):
    """
    Get the patient's current share code. If none exists, generate one.
    Used by the DoctorAccess page to show/share the code.
    """
    from services.auth_service import generate_share_code as _gen

    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Generate a code if the patient doesn't have one yet
    if not p.share_code:
        code = _gen()
        while db.query(Patient).filter(Patient.share_code == code).first():
            code = _gen()
        p.share_code        = code
        p.share_code_active = True
        db.commit()
        db.refresh(p)
        from services.sync_service import queue_snapshot_change
        queue_snapshot_change("patient", p.id, actor_id=p.user_id, actor_role="patient")

    from datetime import timedelta
    expires_dt = datetime.utcnow() + timedelta(days=30)
    return {
        "code":       p.share_code,
        "active":     p.share_code_active,
        "expires_at": expires_dt.isoformat() + "Z",
        "patient_id": patient_id,
    }


@router.post("/patients/{patient_id}/generate-share-code")
async def generate_new_share_code(patient_id: int, db: Session = Depends(get_db)):
    """
    Generate a fresh share code for the patient (old one becomes invalid).
    """
    from services.auth_service import generate_share_code as _gen

    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")

    code = _gen()
    while db.query(Patient).filter(Patient.share_code == code, Patient.id != patient_id).first():
        code = _gen()

    p.share_code        = code
    p.share_code_active = True
    p.updated_at        = datetime.utcnow()
    db.commit()
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("patient", p.id, actor_id=p.user_id, actor_role="patient")

    from datetime import timedelta
    expires_dt = datetime.utcnow() + timedelta(days=30)
    logger.info("New share code generated for patient %d", patient_id)
    return {
        "code":       code,
        "active":     True,
        "expires_at": expires_dt.isoformat() + "Z",
        "patient_id": patient_id,
        "message":    "New share code generated — share with your doctor",
    }


@router.post("/patients/{patient_id}/revoke-share")
async def revoke_share_code(patient_id: int, db: Session = Depends(get_db)):
    """
    Deactivate the patient's share code so no doctor can access records.
    """
    p = db.query(Patient).filter(Patient.id == patient_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")

    p.share_code_active = False
    p.updated_at        = datetime.utcnow()
    db.commit()
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("patient", p.id, actor_id=p.user_id, actor_role="patient")

    logger.info("Share code revoked for patient %d", patient_id)
    return {"ok": True, "message": "Share code revoked — doctor access disabled"}


# ── Appointments ──────────────────────────────────────────────────────────────

SLOT_DURATION_MINS = 20
WORKING_HOURS = list(range(9 * 60, 17 * 60, SLOT_DURATION_MINS))  # 09:00–17:00


def _slot_str(minutes: int) -> str:
    return f"{minutes//60:02d}:{minutes%60:02d}"


def _get_booked_slots(conn, doctor_id: int, date_str: str) -> list:
    rows = conn.execute(
        text("SELECT time_slot FROM appointments "
             "WHERE doctor_id=:did AND appt_date=:d AND status!='cancelled'"),
        {"did": doctor_id, "d": date_str}
    ).fetchall()
    return [r[0] for r in rows]


@router.get("/appointments/slots")
async def get_available_slots(
    doctor_id: int,
    date: str = "",
    db: Session = Depends(get_db),
):
    """Return available appointment slots for a doctor on a given date."""
    if not date:
        date = datetime.utcnow().date().isoformat()

    try:
        with engine.connect() as conn:
            booked = _get_booked_slots(conn, doctor_id, date)
    except Exception:
        booked = []

    all_slots  = [_slot_str(m) for m in WORKING_HOURS]
    free_slots = [s for s in all_slots if s not in booked]
    return {
        "date":        date,
        "doctor_id":   doctor_id,
        "all_slots":   all_slots,
        "free_slots":  free_slots,
        "booked_slots": booked,
        "total_free":  len(free_slots),
    }


@router.get("/appointments/today")
async def get_todays_appointments(
    doctor_id: int,
    db: Session = Depends(get_db),
):
    """All appointments for a doctor today."""
    today = datetime.utcnow().date().isoformat()
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT id, time_slot, patient_id, patient_name, patient_phone, "
                     "reason, status, created_at "
                     "FROM appointments WHERE doctor_id=:did AND appt_date=:d "
                     "AND status!='cancelled' ORDER BY time_slot"),
                {"did": doctor_id, "d": today}
            ).fetchall()
        return {
            "date": today,
            "appointments": [
                {"id": r[0], "time": r[1], "patient_id": r[2], "patient_name": r[3],
                 "phone": r[4], "reason": r[5], "status": r[6]}
                for r in rows
            ],
            "total": len(rows),
        }
    except Exception as exc:
        logger.error("get_todays_appointments: %s", exc)
        return {"date": today, "appointments": [], "total": 0}


@router.post("/appointments/book")
async def book_appointment(req: BookAppointmentRequest, request: Request):
    """
    Book an appointment slot. Returns error if slot is already taken.
    Also called by VAPI agent when patient calls in.
    """
    try:
        # Check slot availability
        with engine.begin() as conn:
            existing = conn.execute(
                text("SELECT id FROM appointments WHERE doctor_id=:did "
                     "AND appt_date=:d AND time_slot=:t AND status!='cancelled'"),
                {"did": req.doctor_id, "d": req.date, "t": req.time_slot}
            ).fetchone()

            if existing:
                # Slot taken — suggest alternatives
                booked = _get_booked_slots(conn, req.doctor_id, req.date)
                free   = [_slot_str(m) for m in WORKING_HOURS if _slot_str(m) not in booked]
                return {
                    "success": False,
                    "error":   f"{req.time_slot} is already booked",
                    "message": f"That slot is taken. Available: {', '.join(free[:3])}",
                    "free_slots": free[:5],
                }

            result = conn.execute(
                text("INSERT INTO appointments "
                     "(doctor_id, patient_id, patient_name, patient_phone, appt_date, "
                     "time_slot, reason, status, firebase_uid, created_at) "
                     "VALUES (:did, :pid, :pn, :pp, :d, :t, :r, 'confirmed', :fuid, :now)"),
                {
                    "did":  req.doctor_id,
                    "pid":  req.patient_id,
                    "pn":   req.patient_name or "",
                    "pp":   req.patient_phone or "",
                    "d":    req.date,
                    "t":    req.time_slot,
                    "r":    req.reason or "",
                    "fuid": req.firebase_uid or "",
                    "now":  datetime.utcnow().isoformat(),
                }
            )
            appt_id = result.lastrowid

        logger.info("Appointment booked: doctor=%d date=%s time=%s", req.doctor_id, req.date, req.time_slot)
        from services.sync_service import queue_snapshot_change
        if appt_id:
            queue_snapshot_change(
                "appointment",
                appt_id,
                patient_id=req.patient_id,
                actor_id=req.doctor_id,
                actor_role="doctor",
            )
        return {
            "success":    True,
            "appt_id":    appt_id,
            "date":       req.date,
            "time":       req.time_slot,
            "doctor_id":  req.doctor_id,
            "message":    f"Appointment confirmed for {req.date} at {req.time_slot}",
        }
    except Exception as exc:
        logger.error("book_appointment: %s", exc)
        return {"success": False, "error": str(exc)}


@router.post("/appointments/cancel")
async def cancel_appointment(payload: dict):
    """Cancel an appointment by ID."""
    appt_id = payload.get("appt_id")
    if not appt_id:
        return {"success": False, "error": "appt_id required"}
    try:
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE appointments SET status='cancelled' WHERE id=:id"),
                {"id": appt_id}
            )
        from services.sync_service import queue_snapshot_change
        queue_snapshot_change("appointment", int(appt_id))
        return {"success": True, "message": f"Appointment {appt_id} cancelled"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


# ── Patient → linked doctor ───────────────────────────────────────────────────

@router.get("/patients/{patient_id}/my-doctor")
async def get_patient_linked_doctor(patient_id: int, db: Session = Depends(get_db)):
    """Return the first active doctor linked to this patient via share code."""
    from db.database import DoctorPatientAccess
    access = (
        db.query(DoctorPatientAccess)
        .filter(
            DoctorPatientAccess.patient_id == patient_id,
            DoctorPatientAccess.is_active   == True,
        )
        .first()
    )
    if not access:
        return {"doctor_id": None, "doctor_name": None, "specialization": None}

    doc = db.query(User).filter(User.id == access.doctor_id).first()
    return {
        "doctor_id":      access.doctor_id,
        "doctor_name":    doc.full_name       if doc else None,
        "specialization": doc.specialization  if doc else None,
        "hospital":       doc.hospital        if doc else None,
    }


# ── Next available slots (today → tomorrow fallback) ─────────────────────────

@router.get("/appointments/next-slots")
async def get_next_available_slots(doctor_id: int):
    """
    Returns today's free slots; if none available today, returns tomorrow's.
    Used by the call-centre frontend to include in the Make.com/VAPI webhook.
    """
    today = datetime.utcnow().date()
    result: dict = {
        "doctor_id":      doctor_id,
        "today_date":     str(today),
        "today_slots":    [],
        "tomorrow_date":  str(today + timedelta(days=1)),
        "tomorrow_slots": [],
        "recommended_date":  str(today),
        "recommended_slots": [],
    }

    for offset in range(2):
        d_str = str(today + timedelta(days=offset))
        try:
            with engine.connect() as conn:
                booked = _get_booked_slots(conn, doctor_id, d_str)
        except Exception:
            booked = []

        free = [_slot_str(m) for m in WORKING_HOURS if _slot_str(m) not in booked]
        if offset == 0:
            result["today_slots"] = free
        else:
            result["tomorrow_slots"] = free

    # Prefer today; fall back to tomorrow
    if result["today_slots"]:
        result["recommended_date"]  = result["today_date"]
        result["recommended_slots"] = result["today_slots"]
    else:
        result["recommended_date"]  = result["tomorrow_date"]
        result["recommended_slots"] = result["tomorrow_slots"]

    return result


# ── Doctor manual appointment ─────────────────────────────────────────────────

class ManualAppointmentRequest(BaseModel):
    doctor_id:     int
    patient_name:  str
    patient_phone: Optional[str] = None
    patient_id:    Optional[int] = None
    date:          str            # YYYY-MM-DD
    time_slot:     str            # HH:MM
    reason:        Optional[str] = None
    is_priority:   bool = True    # manual appointments are always priority


@router.post("/appointments/manual-add")
async def add_manual_appointment(req: ManualAppointmentRequest):
    """
    Doctor adds a manual/priority appointment.
    is_manual=1 ensures the AI booking agent skips this slot.
    Returns error if slot is already taken.
    """
    try:
        with engine.begin() as conn:
            existing = conn.execute(
                text("SELECT id FROM appointments WHERE doctor_id=:did "
                     "AND appt_date=:d AND time_slot=:t AND status!='cancelled'"),
                {"did": req.doctor_id, "d": req.date, "t": req.time_slot},
            ).fetchone()

            if existing:
                return {"success": False, "error": f"Slot {req.time_slot} on {req.date} is already booked"}

            # Ensure is_manual column exists (safe no-op if already present)
            try:
                conn.execute(text("ALTER TABLE appointments ADD COLUMN is_manual INTEGER DEFAULT 0"))
            except Exception:
                pass  # column already exists

            result = conn.execute(
                text("INSERT INTO appointments "
                     "(doctor_id, patient_id, patient_name, patient_phone, appt_date, "
                     "time_slot, reason, status, is_manual, created_at) "
                     "VALUES (:did, :pid, :pn, :pp, :d, :t, :r, 'confirmed', 1, :now)"),
                {
                    "did": req.doctor_id,
                    "pid": req.patient_id,
                    "pn":  req.patient_name,
                    "pp":  req.patient_phone or "",
                    "d":   req.date,
                    "t":   req.time_slot,
                    "r":   req.reason or "Manual appointment",
                    "now": datetime.utcnow().isoformat(),
                },
            )
        logger.info("Manual appt added: doctor=%d %s %s", req.doctor_id, req.date, req.time_slot)
        from services.sync_service import queue_snapshot_change
        if result.lastrowid:
            queue_snapshot_change(
                "appointment",
                result.lastrowid,
                patient_id=req.patient_id,
                actor_id=req.doctor_id,
                actor_role="doctor",
            )
        return {
            "success":  True,
            "appt_id":  result.lastrowid,
            "date":     req.date,
            "time":     req.time_slot,
            "message":  f"Priority appointment added for {req.date} at {req.time_slot}",
        }
    except Exception as exc:
        logger.error("add_manual_appointment: %s", exc)
        return {"success": False, "error": str(exc)}


# ── Doctor's appointment list (today + upcoming) ──────────────────────────────

@router.get("/appointments/list")
async def get_doctor_appointments(doctor_id: int, days: int = 7):
    """
    Returns appointments for a doctor for the next `days` days.
    Used by the doctor's Appointments page.
    """
    today = datetime.utcnow().date()
    end   = today + timedelta(days=days)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, appt_date, time_slot, patient_id, patient_name, "
                    "patient_phone, reason, status, "
                    "COALESCE(is_manual, 0) as is_manual "
                    "FROM appointments "
                    "WHERE doctor_id=:did AND appt_date>=:start AND appt_date<=:end "
                    "AND status!='cancelled' "
                    "ORDER BY appt_date, time_slot"
                ),
                {"did": doctor_id, "start": str(today), "end": str(end)},
            ).fetchall()
        return [
            {
                "id":           r[0],
                "date":         r[1],
                "time":         r[2],
                "patient_id":   r[3],
                "patient_name": r[4],
                "phone":        r[5],
                "reason":       r[6],
                "status":       r[7],
                "is_manual":    bool(r[8]),
                "is_today":     r[1] == str(today),
            }
            for r in rows
        ]
    except Exception as exc:
        logger.error("get_doctor_appointments: %s", exc)
        return []
