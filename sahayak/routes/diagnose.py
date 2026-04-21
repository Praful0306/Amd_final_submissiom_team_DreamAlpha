"""
Sahayak AI — Diagnosis endpoints.
extract-file: Stage 1 = Gemini (fills ALL fields). Stage 2 = OCR+LLM (if Gemini fails).
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Request, File, UploadFile
from sqlalchemy.orm import Session

from models.schemas import DiagnoseRequest, DiagnoseResponse, TTSRequest, TTSResponse
from services.llm_service import generate_diagnosis, format_vitals_string
from services.tts_service import text_to_speech
from db.database import get_db, DiagnosisLog, Patient
from middleware.rate_limit import check_and_consume

router = APIRouter(prefix="/diagnose", tags=["Diagnosis"])
EPIDEMIC_THRESHOLD = 3


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/gemini-status", tags=["Utilities"])
async def gemini_status():
    from services.gemini_service import gemini_key_status
    statuses = gemini_key_status()
    total    = sum(max(0, s["rpd_limit"] - s["rpd_used"]) for s in statuses)
    return {"keys": statuses, "total_keys": len(statuses), "total_rpd_remaining": total}


@router.get("/health")
async def health_check():
    return {"status": "ok", "models": ["LLaMA 70B (AWS Bedrock)", "Mixtral 8x7B (AWS Bedrock)"]}


@router.post("/extract-file")
async def extract_report_file(request: Request, file: UploadFile = File(...)):
    """
    Stage 1 — Gemini 2.5 Flash reads PDF natively and fills ALL fields.
    Stage 2 — OCR + LLM pipeline, only if Gemini completely fails.
    """
    import logging as _log
    _logger = _log.getLogger("sahayak.extract")

    ip = _get_client_ip(request)
    rl = check_and_consume(ip, "ocr")
    if not rl["allowed"]:
        # Check if any Gemini key still has quota — if yes, allow through
        from services.gemini_service import gemini_key_status
        has_gemini = any(s["available"] for s in gemini_key_status())
        if not has_gemini:
            return {
                "success": False,
                "error":   f"All Gemini keys exhausted for today and hourly limit reached. "
                           f"Try again in {rl['reset_in_seconds'] // 60} min.",
                "reset_in": rl["reset_in_seconds"], "data": {}, "completion_pct": 0
            }
        # Gemini keys available — allow the request through despite hourly limit

    file_bytes = await file.read()
    filename   = file.filename or "report.pdf"
    _logger.info("File upload: %s (%d bytes)", filename, len(file_bytes))

    from services.performance import check_file_size, get_file_hash, get_cached, set_cached
    size_err = check_file_size(file_bytes)
    if size_err:
        return {"success": False, "error": size_err, "data": {}, "completion_pct": 0}

    fhash  = get_file_hash(file_bytes)
    cached = get_cached(fhash)
    if cached:
        _logger.info("Cache hit — returning cached result")
        return cached

    from services.extraction_service import (
        EXTRACTION_SYSTEM, EXTRACTION_USER_TEMPLATE,
        translate_with_aws, extract_with_regex, parse_llm_json,
        map_to_form, merge_results, interpret_vitals, validate_form,
    )
    from services.clinical_engine import full_clinical_analysis
    from services.disease_engine  import (
        run_clinical_rules, triage_level,
        get_disease_probabilities, patient_priority_score,
    )
    from services.performance     import trim_for_llm
    from services.bedrock_service import call_llm
    from services.gemini_service  import extract_with_gemini, map_gemini_to_form

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 1 — Gemini 2.5 Flash
    # Reads the PDF natively and fills ALL fields in one call.
    # ══════════════════════════════════════════════════════════════════════════
    gemini_result = extract_with_gemini(file_bytes, filename)

    if gemini_result["success"]:
        _logger.info("Gemini succeeded via %s", gemini_result.get("source"))
        merged = map_gemini_to_form(gemini_result["data"])
        gender = (gemini_result["data"].get("patient_info") or {}).get("gender", "male") or "male"
        _logger.info("Gemini filled %d fields", len(merged))

    else:
        # ══════════════════════════════════════════════════════════════════════
        # STAGE 2 — OCR + LLM fallback (only runs if Gemini completely failed)
        # ══════════════════════════════════════════════════════════════════════
        _logger.warning("Gemini failed (%s) — falling back to OCR+LLM",
                        gemini_result.get("error"))

        from services.ocr_service import extract_text_from_pdf
        raw_text = extract_text_from_pdf(file_bytes, filename)
        _logger.info("OCR extracted %d chars", len(raw_text))

        if not raw_text or len(raw_text.strip()) < 20:
            return {"success": False,
                    "error":   "Could not extract text. Please use Manual Entry.",
                    "data": {}, "completion_pct": 0}

        normalised   = translate_with_aws(raw_text)
        trimmed      = trim_for_llm(normalised, 4000)
        raw_response = ""
        try:
            raw_response = call_llm(
                EXTRACTION_SYSTEM,
                EXTRACTION_USER_TEMPLATE.format(text=trimmed),
                model="llama", max_tokens=1500
            )
            _logger.info("LLM fallback responded: %d chars", len(raw_response))
        except Exception as e:
            _logger.error("LLM fallback also failed: %s", e)

        llm_data   = parse_llm_json(raw_response) if raw_response else {}
        llm_form   = map_to_form(llm_data) if llm_data else {}
        regex_data = extract_with_regex(normalised)
        merged     = merge_results(llm_form, regex_data)
        gender     = (llm_data.get("patient_info") or {}).get("gender", "male") or "male"

    # ── Common path for both stages ───────────────────────────────────────────
    annotated = interpret_vitals(merged, gender)
    result    = validate_form(annotated)

    try:
        clinical = full_clinical_analysis(result["form"], gender)
    except Exception as e:
        _logger.warning("Clinical engine: %s", e)
        clinical = {"risk_level": "MEDIUM", "red_flags": [], "clinical_summary": "",
                    "recommendations": [], "interpreted": {}, "confidence_pct": 0}

    symptoms_text = merged.get("symptoms") or ""
    interpreted   = clinical.get("interpreted", {})

    try:
        disease_probs = get_disease_probabilities(result["form"], symptoms_text, interpreted)
        top_diseases  = sorted(disease_probs.items(), key=lambda x: -x[1]["probability"])[:3]
    except Exception:
        disease_probs, top_diseases = {}, []

    try:
        alerts   = run_clinical_rules(result["form"])
        triage   = triage_level(alerts)
        priority = patient_priority_score(result["form"], alerts, disease_probs)
    except Exception:
        alerts, triage, priority = [], clinical["risk_level"], {"score": 0, "level": "LOW"}

    _logger.info("Done: %d%% (%d fields), risk=%s",
                 result["completion_pct"], result["filled_count"], clinical["risk_level"])

    resp = {
        "success":            True,
        "data":               result["form"],
        "fields_filled":      result["filled_count"],
        "completion_pct":     result["completion_pct"],
        "missing_fields":     result["missing_core"],
        "risk_level":         clinical["risk_level"],
        "clinical_summary":   clinical["clinical_summary"],
        "recommendations":    clinical["recommendations"],
        "interpreted":        clinical["interpreted"],
        "confidence_pct":     clinical["confidence_pct"],
        "red_flags":          clinical.get("red_flags", []),
        "abnormal_count":     annotated.get("_abnormal_count", 0),
        "abnormal_findings":  annotated.get("_abnormal_findings", []),
        "disease_probabilities": {k: v for k, v in top_diseases},
        "top_disease":        top_diseases[0][1]["display"] if top_diseases else None,
        "top_disease_action": top_diseases[0][1]["icmr_action"] if top_diseases else None,
        "clinical_alerts":    alerts,
        "triage_level":       triage,
        "priority":           priority,
    }
    set_cached(fhash, resp)
    return resp


@router.post("/", response_model=DiagnoseResponse)
@router.post("", response_model=DiagnoseResponse, include_in_schema=False)  # no-slash alias
async def diagnose(request: Request, payload: DiagnoseRequest, db: Session = Depends(get_db)):
    symptoms = (payload.symptoms or "").strip()
    if not symptoms:
        raise HTTPException(status_code=400, detail="Symptoms cannot be empty")

    ip = _get_client_ip(request)
    rl = check_and_consume(ip, "diagnose")
    if not rl["allowed"]:
        raise HTTPException(status_code=429,
            detail=(f"Rate limit reached. {rl['limit']} calls/hour. "
                    f"Retry in {rl['reset_in_seconds'] // 60} min."))

    patient_context  = None
    patient_district = None
    ctx_parts = []
    if payload.patient_name: ctx_parts.append(f"Patient: {payload.patient_name}")
    if payload.vitals:       ctx_parts.append(f"Vitals: {payload.vitals}")
    if ctx_parts:            patient_context = " | ".join(ctx_parts)

    if payload.patient_id and str(payload.patient_id).isdigit():
        try:
            patient = db.query(Patient).filter(Patient.id == int(payload.patient_id)).first()
            if patient:
                db_ctx = [f"Age: {patient.age}", f"Gender: {patient.gender}"]
                if patient.medical_history:
                    db_ctx.append(f"Medical history: {patient.medical_history}")
                patient_context  = (patient_context or "") + " | " + " | ".join(db_ctx)
                patient_district = patient.district
        except Exception:
            pass

    try:
        result = await generate_diagnosis(
            symptoms=symptoms,
            patient_context=patient_context,
            vitals_context=payload.vitals,
            additional_context=payload.additional_context,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diagnosis failed: {str(e)}")

    try:
        # Extract firebase_uid from token for per-user isolation
        fuid = None
        try:
            from services.firebase_auth import verify_firebase_token, firebase_is_configured
            auth_hdr = request.headers.get("Authorization", "")
            if auth_hdr.startswith("Bearer ") and firebase_is_configured():
                fb = verify_firebase_token(auth_hdr[7:])
                if fb: fuid = fb["uid"]
        except Exception:
            pass

        # Also get user_id for legacy path
        uid_int = None
        if not fuid:
            try:
                from services.auth_service import decode_token
                auth_hdr = request.headers.get("Authorization", "")
                if auth_hdr.startswith("Bearer "):
                    pl = decode_token(auth_hdr[7:])
                    if pl: uid_int = pl.get("sub")
            except Exception:
                pass

        diag = DiagnosisLog(
            patient_id=payload.patient_id,
            district=patient_district,
            disease_name=result.get("disease_name", "Unknown"),
            risk_level=result.get("risk_level", "MEDIUM"),
            confidence_pct=result.get("confidence_pct", 50),
            firebase_uid=fuid,
            user_id=uid_int,
            asha_worker_id=uid_int,   # set for ASHA workers
        )
        db.add(diag)
        db.commit()
        db.refresh(diag)
        from services.sync_service import queue_snapshot_change
        queue_snapshot_change(
            "diagnosis",
            diag.id,
            patient_id=diag.patient_id,
            actor_id=uid_int,
            actor_role="patient" if payload.patient_id else "asha",
            district=patient_district,
        )
    except Exception:
        pass

    try:
        from datetime import timedelta
        base   = result.get("disease_name", "").split("(")[0].strip().lower()
        for p in ("suspected ", "probable ", "confirmed "): base = base.replace(p, "")
        cutoff = datetime.utcnow() - timedelta(days=7)
        count  = db.query(DiagnosisLog).filter(
            DiagnosisLog.disease_name.ilike(f"%{base.split()[0]}%"),
            DiagnosisLog.created_at >= cutoff,
        ).count()
        if count >= EPIDEMIC_THRESHOLD:
            result["community_alert"] = (
                f"ALERT: {count} cases of {result.get('disease_name','').split('(')[0].strip()} "
                f"in 7 days. Possible outbreak — report to Block Medical Officer."
            )
        else:
            result.setdefault("community_alert", None)
    except Exception:
        result.setdefault("community_alert", None)

    result.setdefault("risk_level", "MEDIUM")
    result.setdefault("diagnosis",  result.get("disease_name", "Assessment complete"))
    result.setdefault("summary",    result.get("clinical_summary", result.get("diagnosis", "")))

    return DiagnoseResponse(
        risk_level            = result.get("risk_level", "MEDIUM"),
        diagnosis             = result.get("disease_name", result.get("diagnosis", "")),
        summary               = result.get("clinical_summary", result.get("diagnosis", "")),
        disease_name          = result.get("disease_name"),
        confidence_pct        = result.get("confidence_pct"),
        refer_to_hospital     = result.get("refer_to_hospital"),
        clinical_summary      = result.get("clinical_summary"),
        recommendations       = result.get("recommendations"),
        action_items          = result.get("action_items"),
        medications_suggested = result.get("medications_suggested"),
        warning_signs         = result.get("warning_signs"),
        followup_days         = result.get("followup_days"),
        sources               = result.get("sources"),
        community_alert       = result.get("community_alert"),
    )


@router.post("/extract")
async def extract_report(request: Request, payload: dict):
    import logging as _log
    _logger = _log.getLogger("sahayak.extract")

    raw_text = payload.get("text", "").strip()
    if not raw_text:
        return {"success": False, "error": "No text provided", "data": {}, "completion_pct": 0}

    ip = _get_client_ip(request)
    rl = check_and_consume(ip, "diagnose")
    if not rl["allowed"]:
        return {"success": False, "error": "Rate limit reached",
                "reset_in": rl["reset_in_seconds"], "data": {}, "completion_pct": 0}

    from services.extraction_service import (
        EXTRACTION_SYSTEM, EXTRACTION_USER_TEMPLATE,
        normalise_language, translate_with_aws,
        extract_with_regex, parse_llm_json,
        map_to_form, merge_results, interpret_vitals, validate_form,
    )
    from services.clinical_engine import full_clinical_analysis
    from services.disease_engine  import (
        run_clinical_rules, triage_level, get_disease_probabilities, patient_priority_score,
    )
    from services.performance     import trim_for_llm
    from services.bedrock_service import call_llm

    normalised   = translate_with_aws(raw_text)
    trimmed      = trim_for_llm(normalised, 4000)
    raw_response = ""
    try:
        raw_response = call_llm(EXTRACTION_SYSTEM,
                                EXTRACTION_USER_TEMPLATE.format(text=trimmed),
                                model="llama", max_tokens=1500)
    except Exception as e:
        _logger.error("LLM failed: %s", e)

    llm_data   = parse_llm_json(raw_response) if raw_response else {}
    llm_form   = map_to_form(llm_data) if llm_data else {}
    regex_data = extract_with_regex(normalised)
    merged     = merge_results(llm_form, regex_data)
    gender     = (llm_data.get("patient_info") or {}).get("gender", "male") or "male"
    annotated  = interpret_vitals(merged, gender)
    result     = validate_form(annotated)

    try:
        clinical = full_clinical_analysis(result["form"], gender)
    except Exception:
        clinical = {"risk_level": "MEDIUM", "red_flags": [], "clinical_summary": "",
                    "recommendations": [], "interpreted": {}, "confidence_pct": 0}

    symptoms_text = merged.get("symptoms") or ""
    interpreted   = clinical.get("interpreted", {})

    try:
        disease_probs = get_disease_probabilities(result["form"], symptoms_text, interpreted)
        top_diseases  = sorted(disease_probs.items(), key=lambda x: -x[1]["probability"])[:3]
    except Exception:
        disease_probs, top_diseases = {}, []

    try:
        alerts   = run_clinical_rules(result["form"])
        triage   = triage_level(alerts)
        priority = patient_priority_score(result["form"], alerts, disease_probs)
    except Exception:
        alerts, triage, priority = [], clinical["risk_level"], {"score": 0, "level": "LOW"}

    return {
        "success":            True,
        "data":               result["form"],
        "fields_filled":      result["filled_count"],
        "completion_pct":     result["completion_pct"],
        "missing_fields":     result["missing_core"],
        "risk_level":         clinical["risk_level"],
        "clinical_summary":   clinical["clinical_summary"],
        "recommendations":    clinical["recommendations"],
        "interpreted":        clinical["interpreted"],
        "confidence_pct":     clinical["confidence_pct"],
        "red_flags":          clinical.get("red_flags", []),
        "abnormal_count":     annotated.get("_abnormal_count", 0),
        "abnormal_findings":  annotated.get("_abnormal_findings", []),
        "disease_probabilities": {k: v for k, v in top_diseases},
        "top_disease":        top_diseases[0][1]["display"] if top_diseases else None,
        "top_disease_action": top_diseases[0][1]["icmr_action"] if top_diseases else None,
        "clinical_alerts":    alerts,
        "triage_level":       triage,
        "priority":           priority,
    }


@router.post("/tts", response_model=TTSResponse)
async def diagnose_tts(request: Request, req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    ip = _get_client_ip(request)
    rl = check_and_consume(ip, "tts")
    if not rl["allowed"]:
        raise HTTPException(status_code=429,
            detail=f"TTS rate limit. Retry in {rl['reset_in_seconds'] // 60} min.")
    try:
        filepath = await text_to_speech(req.text, req.lang or "en")
        return TTSResponse(message="Audio generated", file_path=filepath)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")
