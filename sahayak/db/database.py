"""
Sahayak AI — Database models.
All data stored in local SQLite — zero cloud sync of PII.
"""
from sqlalchemy import (
    create_engine, Column, Integer, String, Text,
    DateTime, Float, Boolean, ForeignKey
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    """Authentication user — patient, doctor, or ASHA worker."""
    __tablename__ = "users"
    id           = Column(Integer, primary_key=True, index=True)
    email        = Column(String(150), unique=True, nullable=False, index=True)
    password_hash= Column(String(255), nullable=False)
    full_name    = Column(String(150), nullable=False)
    role         = Column(String(10), default="patient")  # "patient" | "doctor" | "asha"
    is_active    = Column(Boolean, default=True)
    # Firebase Auth UID — primary identifier after migration
    firebase_uid = Column(String(128), nullable=True, unique=True, index=True)
    # Doctor-specific fields
    specialization    = Column(String(100), nullable=True)
    registration_num  = Column(String(50), nullable=True)
    hospital          = Column(String(150), nullable=True)
    # ASHA-specific fields
    district     = Column(String(100), nullable=True)
    village      = Column(String(100), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)


class Patient(Base):
    __tablename__ = "patients"
    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name            = Column(String(100), nullable=False)
    age             = Column(Integer, nullable=False)
    gender          = Column(String(10), nullable=False)
    phone           = Column(String(20), nullable=True)
    email           = Column(String(100), nullable=True)
    village         = Column(String(100), nullable=True)
    district        = Column(String(100), nullable=True)
    medical_history = Column(Text, nullable=True)
    is_pregnant     = Column(Boolean, default=False)
    weight_kg       = Column(Float, nullable=True)
    blood_group     = Column(String(5), nullable=True)
    # Share code for doctor access
    share_code      = Column(String(20), nullable=True, unique=True, index=True)
    share_code_active = Column(Boolean, default=True)
    # Firebase UID of the patient (for direct lookup without patient_id)
    firebase_uid    = Column(String(128), nullable=True, index=True)
    # ASHA worker who registered this patient (for isolation)
    asha_worker_id  = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    asha_firebase_uid = Column(String(128), nullable=True, index=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Relationships
    reports         = relationship("MedicalReport", backref="patient", lazy="dynamic")
    checkups        = relationship("Checkup", backref="patient", lazy="dynamic")


class MedicalReport(Base):
    __tablename__ = "medical_reports"
    id              = Column(Integer, primary_key=True, index=True)
    patient_id      = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    report_title    = Column(String(200), nullable=True)
    report_type     = Column(String(50), nullable=True)  # blood_test, xray, ecg, endoscopy, etc.
    # Vitals
    bp              = Column(String(20), nullable=True)
    hr              = Column(Integer, nullable=True)
    temp            = Column(String(10), nullable=True)
    spo2            = Column(Integer, nullable=True)
    weight_kg       = Column(Float, nullable=True)
    # Lab values
    sugar_fasting   = Column(Float, nullable=True)
    sugar_post      = Column(Float, nullable=True)
    cholesterol     = Column(Float, nullable=True)
    hemoglobin      = Column(Float, nullable=True)
    creatinine      = Column(Float, nullable=True)
    # Clinical data
    symptoms        = Column(Text, nullable=True)
    medical_history = Column(Text, nullable=True)
    diagnosis       = Column(Text, nullable=True)
    medications     = Column(Text, nullable=True)
    notes           = Column(Text, nullable=True)
    risk_level      = Column(String(20), nullable=True)
    # AI analysis
    ai_analysis     = Column(Text, nullable=True)
    ai_risk_level   = Column(String(20), nullable=True)
    ai_confidence   = Column(Integer, nullable=True)
    ai_summary      = Column(Text, nullable=True)
    # File
    file_path       = Column(String(255), nullable=True)
    original_filename = Column(String(255), nullable=True)
    is_ai_extracted = Column(Integer, default=0)
    created_at      = Column(DateTime, default=datetime.utcnow)


class Checkup(Base):
    __tablename__ = "checkups"
    id              = Column(Integer, primary_key=True, index=True)
    patient_id      = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    checkup_date    = Column(DateTime, nullable=False)
    next_checkup    = Column(DateTime, nullable=True)
    doctor_name     = Column(String(150), nullable=True)
    hospital        = Column(String(200), nullable=True)
    reason          = Column(Text, nullable=True)
    findings        = Column(Text, nullable=True)
    medications     = Column(Text, nullable=True)
    follow_up_notes = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


class DoctorPatientAccess(Base):
    """Records which doctors have been given access to which patients."""
    __tablename__ = "doctor_patient_access"
    id         = Column(Integer, primary_key=True, index=True)
    doctor_id  = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    granted_at = Column(DateTime, default=datetime.utcnow)
    is_active  = Column(Boolean, default=True)


class DiagnosisLog(Base):
    __tablename__ = "diagnosis_log"
    id             = Column(Integer, primary_key=True, index=True)
    patient_id     = Column(Integer, nullable=True)
    district       = Column(String(100), nullable=True)
    disease_name   = Column(String(100), nullable=False)
    risk_level     = Column(String(20), nullable=False)
    confidence_pct = Column(Integer, nullable=False)
    # Who ran this diagnosis — for per-user isolation
    user_id        = Column(Integer, nullable=True, index=True)
    firebase_uid   = Column(String(128), nullable=True, index=True)
    asha_worker_id = Column(Integer, nullable=True, index=True)
    created_at     = Column(DateTime, default=datetime.utcnow, index=True)
    synced_at      = Column(DateTime, nullable=True, index=True)


class Appointment(Base):
    """Doctor appointment bookings — used by VAPI inbound calls and calendar UI."""
    __tablename__ = "appointments"
    id             = Column(Integer, primary_key=True, index=True)
    doctor_id      = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    patient_id     = Column(Integer, ForeignKey("patients.id"), nullable=True, index=True)
    patient_name   = Column(String(150), nullable=True)
    patient_phone  = Column(String(20), nullable=True)
    appt_date      = Column(String(10), nullable=False, index=True)    # YYYY-MM-DD
    time_slot      = Column(String(5), nullable=False)                  # HH:MM
    reason         = Column(Text, nullable=True)
    status         = Column(String(20), default="confirmed")           # confirmed|cancelled|completed
    is_manual      = Column(Boolean, default=False)
    firebase_uid   = Column(String(128), nullable=True, index=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LocalChange(Base):
    """Outbox table for eventually syncing local SQLite changes to Supabase."""
    __tablename__ = "local_changes"
    id              = Column(Integer, primary_key=True, index=True)
    change_key      = Column(String(120), unique=True, nullable=False, index=True)
    entity_type     = Column(String(50), nullable=False, index=True)
    entity_id       = Column(Integer, nullable=True, index=True)
    operation       = Column(String(20), nullable=False)
    payload_json    = Column(Text, nullable=False)
    patient_id      = Column(Integer, nullable=True, index=True)
    actor_id        = Column(Integer, nullable=True, index=True)
    actor_role      = Column(String(20), nullable=True)
    district        = Column(String(100), nullable=True)
    village         = Column(String(100), nullable=True)
    sync_status     = Column(String(20), default="pending", index=True)
    retry_count     = Column(Integer, default=0)
    last_error      = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_attempt_at = Column(DateTime, nullable=True)
    synced_at       = Column(DateTime, nullable=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations():
    """Add any columns that exist in the ORM model but may be missing from an old DB."""
    from sqlalchemy import text
    import logging
    _log = logging.getLogger("sahayak.db")
    # (table, column, sqlite_type)
    migrations = [
        ("medical_reports", "sugar_fasting",   "REAL"),
        ("medical_reports", "sugar_post",       "REAL"),
        ("medical_reports", "hemoglobin",       "REAL"),
        ("medical_reports", "creatinine",       "REAL"),
        ("medical_reports", "cholesterol",      "REAL"),
        ("medical_reports", "ai_risk_level",    "TEXT"),
        ("medical_reports", "ai_summary",       "TEXT"),
        ("medical_reports", "ai_analysis",      "TEXT"),
        ("medical_reports", "ai_confidence",    "INTEGER"),
        ("medical_reports", "is_ai_extracted",  "INTEGER DEFAULT 0"),
        ("medical_reports", "report_title",     "TEXT"),
        ("medical_reports", "report_type",      "TEXT"),
        ("medical_reports", "firebase_uid",     "TEXT"),
        ("medical_reports", "asha_worker_id",   "INTEGER"),
        ("medical_reports", "file_path",        "TEXT"),
        ("medical_reports", "original_filename","TEXT"),
        ("patients", "firebase_uid",            "TEXT"),
        ("patients", "asha_worker_id",          "INTEGER"),
        ("patients", "asha_firebase_uid",       "TEXT"),
        ("patients", "blood_group",             "TEXT"),
        ("patients", "weight_kg",               "REAL"),
        ("patients", "updated_at",              "DATETIME"),
        ("users",    "firebase_uid",            "TEXT"),
        ("users",    "district",                "TEXT"),
        ("users",    "village",                 "TEXT"),
        # doctor_patient_access table — ensure columns exist
        ("doctor_patient_access", "is_active",  "INTEGER DEFAULT 1"),
        ("doctor_patient_access", "granted_at", "DATETIME"),
        ("diagnosis_log", "synced_at",          "DATETIME"),
        ("appointments",  "is_manual",          "INTEGER DEFAULT 0"),
    ]
    with engine.begin() as conn:
        for table, column, col_type in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                _log.info("Migration: added %s.%s (%s)", table, column, col_type)
            except Exception:
                pass  # column already exists — expected


def init_db():
    Base.metadata.create_all(bind=engine)
    run_migrations()
