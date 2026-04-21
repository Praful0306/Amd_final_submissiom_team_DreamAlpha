from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from db.database import get_db
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/rate-limit/status")
async def rate_limit_status(request: Request):
    """Real rate limit status for the calling IP."""
    from middleware.rate_limit import get_status
    fwd = request.headers.get("X-Forwarded-For")
    ip  = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    return get_status(ip)


@router.get("/stats")
async def get_stats(
    request: Request,
    db: Session = Depends(get_db),
    uid: str = "",          # firebase_uid from query param
    user_id: str = "",      # local user_id from query param
):
    """
    Live stats from DB — scoped to the requesting user.
    Patients see their own reports count.
    ASHA workers see stats for patients they registered.
    Doctors see stats for their patient list.
    Falls back to global if no uid provided (backward compat).
    """
    try:
        from db.database import Patient, DiagnosisLog, User
        from datetime import datetime, timedelta

        # Try to get uid from Authorization header too
        if not uid and not user_id:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                from services.firebase_auth import verify_firebase_token, firebase_is_configured
                if firebase_is_configured():
                    fb = verify_firebase_token(auth[7:])
                    if fb:
                        uid = fb["uid"]
                if not uid:
                    from services.auth_service import decode_token
                    payload = decode_token(auth[7:])
                    if payload:
                        user_id = str(payload.get("sub", ""))

        week_ago = datetime.utcnow() - timedelta(days=7)

        # Scope queries by user
        if uid:
            # Firebase-based isolation
            user = db.query(User).filter(User.firebase_uid == uid).first()
            if user:
                user_id = str(user.id)
                if user.role == "patient":
                    total = db.query(Patient).filter(Patient.firebase_uid == uid).count()
                    total = max(total, 1)  # patient sees at least themselves
                    high  = db.query(DiagnosisLog).filter(
                        DiagnosisLog.firebase_uid == uid,
                        DiagnosisLog.risk_level.in_(["HIGH","EMERGENCY"]),
                        DiagnosisLog.created_at >= week_ago,
                    ).count()
                elif user.role == "asha":
                    total = db.query(Patient).filter(
                        Patient.asha_firebase_uid == uid
                    ).count()
                    high  = db.query(DiagnosisLog).filter(
                        DiagnosisLog.firebase_uid == uid,
                        DiagnosisLog.risk_level.in_(["HIGH","EMERGENCY"]),
                        DiagnosisLog.created_at >= week_ago,
                    ).count()
                else:  # doctor
                    from db.database import DoctorPatientAccess
                    access = db.query(DoctorPatientAccess).filter(
                        DoctorPatientAccess.doctor_id == user.id,
                        DoctorPatientAccess.is_active == True,
                    ).all()
                    pids = [a.patient_id for a in access]
                    total = len(pids)
                    high  = db.query(DiagnosisLog).filter(
                        DiagnosisLog.patient_id.in_(pids),
                        DiagnosisLog.risk_level.in_(["HIGH","EMERGENCY"]),
                        DiagnosisLog.created_at >= week_ago,
                    ).count() if pids else 0
            else:
                total, high = 0, 0
        elif user_id and user_id.isdigit():
            uid_int = int(user_id)
            user = db.query(User).filter(User.id == uid_int).first()
            if user and user.role == "asha":
                total = db.query(Patient).filter(Patient.asha_worker_id == uid_int).count()
            elif user and user.role == "patient":
                total = db.query(Patient).filter(Patient.user_id == uid_int).count()
                total = max(total, 1)
            else:
                total = db.query(Patient).filter(~Patient.share_code.like("DEMO_%")).count()
            high = db.query(DiagnosisLog).filter(
                DiagnosisLog.user_id == uid_int,
                DiagnosisLog.risk_level.in_(["HIGH","EMERGENCY"]),
                DiagnosisLog.created_at >= week_ago,
            ).count()
        else:
            # No user context — return global (ASHA demo, /health endpoint)
            total = db.query(Patient).filter(~Patient.share_code.like("DEMO_%")).count()
            high  = db.query(DiagnosisLog).filter(
                DiagnosisLog.risk_level.in_(["HIGH","EMERGENCY"]),
                DiagnosisLog.created_at >= week_ago,
            ).count()

        return {"total_patients": total, "high_risk_7days": high}

    except Exception as e:
        logger.warning(f"Stats query failed: {e}")
        return {"total_patients": 0, "high_risk_7days": 0}
