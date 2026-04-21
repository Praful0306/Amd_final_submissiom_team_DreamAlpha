╔══════════════════════════════════════════════════════════════════════════╗
║            SAHAYAK AI — Complete Fixed Build                           ║
║            Team DreamAlpha · AMD Slingshot Hackathon                   ║
╚══════════════════════════════════════════════════════════════════════════╝

VERSION: v3.3.1-fixed  (31 bugs fixed across 3 sessions)
DATE:    April 2026
STACK:   FastAPI + SQLite + FAISS + AWS Bedrock + Groq + gTTS + VAPI

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  QUICK START
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Copy .env.example → .env and fill in your API keys (see KEYS section)
  2. pip install -r requirements.txt
  3. python migrate_db.py          ← run ONCE on first setup
  4. uvicorn main:app --reload --port 8000
  5. Open http://localhost:8000

  Key pages:
    http://localhost:8000              ← Landing page
    http://localhost:8000/auth.html    ← Login / Register (3 roles)
    http://localhost:8000/asha_demo.html ← Live demo for judges
    http://localhost:8000/asha_portal.html ← Full ASHA dashboard
    http://localhost:8000/api/docs     ← All API routes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  API KEYS (.env)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  REQUIRED for LLM diagnosis:
    GROQ_API_KEY_1 / _2   → groq.com (free tier available)
    GROQ_LLM_MODEL        → llama-3.1-70b-versatile  ← MUST be this exact value

  OPTIONAL (better quality):
    LLAMA_AWS_ACCESS_KEY + SECRET  → AWS Bedrock LLaMA 70B
    MIXTRAL_AWS_ACCESS_KEY + SECRET → AWS Bedrock Mixtral

  REQUIRED for PDF upload & OCR:
    GEMINI_API_KEY_1       → aistudio.google.com (free)

  REQUIRED for voice transcription:
    OPENAI_API_KEY         → your Groq key again (used as Whisper endpoint)
    OPENAI_BASE_URL        → https://api.groq.com/openai/v1

  OPTIONAL:
    MAKE_WEBHOOK_REMINDER  → Make.com webhook for medicine reminders
    MAKE_WEBHOOK_HANDOFF   → Make.com webhook for doctor handoff
    SUPABASE_URL + KEY     → Supabase for government DB sync
    BACKEND_PUBLIC_URL     → Public URL for VAPI tool callbacks
    JWT_SECRET_KEY         → Generate: python -c "import secrets; print(secrets.token_hex(32))"

  ⚠️  SECURITY: Never commit .env to git. Keys in .env are for local use only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  COMPLETE BUG FIX LOG (31 fixes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SESSION 1 — Core Backend
  ─────────────────────────
  #01  GROQ_LLM_MODEL was "openai/gpt-oss-120b" (invalid) → llama-3.1-70b-versatile
  #02  FAISS RAG imported but never called in diagnosis pipeline → now injected
  #03  httpx.AsyncClient() leaked connections in webhooks → async with fixed
  #04  ANC/vaccine form fields silently dropped by Pydantic → schema extended
  #05  ASHA role offline fallback sent to patient.html → asha role added
  #06  speakKannada() never searched for kn-IN voice → async voice loader added
  #07  hr/spo2 empty string crashed Pydantic int validation → Optional[str]+coerce
  #08  VAPI tool-call handler only handled v1 format → all 3 formats supported
  #09  synced_at never written → duplicate syncs on every call → now written
  #10  Daily briefing hardcoded "Lakshmi and Ravi Kumar" → real DB patient names
  #11  saveImmunization() had no DB persistence → /reports/save-full called
  #12  migrate_db.py missing report_title/report_type columns → added

  SESSION 2 — Frontend Fixes
  ──────────────────────────
  #13  All 3 chatbots called Anthropic API directly with no key → /chat proxy
  #14  doctor.js called GET /auth/access-code/{code} (doesn't exist) → fixed
  #15  patient.js called /diagnose without trailing slash → 404 → fixed
  #16  RAG returned dicts but f"- {r}" printed raw dict → r['text'] fix
  #17  rag_service.load() import was before docstring → unreachable docstring
  #18  Real API keys committed in .env → redacted in packaged build

  SESSION 3 — Auth, Gov Report, Security
  ────────────────────────────────────────
  #19  asr_service created OpenAI client at import → crash if key missing → lazy
  #20  submitGovReport was fake setTimeout → real /government-report + sync call
  #21  gov-referrals input had duplicate id= attribute → removed
  #22  GET /patient/ and DELETE had no auth → any user could list all patients
  #23  autoFillReport never set gov-month → always blank → now sets current month
  #24  No POST /government-report endpoint existed → created with audit trail
  #25  submitGovReport sent payload but no HMIS data was persisted → fixed
  #26  autoFillReport never filled gov-immun count → now from live DB

  SESSION 4 — Performance, Security, Remaining Fakes
  ────────────────────────────────────────────────────
  #27  threading.Lock in rate limiter blocked asyncio event loop → removed
  #28  /chat endpoint had no rate limiting → now shares diagnose bucket
  #29  patient.js toast said "GPT-OSS 20B" (wrong model) → "LLaMA 3.1 70B"
  #30  Hardcoded VAPI fallback credentials in asha_portal.html → removed
  #31  sendReferral in asha_demo was fake sleep → real POST /referral/ call
  #32  gTTS sync network call blocked asyncio event loop → run_in_executor
  #33  /referral/ returns 404 if demo patient not in DB → graceful fallback

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  LLM Chain:  LLaMA 3.1 70B (AWS Bedrock)
           →  Mixtral 8x7B  (AWS Bedrock)
           →  Groq key 1    (llama-3.1-70b-versatile)
           →  Groq key 2    (llama-3.1-70b-versatile)
           →  Clinical engine offline fallback (no LLM needed)

  Diagnosis:  FAISS RAG (ICMR guidelines) → LLM extraction → Clinical Engine
              Clinical Engine is source of truth for risk level (never LLM)

  Voice:      Browser MediaRecorder → POST /transcribe/ (Groq Whisper)
              → POST /diagnose/ → speakKannada() (Web Speech API)

  Chatbots:   Browser → POST /chat (backend proxy) → LLM chain
              No API keys in browser. Rate-limited.

  Storage:    SQLite (patients.db) - all PII stays local
              Supabase PostgreSQL - optional gov sync (diagnosis_log only)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROUTES SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  POST /auth/register           Create account (patient/doctor/asha)
  POST /auth/login              Login, returns JWT
  GET  /auth/me                 Current user info

  POST /diagnose/               Full diagnosis (LLM + FAISS + Clinical Engine)
  POST /diagnose/extract-file   Upload PDF/image, extract medical data (Gemini)
  POST /diagnose/tts            Text → MP3 audio (gTTS)

  POST /reports/save-full       Save patient report to SQLite
  PATCH /reports/{id}/update-ai Update report with AI result

  POST /doctor/access-patient   Doctor accesses patient via share code
  GET  /doctor/patients         Doctor's patient list
  GET  /doctor/patient/{id}     Full patient detail

  POST /chat                    Chatbot proxy (all 3 roles, rate-limited)
  POST /agent/proactive         ASHA daily briefing with live DB data
  GET  /deep_impact             ASHA impact dashboard stats

  POST /voice/fill-form         Speech → patient form fields
  POST /voice/handoff           Doctor handoff via Make.com
  POST /reminder/send           Medicine reminder via Make.com

  POST /sync/to-government      Push to Supabase government DB
  POST /government-report       Save HMIS monthly report

  POST /vapi/tool-call          VAPI agent tool handler (6 tools)
  GET  /vapi/agent-config/{role} VAPI agent config (asha/patient/doctor)

  POST /referral/               Generate PDF referral letter
  POST /transcribe/             Audio → text (Groq Whisper)
  GET  /analytics/stats         Live patient + diagnosis counts
  GET  /health                  System health check
  GET  /api/docs                Swagger UI

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  OPTIONAL FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  VAPI Voice Calls:
    1. Go to vapi.ai → create free account
    2. Get Public Key from dashboard
    3. Create an Assistant with Kannada language support
    4. Enter Public Key + Assistant ID in ASHA Portal → Settings → VAPI

  Government Sync (Supabase):
    1. Create free Supabase project at supabase.com
    2. Add SUPABASE_URL and SUPABASE_KEY (service role) to .env
    3. Create table "diagnosis_log" with columns matching local schema
    4. Use "Sync to Government" button in ASHA portal

  AMD Ryzen AI NPU (production):
    Place Phi-3-Mini AWQ ONNX model at: models/phi3_mini_awq.onnx
    Install: pip install onnxruntime-directml
    Server auto-detects and loads on startup.
    Falls back to cloud LLMs if model not present.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
