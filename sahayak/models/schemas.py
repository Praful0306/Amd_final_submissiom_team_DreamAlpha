"""
Sahayak AI — Pydantic request/response schemas.
Used by routes/diagnose.py, routes/patient.py, routes/referral.py,
routes/reports.py, routes/transcribe.py.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field, field_validator


# ── Diagnosis ─────────────────────────────────────────────────────────────────

class DiagnoseRequest(BaseModel):
    symptoms: str = Field(..., min_length=1, description="Symptom description")
    patient_id: Optional[Union[int, str]] = None
    patient_name: Optional[str] = None
    vitals: Optional[str] = None
    additional_context: Optional[str] = None
    lang: Optional[str] = "en"

    @field_validator("patient_id", mode="before")
    @classmethod
    def coerce_patient_id(cls, v):
        if v == "" or v is None:
            return None
        return v


class DiagnoseResponse(BaseModel):
    risk_level: str = "MEDIUM"
    diagnosis: Optional[str] = None
    summary: Optional[str] = None
    disease_name: Optional[str] = None
    confidence_pct: Optional[int] = None
    refer_to_hospital: Optional[bool] = None
    clinical_summary: Optional[str] = None
    recommendations: Optional[List[str]] = None
    action_items: Optional[List[str]] = None
    medications_suggested: Optional[List[str]] = None
    warning_signs: Optional[List[str]] = None
    followup_days: Optional[int] = None
    sources: Optional[List[str]] = None
    community_alert: Optional[str] = None


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1)
    lang: Optional[str] = "en"


class TTSResponse(BaseModel):
    message: str
    file_path: str


# ── Patient ───────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    age: int = Field(..., ge=0, le=150)
    gender: str = Field(..., pattern="^(male|female|other)$")
    phone: Optional[str] = None
    email: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    medical_history: Optional[str] = None
    is_pregnant: Optional[bool] = False
    weight_kg: Optional[float] = None
    blood_group: Optional[str] = None
    user_id: Optional[int] = None
    firebase_uid: Optional[str] = None
    asha_worker_id: Optional[int] = None
    asha_firebase_uid: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    medical_history: Optional[str] = None
    is_pregnant: Optional[bool] = None
    weight_kg: Optional[float] = None
    blood_group: Optional[str] = None


class PatientResponse(BaseModel):
    id: int
    name: str
    age: int
    gender: str
    phone: Optional[str] = None
    email: Optional[str] = None
    village: Optional[str] = None
    district: Optional[str] = None
    medical_history: Optional[str] = None
    is_pregnant: Optional[bool] = None
    weight_kg: Optional[float] = None
    blood_group: Optional[str] = None
    share_code: Optional[str] = None
    share_code_active: Optional[bool] = None
    firebase_uid: Optional[str] = None
    user_id: Optional[int] = None
    asha_worker_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Referral ──────────────────────────────────────────────────────────────────

class ReferralRequest(BaseModel):
    patient_id: int
    diagnosis: str
    recommendations: Optional[str] = None
    referring_doctor: Optional[str] = "ASHA Worker"
    referred_to: Optional[str] = "District Hospital"
    notes: Optional[str] = None


class ReferralResponse(BaseModel):
    message: str
    file_path: str


# ── Medical Reports ───────────────────────────────────────────────────────────

class MedicalReportCreate(BaseModel):
    patient_id: int
    report_title: Optional[str] = None
    report_type: Optional[str] = None
    # Vitals
    bp: Optional[str] = None
    hr: Optional[Union[int, str]] = None
    temp: Optional[Union[float, str]] = None
    spo2: Optional[Union[int, str]] = None
    weight_kg: Optional[Union[float, str]] = None
    # Lab values
    sugar_fasting: Optional[Union[float, str]] = None
    sugar_post: Optional[Union[float, str]] = None
    cholesterol: Optional[Union[float, str]] = None
    hemoglobin: Optional[Union[float, str]] = None
    creatinine: Optional[Union[float, str]] = None
    # Clinical
    symptoms: Optional[str] = None
    diagnosis: Optional[str] = None
    medications: Optional[str] = None
    notes: Optional[str] = None
    risk_level: Optional[str] = None
    # AI fields
    ai_risk_level: Optional[str] = None
    ai_summary: Optional[str] = None
    ai_confidence: Optional[int] = None
    is_ai_extracted: Optional[bool] = False

    @field_validator("hr", "spo2", mode="before")
    @classmethod
    def coerce_int_field(cls, v):
        if v == "" or v is None:
            return None
        try:
            return int(float(str(v)))
        except (ValueError, TypeError):
            return None

    @field_validator("temp", "sugar_fasting", "sugar_post", "cholesterol", "hemoglobin",
                     "creatinine", "weight_kg", mode="before")
    @classmethod
    def coerce_float_field(cls, v):
        if v == "" or v is None:
            return None
        try:
            return float(str(v).replace(",", "."))
        except (ValueError, TypeError):
            return None


class MedicalReportResponse(BaseModel):
    id: int
    patient_id: int
    report_title: Optional[str] = None
    report_type: Optional[str] = None
    bp: Optional[str] = None
    hr: Optional[int] = None
    temp: Optional[float] = None
    spo2: Optional[int] = None
    weight_kg: Optional[float] = None
    sugar_fasting: Optional[float] = None
    sugar_post: Optional[float] = None
    cholesterol: Optional[float] = None
    hemoglobin: Optional[float] = None
    creatinine: Optional[float] = None
    symptoms: Optional[str] = None
    diagnosis: Optional[str] = None
    medications: Optional[str] = None
    notes: Optional[str] = None
    risk_level: Optional[str] = None
    ai_risk_level: Optional[str] = None
    ai_summary: Optional[str] = None
    ai_confidence: Optional[int] = None
    is_ai_extracted: Optional[bool] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("hr", "spo2", "ai_confidence", mode="before")
    @classmethod
    def _coerce_int(cls, v):
        if v is None or v == "":
            return None
        try:
            return int(float(str(v)))
        except (ValueError, TypeError):
            return None

    @field_validator("temp", "weight_kg", "sugar_fasting", "sugar_post",
                     "cholesterol", "hemoglobin", "creatinine", mode="before")
    @classmethod
    def _coerce_float(cls, v):
        if v is None or v == "":
            return None
        try:
            return float(str(v))
        except (ValueError, TypeError):
            return None


class ExtractionResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    fields_filled: Optional[int] = None
    completion_pct: Optional[int] = None
    missing_fields: Optional[List[str]] = None
    risk_level: Optional[str] = None
    clinical_summary: Optional[str] = None
    error: Optional[str] = None


# ── Transcription ─────────────────────────────────────────────────────────────

class TranscribeResponse(BaseModel):
    text: str
    duration: Optional[float] = None
    language: Optional[str] = None
