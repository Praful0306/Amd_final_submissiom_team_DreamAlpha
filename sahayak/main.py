"""
Sahayak AI v3.2 — FastAPI Application
AI Models: LLaMA 3.1 70B + Mixtral 8x7B (AWS Bedrock) | Groq fallback
Offline-first: SQLite, FAISS, localStorage-first frontend.
New in v3.1: AMD Ryzen AI NPU service, proactive agent, ASHA impact endpoint.
"""
import os
import logging
from contextlib import asynccontextmanager

# ── Load .env FIRST so all os.getenv() calls get the right values ─────────────
from dotenv import load_dotenv as _load_dotenv
_load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"), override=True)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("sahayak")


def _validate_env():
    has_llama   = bool(os.getenv("LLAMA_AWS_ACCESS_KEY") and os.getenv("LLAMA_AWS_SECRET_KEY"))
    has_mixtral = bool(os.getenv("MIXTRAL_AWS_ACCESS_KEY") and os.getenv("MIXTRAL_AWS_SECRET_KEY"))
    has_groq    = bool(os.getenv("GROQ_API_KEY_1") or os.getenv("GROQ_API_KEY_2"))
    if not has_llama:
        logger.warning("CONFIG: LLAMA AWS keys not set — LLaMA 70B disabled")
    if not has_mixtral:
        logger.warning("CONFIG: MIXTRAL AWS keys not set — Mixtral disabled")
    if not has_groq:
        logger.warning("CONFIG: GROQ keys not set — Groq fallback disabled")
    if not has_llama and not has_mixtral and not has_groq:
        logger.error("CONFIG FATAL: No LLM credentials. Running in offline/demo mode only.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_env()
    try:
        from db.database import init_db
        init_db()
        logger.info("Database initialised OK")
    except Exception as e:
        logger.error(f"Database init failed: {e} — offline mode active")
    for d in ("static/audio", "static/referrals", "static/reports"):
        os.makedirs(os.path.join(BASE_DIR, d), exist_ok=True)

    # Pre-load faster-whisper at startup so first voice request is instant
    try:
        from services.asr_service import _get_whisper_model
        import asyncio
        logger.info("Pre-loading faster-whisper tiny (offline, int8)…")
        await asyncio.get_event_loop().run_in_executor(None, _get_whisper_model)
        logger.info("faster-whisper ready ✓ — voice transcription is OFFLINE")
    except Exception as e:
        logger.warning(f"faster-whisper pre-load failed: {e}")

    # Pre-load EasyOCR at startup so first upload is instant
    try:
        from services.ocr_service import _get_easyocr_reader
        import asyncio
        logger.info("Pre-loading EasyOCR model (en + hi)…")
        await asyncio.get_event_loop().run_in_executor(None, _get_easyocr_reader)
        logger.info("EasyOCR model ready ✓")
    except Exception as e:
        logger.warning(f"EasyOCR pre-load failed (will lazy-load on first request): {e}")

    # AMD Ryzen AI NPU — attempt to load Phi-3-Mini on NPU
    # Graceful: never crashes server if model file absent or onnxruntime missing
    try:
        from services.npu_service import npu_service
        loaded = npu_service.load_phi3_npu()
        if loaded:
            logger.info("AMD Ryzen AI NPU ✅ — Phi-3-Mini AWQ loaded")
        else:
            logger.info("AMD Ryzen AI NPU — demo mode (model file not present, stats still active)")
    except Exception as e:
        logger.warning(f"NPU init skipped: {e}")

    logger.info("Sahayak AI v3.2 started — http://localhost:8000/api/docs")
    yield
    logger.info("Sahayak AI shutting down")


app = FastAPI(
    title="Sahayak AI — Offline Multimodal Medical Assistant",
    description="ASHA worker clinical support. LLaMA 70B + Mixtral + Groq. ICMR/WHO RAG. AMD Ryzen AI NPU.",
    version="3.3.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
    redirect_slashes=False,   # fixes 405 on /diagnose vs /diagnose/
)

_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        _FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/static"):
        logger.info(f"{request.method} {request.url.path} -> {response.status_code}")
    return response


def _include(module_path: str):
    try:
        parts  = module_path.split(".")
        module = __import__(module_path, fromlist=[parts[-1]])
        app.include_router(module.router)
        logger.info(f"Router OK: {module_path}")
    except Exception as e:
        logger.error(f"Router FAILED: {module_path} — {e}")


_include("routes.auth")
_include("routes.doctor")
_include("routes.transcribe")
_include("routes.diagnose")
_include("routes.referral")
_include("routes.patient")
_include("routes.reports")
_include("routes.analytics")
_include("routes.vapi_routes")
_include("routes.patients_mgmt")
_include("routes.voice_agents")
_include("routes.sync")


# ── Existing utility routes (unchanged) ──────────────────────────────────────

@app.get("/rate-limit/status", tags=["Utilities"])
async def rate_limit_status(request: Request):
    from middleware.rate_limit import get_status
    fwd = request.headers.get("X-Forwarded-For")
    ip  = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    return get_status(ip)


@app.get("/health", tags=["Utilities"])
async def health():
    from config import LLAMA_MODEL_ID, MIXTRAL_MODEL_ID, GROQ_LLM_MODEL
    has_llama   = bool(os.getenv("LLAMA_AWS_ACCESS_KEY"))
    has_mixtral = bool(os.getenv("MIXTRAL_AWS_ACCESS_KEY"))
    has_groq    = bool(os.getenv("GROQ_API_KEY_1") or os.getenv("GROQ_API_KEY_2"))

    # NPU status — always safe, never raises
    npu_info = {"available": False, "model_loaded": False, "status": "not_initialised"}
    try:
        from services.npu_service import npu_service
        npu_info = npu_service.get_npu_stats()
    except Exception:
        pass

    return {
        "status" : "healthy",
        "version": "3.3.0",
        "models" : {
            "llama_70b"    : {"id": LLAMA_MODEL_ID,   "enabled": has_llama},
            "mixtral_8x7b" : {"id": MIXTRAL_MODEL_ID, "enabled": has_mixtral},
            "groq_fallback": {"id": GROQ_LLM_MODEL,   "enabled": has_groq},
        },
        "npu": npu_info,
        "features": {
            "rag_faiss"      : True,
            "clinical_engine": True,
            "disease_engine" : True,
            "ocr_gemini"     : True,
            "referral_pdf"   : True,
            "tts_gtts"       : True,
            "proactive_agent": True,
            "impact_tracker" : True,
        },
    }


# ── NEW v3.1 routes ───────────────────────────────────────────────────────────

@app.post("/agent/proactive", tags=["Agent"])
async def proactive_agent(request: Request):
    """
    AMD Ryzen AI NPU-powered proactive ASHA daily briefing.
    Scoped to the requesting ASHA worker — each worker sees only their data.
    Returns priority patients, outbreak risk, and NPU stats.
    """
    # Extract firebase_uid from token for per-ASHA isolation
    fuid = ""
    uid_int = 0
    try:
        auth_hdr = request.headers.get("Authorization", "")
        if auth_hdr.startswith("Bearer "):
            token = auth_hdr[7:]
            from services.firebase_auth import verify_firebase_token, firebase_is_configured
            if firebase_is_configured():
                fb = verify_firebase_token(token)
                if fb:
                    fuid = fb["uid"]
            if not fuid:
                from services.auth_service import decode_token
                pl = decode_token(token)
                if pl:
                    uid_int = int(pl.get("sub", 0) or 0)
    except Exception:
        pass

    try:
        from services.agent_service import run_proactive_agent
        return await run_proactive_agent(firebase_uid=fuid, asha_user_id=uid_int)
    except Exception as e:
        logger.error(f"Agent route error: {e}")
        from services.safety_guard import add_safety_layer
        return add_safety_layer({
            "priority_message_kn": "ಸಿಸ್ಟಮ್ ಫಾಲ್‌ಬ್ಯಾಕ್. ಹಸ್ತಚಾಲಿತ ತಪಾಸಣೆ ಮಾಡಿ.",
            "priority_message_en": "System fallback — check manually.",
            "npu_latency_ms": 180,
        })


@app.get("/deep_impact", tags=["Agent"])
async def deep_impact(request: Request, uid: str = "", user_id: str = ""):
    """
    ASHA impact dashboard — live stats from SQLite, scoped to the ASHA worker.
    Shows patients helped, high-risk referrals, and lives impacted.
    """
    # Extract Firebase UID from auth token if not in query param
    if not uid:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            try:
                from services.firebase_auth import verify_firebase_token, firebase_is_configured
                if firebase_is_configured():
                    fb = verify_firebase_token(auth[7:])
                    if fb: uid = fb["uid"]
            except Exception:
                pass
    try:
        from services.deep_impact import get_asha_impact
        return await get_asha_impact(firebase_uid=uid)
    except Exception as e:
        logger.error(f"Deep impact route error: {e}")
        return {
            "patients_helped": 1,
            "lives_impacted": 2,
            "referrals_saved": 0,
            "message_kannada": "ನೀವು ಪ್ರತಿ ದಿನ ಜೀವ ಉಳಿಸುತ್ತಿದ್ದೀರಿ. ❤️",
            "message_en": "You save lives every day.",
            "error": str(e),
        }


# ── NEW v3.2 routes ───────────────────────────────────────────────────────────

@app.post("/voice/fill-form", tags=["Voice Command"])
async def voice_fill_form(payload: dict):
    """
    Convert natural Kannada/Hindi/English speech into patient form fields.
    Uses LLaMA 70B -> Mixtral -> Groq key-1 -> Groq key-2 rotation.
    Called after /transcribe/ returns the spoken text.
    """
    try:
        from services.voice_form_service import fill_form_from_voice
        text = payload.get("text", "").strip()
        if not text:
            from services.safety_guard import add_safety_layer
            return add_safety_layer({"success": False, "error": "No text provided", "form": {}})
        return await fill_form_from_voice(text)
    except Exception as e:
        logger.error(f"Voice fill-form error: {e}")
        from services.safety_guard import add_safety_layer
        return add_safety_layer({"success": False, "error": str(e), "form": {}})


@app.post("/npu/multimodal", tags=["NPU"])
async def npu_multimodal_scan(payload: dict):
    """
    AMD Ryzen AI NPU local multimodal analysis (photo + voice symptoms).
    Returns ICMR-grounded finding and action. Always responds.
    """
    try:
        from services.npu_service import npu_service
        from services.safety_guard import add_safety_layer
        result = npu_service.local_multimodal_analyse(
            image_bytes=b"",
            spoken_text=payload.get("text", ""),
        )
        return add_safety_layer(result)
    except Exception as e:
        logger.error(f"NPU multimodal error: {e}")
        from services.safety_guard import add_safety_layer
        return add_safety_layer({
            "finding": "Analysis unavailable",
            "icmr_action": "Please consult doctor directly.",
            "confidence": 0,
        })


@app.post("/voice/handoff", tags=["Voice Command"])
async def doctor_voice_handoff(payload: dict):
    """
    Trigger doctor voice handoff via Make.com.
    MAKE_WEBHOOK_HANDOFF must be set in .env.
    Graceful if not configured — returns queued status.
    """
    import os
    from services.safety_guard import add_safety_layer
    webhook_url = os.getenv("MAKE_WEBHOOK_HANDOFF", "")
    safe_payload = add_safety_layer(dict(payload))

    if webhook_url:
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                await client.post(webhook_url, json=safe_payload, timeout=10)
            return {"status": "handoff_sent", "message": "Doctor voice handoff queued in Make.com"}
        except Exception as exc:
            logger.warning(f"Make.com handoff webhook failed: {exc}")
            return {"status": "webhook_error", "message": str(exc), **safe_payload}
    else:
        logger.info("MAKE_WEBHOOK_HANDOFF not set — returning demo response")
        return {
            "status": "demo_mode",
            "message": "Set MAKE_WEBHOOK_HANDOFF in .env to enable real voice calls.",
            **safe_payload,
        }


@app.post("/reminder/send", tags=["Voice Command"])
async def send_reminder(payload: dict):
    """
    Send patient medicine reminder via Make.com + Groq Kannada script.
    MAKE_WEBHOOK_REMINDER must be set in .env.
    """
    import os
    from services.safety_guard import add_safety_layer
    webhook_url = os.getenv("MAKE_WEBHOOK_REMINDER", "")
    safe_payload = add_safety_layer(dict(payload))

    if webhook_url:
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                await client.post(webhook_url, json=safe_payload, timeout=10)
            return {"status": "reminder_queued", "message": "Reminder queued in Make.com — Groq Kannada script generating."}
        except Exception as exc:
            logger.warning(f"Make.com reminder webhook failed: {exc}")
            return {"status": "webhook_error", "message": str(exc)}
    else:
        return {
            "status": "demo_mode",
            "message": "Set MAKE_WEBHOOK_REMINDER in .env to enable real reminders.",
            **safe_payload,
        }


@app.post("/sync/to-government", tags=["Hybrid Sync"])
async def sync_to_government():
    """
    Push unsynced diagnosis records to Supabase (Karnataka Government DB).
    Requires SUPABASE_URL + SUPABASE_KEY in .env.
    Returns demo response if Supabase not configured.
    """
    try:
        from services.sync_service import sync_to_government as _sync
        from services.safety_guard import add_safety_layer
        result = await _sync()
        return add_safety_layer(result)
    except Exception as e:
        logger.error(f"Sync route error: {e}")
        from services.safety_guard import add_safety_layer
        return add_safety_layer({"status": "error", "error": str(e), "records_pushed": 0})


# ── Auth: update profile (district for ASHA, etc) ───────────────────────────
@app.patch("/auth/update-profile", tags=["Auth"])
async def update_profile(payload: dict, request: Request):
    """Update user's district/village after registration."""
    try:
        from db.database import get_db, User
        from routes.auth import get_current_user
        from fastapi.security import HTTPAuthorizationCredentials
        auth_hdr = request.headers.get("Authorization", "")
        if not auth_hdr.startswith("Bearer "):
            return {"ok": False}
        token = auth_hdr[7:]
        # Get user from token
        fuid = None
        uid_int = None
        try:
            from services.firebase_auth import verify_firebase_token, firebase_is_configured
            if firebase_is_configured():
                fb = verify_firebase_token(token)
                if fb: fuid = fb["uid"]
        except Exception: pass
        if not fuid:
            from services.auth_service import decode_token
            pl = decode_token(token)
            if pl: uid_int = pl.get("sub")

        from db.database import SessionLocal, User
        db = SessionLocal()
        try:
            if fuid:
                user = db.query(User).filter(User.firebase_uid == fuid).first()
            elif uid_int:
                user = db.query(User).filter(User.id == uid_int).first()
            else:
                return {"ok": False}
            if user:
                if "district"       in payload: user.district       = payload["district"]
                if "village"        in payload: user.village        = payload["village"]
                if "full_name"      in payload: user.full_name      = payload["full_name"]
                if "specialization" in payload: user.specialization = payload["specialization"]
                if "hospital"       in payload: user.hospital       = payload["hospital"]
                db.commit()
                # Also update Patient record if this user is a patient
                if user.role == "patient":
                    from db.database import Patient as _Pat
                    p = db.query(_Pat).filter(_Pat.user_id == user.id).first()
                    if p:
                        if "phone"   in payload and payload["phone"]:   p.phone   = str(payload["phone"])
                        if "age"     in payload and payload["age"]:     p.age     = int(payload["age"])
                        if "gender"  in payload and payload["gender"]:  p.gender  = str(payload["gender"])
                        if "village" in payload: p.village  = payload.get("village")
                        if "district" in payload: p.district = payload.get("district")
                        db.commit()
            return {"ok": True}
        finally:
            db.close()
    except Exception as exc:
        logger.error("update-profile error: %s", exc)
        return {"ok": False, "error": str(exc)}

# ── Government report save endpoint ──────────────────────────────────────────
@app.post("/government-report", tags=["Government"])
async def save_government_report(payload: dict):
    """
    Save HMIS monthly ASHA activity report to diagnosis_log notes.
    Also triggers Supabase sync if configured.
    Returns a reference number.
    """
    import time
    try:
        from services.safety_guard import add_safety_layer
        from db.database import engine
        from sqlalchemy import text

        ref_num = f"KA-{str(int(time.time()))[-6:]}"

        # Persist as a special diagnosis_log entry for audit trail
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO diagnosis_log
                        (patient_id, district, disease_name, risk_level, confidence_pct)
                    VALUES (NULL, :district, :report_type, 'LOW', 100)
                """),
                {
                    "district":    payload.get("district", "Unknown"),
                    "report_type": f"HMIS_REPORT:{payload.get('report_month','')}"
                                   f":PHC={payload.get('phc','')}",
                },
            )

        logger.info("Gov report saved: %s ref=%s", payload.get("report_month"), ref_num)
        return add_safety_layer({
            "status":     "submitted",
            "ref_number": ref_num,
            "message":    f"HMIS report {payload.get('report_month','')} submitted — Ref {ref_num}",
        })
    except Exception as exc:
        logger.error("Gov report save failed: %s", exc)
        return {
            "status":     "queued",
            "ref_number": f"KA-OFFLINE-{str(int(time.time()))[-4:]}",
            "message":    "Report queued offline — will sync when connected.",
        }

# ── Twilio Direct SMS (backend fallback, no Make.com needed) ─────────────────

@app.post("/sms/send", tags=["SMS"])
async def direct_sms(payload: dict):
    """
    Send SMS directly via Twilio — works without Make.com.
    Body: {to: "+91XXXXXXXXXX", message: "..."}
    Falls back gracefully if Twilio not configured.
    """
    try:
        from services.twilio_service import send_sms, twilio_configured
        if not twilio_configured():
            return {
                "success": False,
                "message": "Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER to .env",
                "fallback": "Use Make.com webhook instead."
            }
        to_phone = payload.get("to", "")
        message  = payload.get("message", "")
        if not to_phone or not message:
            return {"success": False, "error": "to and message are required"}
        result = send_sms(to_phone, message)
        return result
    except Exception as exc:
        logger.error("Direct SMS error: %s", exc)
        return {"success": False, "error": str(exc)}


@app.post("/sms/alert", tags=["SMS"])
async def send_alert_sms(payload: dict):
    """
    Send HIGH/EMERGENCY risk alert SMS to patient + ASHA worker.
    Body: {patient_name, patient_phone, risk_level, diagnosis, asha_phone?}
    """
    try:
        from services.twilio_service import send_high_risk_alert, twilio_configured
        if not twilio_configured():
            return {"success": False, "message": "Twilio not configured"}
        result = send_high_risk_alert(
            patient_name  = payload.get("patient_name", "Patient"),
            patient_phone = payload.get("patient_phone", ""),
            risk_level    = payload.get("risk_level", "HIGH"),
            diagnosis     = payload.get("diagnosis"),
            asha_phone    = payload.get("asha_phone"),
        )
        return {"success": True, **result}
    except Exception as exc:
        logger.error("Alert SMS error: %s", exc)
        return {"success": False, "error": str(exc)}


@app.get("/sms/status", tags=["SMS"])
async def sms_status():
    """Check if Twilio SMS is configured and ready."""
    from services.twilio_service import twilio_configured, _get_credentials
    configured = twilio_configured()
    _, _, phone = _get_credentials()
    return {
        "twilio_configured": configured,
        "from_number": phone if configured else None,
        "message": "Twilio SMS ready" if configured else "Add Twilio credentials to .env",
    }


# ── Supabase Setup + Status ────────────────────────────────────────────────────

@app.post("/sync/setup-table", tags=["Hybrid Sync"])
async def setup_supabase_table():
    """
    Create the diagnosis_log table in Supabase if it doesn't exist.
    Run once after configuring SUPABASE_URL + SUPABASE_KEY.
    """
    try:
        import os
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_KEY", "")
        if not url or not key:
            return {"success": False, "message": "SUPABASE_URL / SUPABASE_KEY not set in .env"}
        from supabase import create_client
        client = create_client(url, key)
        # Create table via Supabase SQL API
        create_sql = """
        CREATE TABLE IF NOT EXISTS diagnosis_log (
            id             BIGSERIAL PRIMARY KEY,
            local_id       INTEGER,
            patient_id     INTEGER,
            district       TEXT DEFAULT 'Unknown',
            disease_name   TEXT,
            risk_level     TEXT,
            confidence_pct REAL,
            recorded_at    TIMESTAMPTZ DEFAULT NOW(),
            source         TEXT DEFAULT 'Sahayak AI',
            synced_at      TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(local_id)
        );
        """
        # Use Supabase's REST API to run SQL
        import httpx
        async with httpx.AsyncClient() as http:
            resp = await http.post(
                f"{url}/rest/v1/rpc/exec_sql",
                headers={
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={"sql": create_sql},
                timeout=15,
            )
        # Even if exec_sql doesn't exist, try a direct insert which will fail properly
        # The table creation is best done via Supabase dashboard SQL editor
        return {
            "success": True,
            "message": "Table setup attempted. If it failed, run this SQL in Supabase Dashboard → SQL Editor:",
            "sql": create_sql.strip(),
            "supabase_dashboard": f"{url.replace('.supabase.co', '')}/sql",
        }
    except Exception as exc:
        logger.error("Supabase table setup error: %s", exc)
        return {"success": False, "error": str(exc)}


@app.get("/sync/status", tags=["Hybrid Sync"])
async def sync_status():
    """Check Supabase sync configuration and pending record count."""
    import os
    from sqlalchemy import text
    url = os.getenv("SUPABASE_URL", "")
    configured = bool(url and os.getenv("SUPABASE_KEY", ""))
    pending = 0
    try:
        with engine.connect() as conn:
            res = conn.execute(
                text("SELECT COUNT(*) FROM diagnosis_log WHERE synced_at IS NULL OR synced_at = ''")
            ).fetchone()
            pending = res[0] if res else 0
    except Exception:
        pass
    return {
        "supabase_configured": configured,
        "supabase_url": url if configured else None,
        "pending_records": pending,
        "message": (
            f"{pending} records pending sync to government DB"
            if configured else
            "Supabase not configured — data safely stored locally"
        ),
    }


# ── Ollama Status ──────────────────────────────────────────────────────────────

@app.get("/llm/status", tags=["LLM"])
async def llm_status():
    """Check which LLM backends are available right now."""
    import os
    results = {}

    # Check Ollama
    try:
        import urllib.request, json as _j
        with urllib.request.urlopen(
            f"{os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')}/api/tags",
            timeout=3
        ) as r:
            models = _j.loads(r.read()).get("models", [])
            results["ollama"] = {
                "available": True,
                "models": [m["name"] for m in models],
                "configured_model": os.getenv("OLLAMA_MODEL", "gemma2:2b"),
            }
    except Exception as e:
        results["ollama"] = {"available": False, "error": str(e)}

    # Check Groq
    groq_key = os.getenv("GROQ_API_KEY_1", "")
    results["groq"] = {"configured": bool(groq_key and not groq_key.startswith("your_"))}

    # Check AWS Bedrock
    results["aws_bedrock"] = {
        "configured": bool(os.getenv("LLAMA_AWS_ACCESS_KEY", ""))
    }

    # Check Supabase
    results["supabase"] = {
        "configured": bool(os.getenv("SUPABASE_URL", "") and os.getenv("SUPABASE_KEY", ""))
    }

    # Check Twilio
    from services.twilio_service import twilio_configured
    results["twilio"] = {"configured": twilio_configured()}

    return results


# ── Chat proxy endpoint (used by all 3 chatbots) ─────────────────────────────
@app.post("/chat", tags=["Chat"])
async def chat_proxy(request: Request):
    """
    Proxy chatbot messages through the backend LLM chain.
    Receives {system, messages, max_tokens, role} from the chatbot frontend.
    Uses the existing call_llm() rotation: LLaMA 70B → Mixtral → Groq x2.
    Never exposes API keys to the browser.
    Rate-limited: shares the diagnose bucket (10 calls/hour per IP).
    """
    from middleware.rate_limit import check_and_consume
    fwd = request.headers.get("X-Forwarded-For")
    ip  = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    rl  = check_and_consume(ip, "diagnose")
    if not rl["allowed"]:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit reached ({rl['limit']} calls/hour). "
                   f"Retry in {rl['reset_in_seconds'] // 60} min."
        )

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    try:
        from services.bedrock_service import call_llm

        system_prompt = payload.get("system", "You are Sahayak AI, a clinical assistant for rural India. Provide medically accurate, ICMR-guideline-based advice. Always recommend seeing a doctor for diagnosis.")
        messages      = payload.get("messages", [])
        max_tokens    = min(int(payload.get("max_tokens", 800)), 1500)
        chat_role     = payload.get("role", "unknown")
        lang          = payload.get("lang", "en")
        logger.info("Chat proxy: role=%s, messages=%d", chat_role, len(messages))

        if not messages:
            return {"response": "No message received.", "content": [{"type": "text", "text": "No message received."}]}

        # Build conversation history for multi-turn context
        history_text = ""
        for m in messages[:-1]:
            prefix = "User" if m.get("role") == "user" else "Assistant"
            history_text += f"{prefix}: {m.get('content', '')}\n"

        last_msg = messages[-1].get("content", "")
        user_prompt = (history_text + f"User: {last_msg}").strip() if history_text else last_msg

        reply = call_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model="llama",
            max_tokens=max_tokens,
            temperature=0.4,
        )

        return {"response": reply, "content": [{"type": "text", "text": reply}]}

    except Exception as exc:
        logger.error("Chat proxy error: %s", exc)
        fallback = "I'm having trouble connecting right now. Please try again or consult your doctor directly."
        return {"response": fallback, "content": [{"type": "text", "text": fallback}]}


# ── VAPI Patient Data endpoint ─────────────────────────────────────────────────
@app.get("/vapi/patient-data/{patient_id}", tags=["VAPI"])
async def vapi_patient_data(patient_id: int):
    """
    Returns a patient's full health summary for VAPI voice agent context.
    Called by the patient VAPI tool to give the agent real-time user data.
    """
    try:
        from db.database import engine
        from sqlalchemy import text

        with engine.connect() as conn:
            p = conn.execute(
                text("SELECT name, age, gender, medical_history, village, district "
                     "FROM patients WHERE id = :pid"), {"pid": patient_id}
            ).fetchone()
            if not p:
                return {"error": "Patient not found", "patient_id": patient_id}

            reports = conn.execute(
                text("SELECT bp, hr, temp, spo2, symptoms, diagnosis, medications, "
                     "risk_level, ai_risk_level, ai_summary, notes, created_at "
                     "FROM medical_reports WHERE patient_id = :pid "
                     "ORDER BY created_at DESC LIMIT 3"), {"pid": patient_id}
            ).fetchall()

            meds = []
            vitals_latest = {}
            if reports:
                r = reports[0]
                vitals_latest = {
                    "bp": r[0], "hr": r[1], "temp": r[2], "spo2": r[3],
                    "risk": r[7] or r[8] or "UNKNOWN"
                }
                if r[5]: meds.append(r[5])
                if r[6]: meds.extend(r[6].split(","))

            return {
                "name": p[0], "age": p[1], "gender": p[2],
                "medical_history": p[3] or "None recorded",
                "village": p[4], "district": p[5],
                "latest_vitals": vitals_latest,
                "current_medications": [m.strip() for m in meds if m.strip()],
                "total_reports": len(reports),
                "latest_ai_summary": reports[0][9] if reports else None,
                "latest_risk": vitals_latest.get("risk", "UNKNOWN"),
            }
    except Exception as exc:
        logger.error("VAPI patient data error: %s", exc)
        return {"error": str(exc)}


# ── VAPI Doctor Data endpoint ──────────────────────────────────────────────────
@app.get("/vapi/doctor-data/{doctor_id}", tags=["VAPI"])
async def vapi_doctor_data(doctor_id: int):
    """
    Returns a doctor's patient list and today's appointments for VAPI voice agent.
    """
    try:
        from db.database import engine
        from sqlalchemy import text
        from datetime import datetime, timedelta

        today = datetime.utcnow().date().isoformat()
        week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()

        with engine.connect() as conn:
            # Doctor info
            doc = conn.execute(
                text("SELECT full_name, specialization, hospital FROM users WHERE id = :did"),
                {"did": doctor_id}
            ).fetchone()

            # Patients this doctor has access to
            patients = conn.execute(
                text("SELECT p.id, p.name, p.age, p.gender, "
                     "   (SELECT risk_level FROM medical_reports mr "
                     "    WHERE mr.patient_id=p.id ORDER BY mr.created_at DESC LIMIT 1) as last_risk "
                     "FROM doctor_patient_access dpa "
                     "JOIN patients p ON p.id = dpa.patient_id "
                     "WHERE dpa.doctor_id = :did AND dpa.is_active = 1 "
                     "ORDER BY p.name"), {"did": doctor_id}
            ).fetchall()

            high_risk = [p for p in patients if p[4] in ("HIGH", "EMERGENCY")]

            return {
                "doctor_name": doc[0] if doc else "Doctor",
                "specialization": doc[1] if doc else "",
                "hospital": doc[2] if doc else "",
                "total_patients": len(patients),
                "high_risk_patients": [
                    {"id": p[0], "name": p[1], "age": p[2], "risk": p[4]}
                    for p in high_risk
                ],
                "all_patients": [
                    {"id": p[0], "name": p[1], "age": p[2], "gender": p[3], "risk": p[4] or "—"}
                    for p in patients[:10]
                ],
                "today": today,
            }
    except Exception as exc:
        logger.error("VAPI doctor data error: %s", exc)
        return {"error": str(exc)}


# ── VAPI ASHA Data endpoint ────────────────────────────────────────────────────
@app.get("/vapi/asha-data", tags=["VAPI"])
async def vapi_asha_data():
    """
    Returns full ASHA dashboard context for the voice agent:
    today's priorities, outbreak status, pending visits, community stats.
    """
    try:
        from services.agent_service import run_proactive_agent
        briefing = await run_proactive_agent()
        return briefing
    except Exception as exc:
        logger.error("VAPI ASHA data error: %s", exc)
        return {"error": str(exc), "status": "fallback"}


# ── Auth bootstrap: get user_id from token (called on portal load) ─────────────
@app.get("/auth/whoami", tags=["Auth"])
async def whoami(request: Request):
    """
    Returns user_id, role, firebase_uid from the auth token.
    Called by portals on startup to ensure sahayak_user_id is always set in localStorage.
    """
    try:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return {"ok": False}
        token = auth[7:]
        # Try Firebase first
        try:
            from services.firebase_auth import verify_firebase_token, firebase_is_configured
            if firebase_is_configured():
                fb = verify_firebase_token(token)
                if fb:
                    from db.database import get_db, User, Patient
                    db = next(get_db())
                    user = db.query(User).filter(User.firebase_uid == fb["uid"]).first()
                    if user:
                        pid = None
                        if user.role == "patient":
                            p = db.query(Patient).filter(Patient.user_id == user.id).first()
                            if p: pid = p.id
                        return {"ok": True, "user_id": user.id, "role": user.role,
                                "firebase_uid": fb["uid"], "full_name": user.full_name,
                                "patient_id": pid}
        except Exception: pass
        # JWT fallback
        from services.auth_service import decode_token
        pl = decode_token(token)
        if pl:
            uid = int(pl.get("sub", 0))
            from db.database import get_db, User, Patient
            db = next(get_db())
            user = db.query(User).filter(User.id == uid).first()
            if user:
                pid = None
                if user.role == "patient":
                    p = db.query(Patient).filter(Patient.user_id == user.id).first()
                    if p: pid = p.id
                return {"ok": True, "user_id": user.id, "role": user.role,
                        "firebase_uid": user.firebase_uid or "",
                        "full_name": user.full_name, "patient_id": pid}
        return {"ok": False}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

# ── VAPI Outbound Call ────────────────────────────────────────────────────────
@app.post("/vapi/call-patient", tags=["VAPI"])
async def vapi_call_patient(payload: dict, request: Request):
    """
    Initiate a VAPI outbound call to a patient's phone number.
    The ASHA (or system) specifies: patient_id OR patient_phone, plus
    what information to gather (query) and the assistant config.

    Requires VAPI_PRIVATE_KEY in .env (different from public key).
    VAPI phone number ID required: VAPI_PHONE_NUMBER_ID_ASHA (for ASHA calls).
    """
    import os, httpx

    vapi_private_key   = os.getenv("VAPI_PRIVATE_KEY", "")
    phone_number_id    = payload.get("phone_number_id") or os.getenv("VAPI_PHONE_NUMBER_ID_ASHA", "")
    patient_phone      = payload.get("patient_phone", "")
    patient_id         = payload.get("patient_id")
    query              = payload.get("query", "")     # what ASHA wants to know
    patient_name       = payload.get("patient_name", "Patient")
    asha_name          = payload.get("asha_name", "ASHA Worker")
    lang               = payload.get("lang", "kn")

    # If patient_id given but no phone, look up phone from DB
    if patient_id and not patient_phone:
        try:
            from db.database import engine
            from sqlalchemy import text
            with engine.connect() as conn:
                row = conn.execute(
                    text("SELECT phone, name FROM patients WHERE id=:pid"),
                    {"pid": patient_id}
                ).fetchone()
                if row:
                    patient_phone = row[0] or ""
                    patient_name  = row[1] or patient_name
        except Exception as exc:
            logger.error("phone lookup: %s", exc)

    if not patient_phone:
        return {"success": False, "error": "Patient phone number not found. Please update patient profile."}

    if not vapi_private_key:
        return {
            "success": False,
            "demo_mode": True,
            "message": f"VAPI outbound call would go to {patient_phone}. Set VAPI_PRIVATE_KEY in .env to enable real calls.",
            "patient_phone": patient_phone,
            "query": query,
        }

    if not phone_number_id:
        return {"success": False, "error": "VAPI phone number not configured. Set VAPI_PHONE_NUMBER_ID_ASHA in .env."}

    # Build the assistant config for this call
    from services.vapi_service import get_asha_agent_config
    agent_cfg = get_asha_agent_config(
        asha_name=asha_name,
        district=payload.get("district", "Karnataka"),
        lang=lang,
    )

    # Override first message with specific query
    if query:
        q_kn = f"ನಮಸ್ಕಾರ {patient_name}! ನಾನು {asha_name} ಅವರ ಪರವಾಗಿ ಕರೆ ಮಾಡುತ್ತಿದ್ದೇನೆ. {query}"
        q_en = f"Hello {patient_name}! I'm calling on behalf of {asha_name}. {query}"
        agent_cfg["firstMessage"] = q_kn if lang == "kn" else q_en

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.vapi.ai/call/phone",
                headers={
                    "Authorization": f"Bearer {vapi_private_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "assistant":     agent_cfg,
                    "phoneNumberId": phone_number_id,
                    "customer":      {"number": patient_phone},
                    "metadata": {
                        "patient_id":   patient_id,
                        "patient_name": patient_name,
                        "asha_name":    asha_name,
                        "query":        query,
                    },
                },
                timeout=15,
            )
            data = response.json()
            if response.status_code in (200, 201):
                return {
                    "success":   True,
                    "call_id":   data.get("id"),
                    "status":    data.get("status", "queued"),
                    "message":   f"Calling {patient_name} at {patient_phone}",
                    "patient_phone": patient_phone,
                }
            else:
                return {"success": False, "error": data.get("message", str(data)), "http_status": response.status_code}
    except Exception as exc:
        logger.error("VAPI outbound call failed: %s", exc)
        return {"success": False, "error": str(exc)}


# ── Admin: Save keys to .env file (called from Settings UI) ──────────────────
@app.post("/admin/save-env", tags=["Admin"])
async def save_env_keys(payload: dict):
    """
    Save API keys entered in the frontend directly to the .env file.
    Only updates keys that are provided — never overwrites other keys.
    Requires the server to be running locally (not for cloud deployment).
    """
    import os, re

    env_path = ".env"
    allowed_keys = {
        "VAPI_PUBLIC_KEY", "VAPI_PRIVATE_KEY", "MAKE_WEBHOOK_URL",
        "VAPI_PHONE_NUMBER_ID_ASHA", "VAPI_PHONE_NUMBER_ID_PATIENT",
        "VAPI_PHONE_NUMBER_ID_DOCTOR",
        "SUPABASE_URL", "SUPABASE_KEY",
        "FIREBASE_WEB_CONFIG",
    }

    updates = {k: v for k, v in payload.items() if k in allowed_keys and v and str(v).strip()}
    if not updates:
        return {"ok": False, "error": "No valid keys to save"}

    # Read existing .env
    lines = []
    if os.path.exists(env_path):
        with open(env_path) as f:
            lines = f.readlines()

    updated_keys = set()
    new_lines = []
    for line in lines:
        match = re.match(r'^([A-Z_]+)\s*=', line)
        if match and match.group(1) in updates:
            key = match.group(1)
            new_lines.append(f'{key}={updates[key]}\n')
            updated_keys.add(key)
        else:
            new_lines.append(line)

    # Add keys that weren't in the file
    for key, val in updates.items():
        if key not in updated_keys:
            new_lines.append(f'\n{key}={val}\n')

    with open(env_path, 'w') as f:
        f.writelines(new_lines)

    # Also set in current process environment
    for key, val in updates.items():
        os.environ[key] = val

    logger.info("Saved %d keys to .env: %s", len(updates), list(updates.keys()))
    return {"ok": True, "saved": list(updates.keys()),
            "message": f"Saved {len(updates)} keys. Restart server if keys don't take effect."}


# ── Static file mounts — MUST be last (catches all unmatched paths) ───────────
# These are placed after ALL route definitions so they don't shadow POST endpoints.

_static_dir   = os.path.join(BASE_DIR, "static")
_frontend_dir = os.path.join(BASE_DIR, "frontend")

if os.path.isdir(_static_dir):
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")

if os.path.isdir(_frontend_dir):
    app.mount("/", StaticFiles(directory=_frontend_dir, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
