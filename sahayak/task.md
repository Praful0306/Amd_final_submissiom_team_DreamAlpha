# AMD Project — Task Tracker

> **Project:** AI-powered Medical Diagnostic Assistant  
> **Location:** `/Users/tejasbanakar/Desktop/amd project/`  
> **Last Updated:** 2026-03-20

---

## Phase 1: Project Setup & Configuration

- [x] Create `requirements.txt` with all dependencies
- [x] Create `config.py` with environment variable loading
- [x] Create `.env.example` template
- [x] Create package `__init__.py` files (db, models, services, routes, data)

---

## Phase 2: Database Layer

- [x] Implement `db/database.py` — SQLite + SQLAlchemy setup + Patient model
- [x] Implement `models/schemas.py` — Pydantic request/response schemas

---

## Phase 3: Core Services

- [x] Implement `services/asr_service.py` — OpenAI Whisper transcription
- [x] Implement `services/rag_service.py` — FAISS-based guideline retrieval
- [x] Implement `services/llm_service.py` — RAG + LLM diagnosis pipeline
- [x] Implement `services/tts_service.py` — Google TTS audio generation
- [x] Implement `services/pdf_service.py` — PDF referral letter generation

---

## Phase 4: Data & FAISS Index

- [ ] ⏳ Add 6 medical guideline `.txt` files to `data/` — **NEED FROM USER**
- [x] Implement `data/ingest_guidelines.py` — FAISS index builder
- [ ] Build the FAISS index (`cd data && python ingest_guidelines.py`)

---

## Phase 5: API Routes

- [x] Implement `routes/transcribe.py` — `/transcribe` POST endpoint
- [x] Implement `routes/diagnose.py` — `/diagnose` POST + `/diagnose/tts` POST
- [x] Implement `routes/referral.py` — `/referral` POST + `/referral/download` GET
- [x] Implement `routes/patient.py` — `/patient` CRUD endpoints

---

## Phase 6: Application Entry Point

- [x] Implement `main.py` — FastAPI app, routers, CORS, startup event

---

## Phase 7: Run & Test

- [ ] ⏳ Create `.env` with OpenAI API key — **NEED FROM USER**
- [ ] Install dependencies (`pip install -r requirements.txt`)
- [ ] Build FAISS index
- [ ] Start server (`uvicorn main:app --reload --port 8000`)
- [ ] Test all endpoints via Swagger UI

---

## Current Status

| Phase   | Status           |
|---------|------------------|
| Phase 1 | ✅ Complete       |
| Phase 2 | ✅ Complete       |
| Phase 3 | ✅ Complete       |
| Phase 4 | 🟡 Needs user files |
| Phase 5 | ✅ Complete       |
| Phase 6 | ✅ Complete       |
| Phase 7 | 🔴 Waiting        |
