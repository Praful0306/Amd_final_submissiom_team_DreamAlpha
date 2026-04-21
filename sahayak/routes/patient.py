from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from models.schemas import PatientCreate, PatientUpdate, PatientResponse
from db.database import get_db, Patient, User
from routes.auth import get_current_user

router = APIRouter(prefix="/patient", tags=["Patients"])


@router.post("/", response_model=PatientResponse, status_code=201)
async def create_patient(patient: PatientCreate, db: Session = Depends(get_db)):
    """Create a new patient record."""
    db_patient = Patient(**patient.model_dump())
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("patient", db_patient.id, actor_id=db_patient.user_id, actor_role="patient")
    return db_patient


@router.get("/", response_model=List[PatientResponse])
async def list_patients(
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),  # require auth — no open patient list
):
    """List all patient records (authenticated users only)."""
    # Doctors see all; patients only see their own
    if _user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == _user.id).first()
        return [patient] if patient else []
    return db.query(Patient).offset(skip).limit(limit).all()


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(patient_id: int, db: Session = Depends(get_db)):
    """Retrieve a single patient by ID."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.put("/{patient_id}", response_model=PatientResponse)
async def update_patient(
    patient_id: int, patient: PatientUpdate, db: Session = Depends(get_db)
):
    """Update an existing patient record (partial updates allowed)."""
    db_patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not db_patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    for key, value in patient.model_dump(exclude_unset=True).items():
        setattr(db_patient, key, value)
    db_patient.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(db_patient)
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("patient", db_patient.id)
    return db_patient


@router.delete("/{patient_id}")
async def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Delete a patient record (only the owning patient or doctor)."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    from services.sync_service import queue_deleted_entity
    queue_deleted_entity("patient", patient.id, patient_id=patient.id, actor_id=_user.id, actor_role=_user.role)
    db.delete(patient)
    db.commit()
    return {"message": f"Patient {patient_id} deleted successfully"}
