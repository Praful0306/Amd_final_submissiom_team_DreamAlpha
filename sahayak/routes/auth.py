"""
Sahayak AI — Authentication routes
Supports BOTH Firebase Auth (primary) and legacy JWT (fallback).

Firebase flow:
  Frontend signs in with Firebase SDK → gets ID token
  Sends: POST /auth/firebase-login  {id_token, role}
  Backend verifies token, creates/gets local user record
  Returns: {user_id, firebase_uid, role, full_name, patient_id}

Legacy JWT flow (kept for backward compatibility):
  POST /auth/register  — still works
  POST /auth/login     — still works
"""
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.database import get_db, User, Patient
from services.auth_service import (
    hash_password, verify_password, create_access_token,
    decode_token, generate_share_code,
)

router = APIRouter(prefix="/auth", tags=["Auth"])
bearer = HTTPBearer(auto_error=False)


# ── Schemas ───────────────────────────────────────────────────────────────────

class FirebaseLoginRequest(BaseModel):
    id_token: str
    role:     str = "patient"   # sent by frontend on first login

class RegisterRequest(BaseModel):
    email:      str = Field(..., min_length=5)
    password:   str = Field(..., min_length=6)
    full_name:  str = Field(default="", min_length=0)
    name:       str = Field(default="", min_length=0)
    role:       str = "patient"
    # Doctor fields
    specialization:   Optional[str] = None
    registration_num: Optional[str] = None
    hospital:         Optional[str] = None
    # Patient fields
    age:     Optional[int] = None
    gender:  Optional[str] = None
    phone:   Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None

    @property
    def resolved_name(self) -> str:
        return (self.full_name or self.name or "User").strip()

class LoginRequest(BaseModel):
    email:    str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str
    user_id:      int
    full_name:    str
    firebase_uid: Optional[str] = None
    patient_id:   Optional[int] = None


# ── Auth dependency — accepts BOTH Firebase tokens AND legacy JWTs ─────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = credentials.credentials

    # Try Firebase first
    try:
        from services.firebase_auth import verify_firebase_token, firebase_is_configured
        if firebase_is_configured():
            fb = verify_firebase_token(token)
            if fb:
                user = db.query(User).filter(User.firebase_uid == fb["uid"]).first()
                if not user:
                    user = db.query(User).filter(User.email == fb["email"].lower()).first()
                if user and user.is_active:
                    return user
    except Exception:
        pass

    # Fall back to legacy JWT
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


# ── NEW: Firebase Auth endpoint ───────────────────────────────────────────────

@router.post("/firebase-login")
async def firebase_login(req: FirebaseLoginRequest, db: Session = Depends(get_db)):
    """
    Called by frontend after Firebase signs in the user.
    Verifies the Firebase ID token, creates/gets local DB record.
    Returns user info for the frontend to store in localStorage.
    """
    from services.firebase_auth import verify_firebase_token, get_or_create_firebase_user

    fb = verify_firebase_token(req.id_token)
    if not fb:
        raise HTTPException(status_code=401, detail="Invalid Firebase token")

    user = get_or_create_firebase_user(
        uid=fb["uid"],
        email=fb["email"],
        name=fb.get("name", ""),
        role=req.role,
        db=db,
    )

    patient_id = None
    if user.role == "patient":
        p = db.query(Patient).filter(Patient.user_id == user.id).first()
        if p:
            patient_id = p.id

    # Also issue a legacy token for any endpoints that still use it
    token = create_access_token({"sub": user.id, "role": user.role, "fuid": fb["uid"]})

    return {
        "access_token": token,
        "token_type":   "bearer",
        "role":         user.role,
        "user_id":      user.id,
        "full_name":    user.full_name,
        "firebase_uid": fb["uid"],
        "patient_id":   patient_id,
    }


@router.get("/firebase-config")
async def get_firebase_config():
    """
    Returns the Firebase client config for the frontend.
    Reads from FIREBASE_WEB_CONFIG env var (JSON string).
    Set this in .env so you never hardcode API keys in HTML.
    """
    import os, json
    cfg_str = os.getenv("FIREBASE_WEB_CONFIG", "")
    if cfg_str:
        try:
            return {"config": json.loads(cfg_str), "available": True}
        except Exception:
            pass
    return {"config": None, "available": False,
            "message": "Set FIREBASE_WEB_CONFIG in .env (JSON from Firebase Console)"}


# ── Legacy JWT endpoints (kept for backward compatibility) ────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email.lower()).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if req.role not in ("patient", "doctor", "asha"):
        raise HTTPException(status_code=400, detail="Role must be patient, doctor, or asha")

    user = User(
        email=req.email.lower(),
        password_hash=hash_password(req.password),
        full_name=req.resolved_name,
        role=req.role,
        specialization=req.specialization,
        registration_num=req.registration_num,
        hospital=req.hospital,
        district=req.district,
    )
    db.add(user)
    db.flush()

    patient_id = None
    if req.role == "patient":
        share = generate_share_code()
        while db.query(Patient).filter(Patient.share_code == share).first():
            share = generate_share_code()
        patient = Patient(
            user_id=user.id,
            firebase_uid=None,   # linked after Firebase login
            name=req.resolved_name,
            age=req.age or 0,
            gender=req.gender or "Not specified",
            email=req.email.lower(),
            phone=req.phone,
            village=req.village,
            district=req.district,
            share_code=share,
            share_code_active=True,
        )
        db.add(patient)
        db.flush()
        patient_id = patient.id

    db.commit()
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("user", user.id, actor_id=user.id, actor_role=user.role)
    if patient_id:
        queue_snapshot_change("patient", patient_id, actor_id=user.id, actor_role=user.role)
    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(
        access_token=token, role=user.role, user_id=user.id,
        full_name=user.full_name, patient_id=patient_id,
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")

    patient_id = None
    if user.role == "patient":
        p = db.query(Patient).filter(Patient.user_id == user.id).first()
        if p:
            patient_id = p.id

    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(
        access_token=token, role=user.role, user_id=user.id,
        full_name=user.full_name, firebase_uid=user.firebase_uid,
        patient_id=patient_id,
    )


@router.get("/me")
async def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = {
        "id":           user.id,
        "email":        user.email,
        "full_name":    user.full_name,
        "role":         user.role,
        "firebase_uid": user.firebase_uid,
        "hospital":     user.hospital,
        "specialization": user.specialization,
    }
    if user.role == "patient":
        p = db.query(Patient).filter(Patient.user_id == user.id).first()
        if p:
            result["patient_id"] = p.id
            result["share_code"] = p.share_code
    return result


@router.post("/regenerate-share-code")
async def regenerate_share_code(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can regenerate share codes")
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    new_code = generate_share_code()
    while db.query(Patient).filter(Patient.share_code == new_code).first():
        new_code = generate_share_code()
    patient.share_code = new_code
    db.commit()
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("patient", patient.id, actor_id=user.id, actor_role=user.role)
    return {"share_code": new_code, "message": "Share code regenerated"}


# ── Share-code endpoints used by the patient portal ──────────────────────────

@router.get("/share-code")
async def get_share_code(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current patient's share code + active status."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patient access only")
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return {
        "code":       patient.share_code,
        "active":     bool(patient.share_code_active),
        "expires_at": None,   # codes don't expire on a fixed date — revoke manually
        "patient_id": patient.id,
    }


@router.post("/generate-share-code")
async def generate_share_code_endpoint(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate (or regenerate) the patient's share code."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patient access only")
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    new_code = generate_share_code()
    while db.query(Patient).filter(Patient.share_code == new_code).first():
        new_code = generate_share_code()
    patient.share_code        = new_code
    patient.share_code_active = True
    db.commit()
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("patient", patient.id, actor_id=user.id, actor_role=user.role)
    return {
        "code":       new_code,
        "active":     True,
        "expires_at": None,
        "message":    "Share code generated",
    }


@router.post("/revoke-share-code")
async def revoke_share_code(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deactivate the patient's share code — doctor loses access immediately."""
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patient access only")
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    patient.share_code_active = False
    db.commit()
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("patient", patient.id, actor_id=user.id, actor_role=user.role)
    return {"message": "Access revoked", "active": False}
