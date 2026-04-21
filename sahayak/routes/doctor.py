"""
Sahayak AI — Doctor portal routes.
Doctors access patient records via patient-generated share codes.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from pydantic import BaseModel

from db.database import get_db, User, Patient, MedicalReport, Checkup, DoctorPatientAccess
from routes.auth import get_current_user

router = APIRouter(prefix="/doctor", tags=["Doctor"])


def require_doctor(user: User = Depends(get_current_user)) -> User:
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Doctor access only")
    return user


# ── Access patient via share code ─────────────────────────
class ShareCodeRequest(BaseModel):
    share_code: str


@router.post("/access-patient")
async def access_patient(
    req: ShareCodeRequest,
    doctor: User = Depends(require_doctor),
    db: Session = Depends(get_db),
):
    """Doctor enters patient share code to get access."""
    patient = (
        db.query(Patient)
        .filter(
            Patient.share_code == req.share_code.upper().strip(),
            Patient.share_code_active == True,
            ~Patient.share_code.like("DEMO_%")
        )
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Invalid or expired share code. Ask the patient for their code.")

    # Record access — use raw SQL to avoid issues with missing columns on old DBs
    from db.database import engine
    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT id FROM doctor_patient_access WHERE doctor_id=:did AND patient_id=:pid"),
            {"did": doctor.id, "pid": patient.id},
        ).fetchone()

        if not existing:
            # INSERT with is_active=1 — column guaranteed by migration
            conn.execute(
                text(
                    "INSERT INTO doctor_patient_access (doctor_id, patient_id, is_active, granted_at) "
                    "VALUES (:did, :pid, 1, CURRENT_TIMESTAMP)"
                ),
                {"did": doctor.id, "pid": patient.id},
            )
        else:
            conn.execute(
                text("UPDATE doctor_patient_access SET is_active=1 WHERE id=:id"),
                {"id": existing[0]},
            )
    from services.sync_service import queue_doctor_access_change
    queue_doctor_access_change(doctor.id, patient.id, actor_id=doctor.id, actor_role=doctor.role)

    return {"patient_id": patient.id, "patient_name": patient.name, "message": "Access granted"}


# ── Get doctor's patient list ─────────────────────────────
@router.get("/patients")
async def get_my_patients(
    search: Optional[str] = Query(None),
    doctor: User = Depends(require_doctor),
    db: Session = Depends(get_db),
):
    """Return all patients this doctor has access to."""
    import logging
    _log = logging.getLogger("sahayak.doctor")

    try:
        # Use raw SQL to avoid ORM issues with missing columns on old DBs
        rows = db.execute(
            text(
                "SELECT patient_id FROM doctor_patient_access "
                "WHERE doctor_id = :did AND (is_active IS NULL OR is_active != 0)"
            ),
            {"did": doctor.id},
        ).fetchall()
    except Exception as exc:
        _log.error("get_my_patients query failed: %s", exc)
        # Fallback: return all access records for this doctor ignoring is_active
        try:
            rows = db.execute(
                text("SELECT patient_id FROM doctor_patient_access WHERE doctor_id = :did"),
                {"did": doctor.id},
            ).fetchall()
        except Exception as exc2:
            _log.error("get_my_patients fallback failed: %s", exc2)
            return []

    patient_ids = [r[0] for r in rows]
    if not patient_ids:
        return []

    query = db.query(Patient).filter(Patient.id.in_(patient_ids))
    if search:
        query = query.filter(Patient.name.ilike(f"%{search}%"))

    patients = query.all()
    result = []
    for p in patients:
        try:
            last_report = (
                db.query(MedicalReport)
                .filter(MedicalReport.patient_id == p.id)
                .order_by(MedicalReport.created_at.desc())
                .first()
            )
            total = db.query(MedicalReport).filter(MedicalReport.patient_id == p.id).count()
        except Exception:
            last_report = None
            total = 0

        result.append({
            "id":               p.id,
            "name":             p.name,
            "age":              p.age,
            "gender":           p.gender,
            "village":          p.village,
            "district":         getattr(p, "district", None),
            "diagnosis":        getattr(p, "diagnosis", None),
            "last_report_date": last_report.created_at.isoformat() if last_report else None,
            "last_risk_level":  (last_report.ai_risk_level or last_report.risk_level) if last_report else None,
            "total_reports":    total,
        })
    return result


# ── Get full patient detail for doctor ───────────────────
@router.get("/patient/{patient_id}")
async def get_patient_detail(
    patient_id: int,
    doctor: User = Depends(require_doctor),
    db: Session = Depends(get_db),
):
    """Full patient detail — doctor must have access."""
    access = (
        db.query(DoctorPatientAccess)
        .filter(
            DoctorPatientAccess.doctor_id == doctor.id,
            DoctorPatientAccess.patient_id == patient_id,
            DoctorPatientAccess.is_active == True,
        )
        .first()
    )
    if not access:
        raise HTTPException(status_code=403, detail="No access to this patient. Ask patient for their share code.")

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    reports = (
        db.query(MedicalReport)
        .filter(MedicalReport.patient_id == patient_id)
        .order_by(MedicalReport.created_at.desc())
        .all()
    )

    checkups = (
        db.query(Checkup)
        .filter(Checkup.patient_id == patient_id)
        .order_by(Checkup.checkup_date.desc())
        .all()
    )

    return {
        "patient": {
            "id": patient.id, "name": patient.name, "age": patient.age,
            "gender": patient.gender, "blood_group": patient.blood_group,
            "phone": patient.phone, "village": patient.village,
            "district": patient.district, "medical_history": patient.medical_history,
        },
        "reports": [
            {
                "id": r.id, "title": r.report_title, "type": r.report_type,
                "date": r.created_at.isoformat(), "bp": r.bp, "hr": r.hr,
                "temp": r.temp, "spo2": r.spo2, "sugar_fasting": r.sugar_fasting,
                "sugar_post": r.sugar_post, "cholesterol": r.cholesterol,
                "hemoglobin": r.hemoglobin, "creatinine": r.creatinine,
                "diagnosis": r.diagnosis, "medications": r.medications,
                "ai_analysis": r.ai_analysis, "ai_risk_level": r.ai_risk_level,
                "ai_summary": r.ai_summary, "risk_level": r.risk_level,
            }
            for r in reports
        ],
        "checkups": [
            {
                "id": c.id, "date": c.checkup_date.isoformat(),
                "next": c.next_checkup.isoformat() if c.next_checkup else None,
                "doctor": c.doctor_name, "hospital": c.hospital,
                "reason": c.reason, "findings": c.findings, "medications": c.medications,
            }
            for c in checkups
        ],
        "stats": {
            "total_reports":  len(reports),
            "total_checkups": len(checkups),
            "latest_risk":    reports[0].ai_risk_level if reports else None,
        },
    }
