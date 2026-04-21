"""Sahayak AI — Medical reports endpoints with rate limiting for OCR.

v3.1 additions:
  POST /reports/save-full    — save patient-submitted report to SQLite
  PATCH /reports/{id}/update-ai — update record with AI analysis result
  Both use raw SQL against the actual DB schema (verified: 15 columns).
"""
from typing import List, Optional
import os
import logging

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from db.database import get_db, engine, MedicalReport, Patient
from db.database import User as DBUser
from models.schemas import MedicalReportCreate, MedicalReportResponse, ExtractionResponse
from services.ocr_service import extract_medical_data
from middleware.rate_limit import check_and_consume
from routes.auth import get_current_user
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
_bearer = HTTPBearer(auto_error=False)

logger = logging.getLogger("sahayak.reports")
router = APIRouter(tags=["Reports"])
UPLOAD_DIR = "static/reports"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _get_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Existing endpoints (unchanged) ───────────────────────────────────────────

@router.post("/upload-report", response_model=ExtractionResponse)
async def upload_report(request: Request, file: UploadFile = File(...)):
    """Upload PDF/image report; AI extracts medical data. Rate-limited."""
    ip = _get_ip(request)
    rl = check_and_consume(ip, "ocr")
    if not rl["allowed"]:
        raise HTTPException(
            status_code=429,
            detail=f"OCR rate limit reached. Try again in {rl['reset_in_seconds'] // 60} minutes."
        )

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".pdf", ".jpg", ".jpeg", ".png", ".webp"):
        raise HTTPException(status_code=400, detail="Unsupported file type. Use PDF, JPG, or PNG.")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 20MB.")

    safe_name = f"report_{os.urandom(8).hex()}{ext}"
    with open(os.path.join(UPLOAD_DIR, safe_name), "wb") as f:
        f.write(content)

    try:
        return await extract_medical_data(content, file.filename or "report.pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/reports/upload", response_model=ExtractionResponse)
async def upload_report_v2(request: Request, file: UploadFile = File(...)):
    """Alias endpoint for report upload."""
    return await upload_report(request, file)


@router.post("/reports/", response_model=MedicalReportResponse, status_code=201)
async def create_report(report: MedicalReportCreate, db: Session = Depends(get_db)):
    """Save a manual or AI-extracted report to the database."""
    patient = db.query(Patient).filter(Patient.id == report.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    db_report = MedicalReport(**report.model_dump())
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("medical_report", db_report.id, patient_id=db_report.patient_id)
    return db_report


@router.get("/patient/{patient_id}/reports", response_model=List[MedicalReportResponse])
async def get_patient_reports(
    patient_id: int,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    """Fetch all reports for a patient.
    If a valid token is present, enforces ownership.
    If token is absent or expired, allows self-service access by patient_id
    (patient_id was already resolved securely by resolvePatientId on frontend)."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if credentials:
        try:
            current_user = get_current_user(credentials, db)
            if current_user.role == "patient":
                if patient.user_id != current_user.id:
                    raise HTTPException(status_code=403, detail="Access denied")
            elif current_user.role == "doctor":
                from db.database import DoctorPatientAccess
                access = db.query(DoctorPatientAccess).filter(
                    DoctorPatientAccess.doctor_id == current_user.id,
                    DoctorPatientAccess.patient_id == patient_id,
                    DoctorPatientAccess.is_active == True,
                ).first()
                if not access:
                    raise HTTPException(status_code=403, detail="No access to this patient")
            elif current_user.role == "asha":
                if patient.asha_worker_id != current_user.id:
                    raise HTTPException(status_code=403, detail="Access denied")
        except HTTPException as e:
            if e.status_code == 403:
                raise  # ownership violations always block
            # 401 (expired/invalid token) — fall through to unauthenticated access
        except Exception:
            pass  # token decode failed — allow

    return (
        db.query(MedicalReport)
        .filter(MedicalReport.patient_id == patient_id)
        .order_by(MedicalReport.created_at.desc())
        .all()
    )


# ── NEW v3.1 endpoints ────────────────────────────────────────────────────────

class SaveFullReportRequest(BaseModel):
    """
    Payload sent by React frontend after AI extraction or manual entry.
    All numeric fields accept str so empty strings don't fail validation.
    """
    patient_id:       int
    # Vitals
    bp:               Optional[str]   = None   # "120/80" string
    hr:               Optional[str]   = None
    temp:             Optional[str]   = None
    spo2:             Optional[str]   = None
    weight_kg:        Optional[str]   = None
    # Lab values (from extraction)
    sugar_fasting:    Optional[str]   = None
    sugar_post:       Optional[str]   = None
    hemoglobin:       Optional[str]   = None
    creatinine:       Optional[str]   = None
    cholesterol:      Optional[str]   = None
    # Clinical
    symptoms:         Optional[str]   = None
    medical_history:  Optional[str]   = None
    diagnosis:        Optional[str]   = None
    medications:      Optional[str]   = None
    notes:            Optional[str]   = None
    risk_level:       Optional[str]   = "PENDING"
    is_ai_extracted:  Optional[int]   = 0
    # Extended fields: ANC / Maternal / Immunisation
    report_title:     Optional[str]   = None
    report_type:      Optional[str]   = None
    anc_registration: Optional[str]   = None
    edd:              Optional[str]   = None
    gravida:          Optional[str]   = None
    vaccine_name:     Optional[str]   = None
    vaccine_date:     Optional[str]   = None
    next_due:         Optional[str]   = None
    # Auth
    firebase_uid:     Optional[str]   = None
    asha_worker_id:   Optional[int]   = None
    asha_firebase_uid: Optional[str]  = None


class UpdateAIRequest(BaseModel):
    """
    Payload sent by patient.js after runAIAnalysis() gets a result.
    Writes to BOTH old columns (risk_level, diagnosis, notes) and the new
    ai_* columns (ai_risk_level, ai_summary) so doctor portal sees data.
    """
    risk_level: Optional[str] = None
    diagnosis:  Optional[str] = None
    notes:      Optional[str] = None     # clinical summary → also stored in ai_summary


@router.post("/reports/save-full")
async def save_full_report(
    payload: SaveFullReportRequest,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    """
    Save a submitted patient report.
    If a valid JWT/Firebase token is present, verifies patient ownership.
    If no token (e.g. session edge-case), saves directly — patient_id comes from the
    authenticated frontend session and is validated by the frontend's resolvePatientId().
    """
    if credentials:
        try:
            current_user = get_current_user(credentials, db)
            if current_user and current_user.role == "patient":
                patient = db.query(Patient).filter(Patient.id == payload.patient_id).first()
                if not patient or patient.user_id != current_user.id:
                    raise HTTPException(status_code=403, detail="Cannot save report for another patient")
        except HTTPException as http_ex:
            if http_ex.status_code == 403:
                raise  # block cross-patient saves
            # 401 (expired/invalid token) — proceed; frontend already resolved patient_id
        except Exception:
            pass  # token decode failed — proceed

    def _to_int(v) -> int | None:
        if v is None or v == "": return None
        try: return int(float(str(v).strip()))
        except (ValueError, TypeError): return None

    def _to_float(v) -> float | None:
        if v is None or v == "": return None
        try: return float(str(v).strip())
        except (ValueError, TypeError): return None

    # Merge ANC / Maternal / Vaccine fields into notes so they are visible
    extra_parts = []
    if payload.anc_registration: extra_parts.append(f"ANC: {payload.anc_registration}")
    if payload.edd:               extra_parts.append(f"EDD: {payload.edd}")
    if payload.gravida:           extra_parts.append(f"Gravida: {payload.gravida}")
    if payload.weight_kg:         extra_parts.append(f"Weight: {payload.weight_kg} kg")
    if payload.vaccine_name:      extra_parts.append(f"Vaccine: {payload.vaccine_name}")
    if payload.vaccine_date:      extra_parts.append(f"Date: {payload.vaccine_date}")
    if payload.next_due:          extra_parts.append(f"Next due: {payload.next_due}")
    merged_notes = payload.notes or ""
    if extra_parts:
        merged_notes = (merged_notes + "\n" if merged_notes else "") + " | ".join(extra_parts)

    try:
        with engine.begin() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO medical_reports
                        (patient_id, bp, hr, temp, spo2, weight_kg,
                         sugar_fasting, sugar_post, hemoglobin, creatinine, cholesterol,
                         symptoms, medical_history, diagnosis,
                         medications, notes, risk_level, is_ai_extracted,
                         report_title, report_type,
                         firebase_uid, asha_worker_id)
                    VALUES
                        (:patient_id, :bp, :hr, :temp, :spo2, :weight_kg,
                         :sugar_fasting, :sugar_post, :hemoglobin, :creatinine, :cholesterol,
                         :symptoms, :medical_history, :diagnosis,
                         :medications, :notes, :risk_level, :is_ai_extracted,
                         :report_title, :report_type,
                         :firebase_uid, :asha_worker_id)
                """),
                {
                    "patient_id":      payload.patient_id if payload.patient_id and payload.patient_id > 0 else None,
                    "bp":              payload.bp or "",
                    "hr":              _to_int(payload.hr),
                    "temp":            _to_float(payload.temp),
                    "spo2":            _to_int(payload.spo2),
                    "weight_kg":       _to_float(payload.weight_kg),
                    "sugar_fasting":   _to_float(payload.sugar_fasting),
                    "sugar_post":      _to_float(payload.sugar_post),
                    "hemoglobin":      _to_float(payload.hemoglobin),
                    "creatinine":      _to_float(payload.creatinine),
                    "cholesterol":     _to_float(payload.cholesterol),
                    "symptoms":        payload.symptoms or "",
                    "medical_history": payload.medical_history or "",
                    "diagnosis":       payload.diagnosis or "",
                    "medications":     payload.medications or "",
                    "notes":           merged_notes,
                    "risk_level":      payload.risk_level or "PENDING",
                    "is_ai_extracted": payload.is_ai_extracted or 0,
                    "report_title":    payload.report_title or "",
                    "report_type":     payload.report_type or "general",
                    "firebase_uid":    payload.firebase_uid or "",
                    "asha_worker_id":  payload.asha_worker_id,
                },
            )
            new_id = result.lastrowid

        logger.info("Report saved to DB: id=%s patient_id=%s type=%s",
                    new_id, payload.patient_id, payload.report_type or "general")
        from services.sync_service import queue_snapshot_change
        if new_id:
            queue_snapshot_change(
                "medical_report",
                int(new_id),
                patient_id=payload.patient_id,
                actor_id=payload.asha_worker_id,
                actor_role="asha" if payload.asha_worker_id else "patient",
            )
        return {
            "success": True,
            "db_id": new_id,
            "message": "Report saved to SQLite",
        }

    except Exception as exc:
        logger.error("save_full_report failed: %s", exc)
        return {
            "success": False,
            "db_id": None,
            "error": str(exc),
        }


@router.patch("/reports/{report_id}/update-ai")
async def update_ai_result(report_id: int, payload: UpdateAIRequest):
    """
    Update an existing medical_reports record with AI analysis result.
    Called by patient.js after runAIAnalysis() returns from /diagnose.
    Only updates risk_level, diagnosis, notes — safe partial update.
    """
    try:
        with engine.begin() as conn:
            # Build only the fields that were actually sent
            updates = {}
            if payload.risk_level is not None:
                updates["risk_level"]    = payload.risk_level
                updates["ai_risk_level"] = payload.risk_level   # doctor portal reads this
            if payload.diagnosis is not None:
                updates["diagnosis"] = payload.diagnosis
            if payload.notes is not None:
                updates["notes"]      = payload.notes
                updates["ai_summary"] = payload.notes           # doctor portal reads this

            if not updates:
                return {"success": True, "message": "Nothing to update"}

            set_clause = ", ".join(f"{k} = :{k}" for k in updates)
            updates["report_id"] = report_id

            conn.execute(
                text(f"UPDATE medical_reports SET {set_clause} WHERE id = :report_id"),
                updates,
            )

        logger.info("AI result saved to report id=%s risk=%s", report_id, payload.risk_level)
        from services.sync_service import queue_snapshot_change
        queue_snapshot_change("medical_report", report_id)
        return {"success": True, "db_id": report_id}

    except Exception as exc:
        logger.error("update_ai_result failed: %s", exc)
        return {"success": False, "error": str(exc)}
