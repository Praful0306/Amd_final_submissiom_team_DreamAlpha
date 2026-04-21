import os
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from models.schemas import ReferralRequest, ReferralResponse
from services.pdf_service import generate_referral_pdf
from db.database import get_db, Patient

router = APIRouter(prefix="/referral", tags=["Referral"])


@router.post("/", response_model=ReferralResponse)
async def create_referral(request: ReferralRequest, db: Session = Depends(get_db)):
    """Generate a PDF referral letter.
    If patient_id is not found in DB (e.g. ASHA demo with id=1 on empty DB),
    generates the letter with anonymous patient data rather than returning 404.
    """
    patient = db.query(Patient).filter(Patient.id == request.patient_id).first()

    # Graceful fallback — still generate the PDF even without a DB patient record
    p_name   = patient.name   if patient else "Patient (Demo)"
    p_age    = patient.age    if patient else 0
    p_gender = patient.gender if patient else "Not specified"

    try:
        filepath = generate_referral_pdf(
            patient_name=p_name,
            patient_age=p_age,
            patient_gender=p_gender,
            diagnosis=request.diagnosis,
            recommendations=request.recommendations,
            referring_doctor=request.referring_doctor,
            referred_to=request.referred_to,
            notes=request.notes,
        )
        return ReferralResponse(
            message="Referral letter generated successfully",
            file_path=filepath,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


@router.get("/download/{filename}")
async def download_referral(filename: str):
    """Download a previously generated referral PDF."""
    filepath = os.path.join("static", "referrals", filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Referral PDF not found")
    return FileResponse(filepath, media_type="application/pdf", filename=filename)
