# AMD Project — Implementation Plan

## Project Overview

This is an **AI-powered Medical Diagnostic Assistant** — a FastAPI backend application that combines:
- **Automatic Speech Recognition (ASR)** to transcribe patient audio
- **Retrieval-Augmented Generation (RAG)** over medical guidelines
- **Large Language Model (LLM)** for diagnosis and recommendations
- **Text-to-Speech (TTS)** for audio responses
- **PDF Generation** for referral letters
- **Patient Database** (SQLite + SQLAlchemy)

---

## Project Structure

```
amd project/
├── main.py                  # FastAPI app entry point
├── config.py                # Environment & app configuration
├── requirements.txt         # Python dependencies
├── .env                     # API keys & secrets (not committed)
│
├── db/
│   └── database.py          # SQLite + SQLAlchemy Patient model
│
├── models/
│   └── schemas.py           # Pydantic request/response models
│
├── services/
│   ├── asr_service.py       # Audio transcription service
│   ├── rag_service.py       # FAISS-based guideline retrieval
│   ├── llm_service.py       # LLM diagnosis & recommendation
│   ├── tts_service.py       # Text-to-speech conversion
│   └── pdf_service.py       # PDF referral letter generation
│
├── routes/
│   ├── transcribe.py        # /transcribe endpoint
│   ├── diagnose.py          # /diagnose endpoint
│   ├── referral.py          # /referral endpoint
│   └── patient.py           # /patient CRUD endpoints
│
└── data/
    ├── ingest_guidelines.py  # Script to build FAISS index from guidelines
    └── *.txt                 # 6 medical guideline text files
```

---

## Technology Stack

| Layer         | Technology                        |
|---------------|-----------------------------------|
| Framework     | FastAPI + Uvicorn                 |
| Database      | SQLite + SQLAlchemy               |
| Vector Store  | FAISS (via `ingest_guidelines.py`)|
| Validation    | Pydantic                          |
| ASR           | Speech-to-text service            |
| LLM           | Large Language Model API          |
| TTS           | Text-to-speech service            |
| PDF           | PDF generation library            |

---

## Setup & Run Instructions

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Build the FAISS Index (one-time)
```bash
cd data && python ingest_guidelines.py
```
This reads the 6 medical guideline `.txt` files, generates embeddings, and saves a FAISS index for fast retrieval.

### 3. Start the Backend
```bash
cd .. && uvicorn main:app --reload --port 8000
```
The API will be available at **http://localhost:8000**.
API docs at **http://localhost:8000/docs** (Swagger UI).

---

## Key API Endpoints

| Method | Endpoint       | Description                          |
|--------|----------------|--------------------------------------|
| POST   | `/transcribe`  | Transcribe patient audio to text     |
| POST   | `/diagnose`    | Run RAG + LLM diagnosis pipeline     |
| POST   | `/referral`    | Generate a PDF referral letter       |
| GET    | `/patient`     | List / retrieve patient records      |
| POST   | `/patient`     | Create a new patient record          |

---

## Architecture Flow

```
Audio Input
    │
    ▼
┌──────────────┐
│  ASR Service │  ──▶  Transcribed Text
└──────────────┘
    │
    ▼
┌──────────────┐     ┌──────────────────┐
│  RAG Service │ ◀── │ FAISS Index       │
│  (retrieve)  │     │ (medical guides)  │
└──────────────┘     └──────────────────┘
    │
    ▼
┌──────────────┐
│  LLM Service │  ──▶  Diagnosis + Recommendations
└──────────────┘
    │
    ├──▶  TTS Service  ──▶  Audio Response
    │
    └──▶  PDF Service  ──▶  Referral Letter (PDF)
```

---

## Environment Variables (`.env`)

Refer to `config.py` for the full list. Common variables include:
- `OPENAI_API_KEY` or equivalent LLM key
- `DATABASE_URL` (defaults to SQLite)
- Any ASR / TTS API credentials

---

## Notes

- FAISS index must be built **before** the first `/diagnose` call.
- The SQLite database is auto-created on first run.
- Use `--reload` flag during development for hot-reloading.
