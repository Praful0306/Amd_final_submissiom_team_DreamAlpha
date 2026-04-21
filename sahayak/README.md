# Sahayak AI v2.0 — Offline Multimodal Medical Assistant

> AMD Slingshot Hackathon | Team DreamAlpha | Built for ASHA workers in Rural India

---

## 🏆 What This Is

Sahayak AI is a **voice-first, multilingual clinical decision support system** designed for ASHA (Accredited Social Health Activist) workers in rural India. It empowers semi-trained frontline health workers with specialist-level triage guidance — working even without internet connectivity.

---

## 🏗 Architecture: Demo vs Production

| Component | Hackathon Demo | Production (AMD Ryzen AI NPU) |
|---|---|---|
| Speech-to-Text | Groq Whisper API | Faster-Whisper INT8 via ONNX Runtime + DirectML |
| Clinical Reasoning | Groq LLaMA-3.3-70B | Phi-3-Mini AWQ (4-bit quantised) via ONNX Runtime |
| Vector Search | FAISS CPU (local) | FAISS CPU (local) — same in both |
| Text-to-Speech | gTTS (requires brief internet) | Coqui-TTS / Indic-TTS (fully offline) |
| Patient Data | Local SQLite | Local SQLite — zero cloud sync |

The demo environment uses the Groq API as a **drop-in OpenAI-compatible replacement** for the local ONNX models. The API interface is identical — switching to local models requires only changing the `OPENAI_BASE_URL` and `LLM_MODEL` config values.

---

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.10+
- Groq API key (free at console.groq.com)

### 2. Install
```bash
pip install -r requirements.txt
```

### 3. Configure
Create a `.env` file:
```env
OPENAI_API_KEY=your_groq_api_key_here
OPENAI_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
WHISPER_MODEL=whisper-large-v3
```

### 4. Build the medical knowledge index
```bash
cd data
python ingest_guidelines.py
cd ..
```

### 5. Run
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000

---

## 📚 Medical Knowledge Base

The system includes ICMR/WHO guidelines for 12 conditions:

| Disease | Source |
|---|---|
| Malaria (P. vivax + P. falciparum) | NVBDCP India |
| Dengue Fever | WHO / NVBDCP |
| Tuberculosis (TB) | RNTCP India |
| Pneumonia | WHO IMCI Guidelines |
| Diarrhoea / Dehydration | WHO ORS Guidelines |
| Anaemia | ICMR |
| Typhoid Fever | ICMR |
| Hypertension | ICMR / NHM India |
| Diabetes Mellitus | ICMR / RSSDI |
| Maternal & Prenatal Health | MoHFW India |
| Jaundice (Hepatitis A/E) | ICMR |
| Snake Bite | ICMR / MoHFW |

---

## 🌐 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/diagnose/` | POST | Full triage diagnosis (symptoms → structured JSON) |
| `/diagnose/tts` | POST | Text-to-speech in any Indian language |
| `/transcribe/` | POST | Audio → text (10 Indian languages) |
| `/transcribe/languages` | GET | List supported ASR languages |
| `/patient/` | GET/POST | Patient registry CRUD |
| `/referral/` | POST | Generate referral PDF |
| `/analytics/stats` | GET | Village health statistics |
| `/analytics/disease-trend` | GET | Disease trend chart data |
| `/upload-report` | POST | OCR extract from PDF/image |

Interactive API docs: http://localhost:8000/api/docs

---

## 🔒 Security & Privacy

- All patient data stored in **local SQLite** — nothing sent to cloud
- Community epidemic detection uses anonymised disease names only — no PII
- Referral PDFs generated locally
- Path traversal protection on all file download endpoints
- Input validation on all API endpoints via Pydantic
- CORS restricted to localhost origins

---

## 🌍 Supported Languages

Hindi (हिंदी), Kannada (ಕನ್ನಡ), English, Tamil (தமிழ்), Telugu (తెలుగు),
Marathi (मराठी), Bengali (বাংলা), Gujarati (ગુજરાતી), Punjabi (ਪੰਜਾਬੀ), Odia (ଓଡ଼ିଆ)

---

## ⚠️ Medical Disclaimer

Sahayak AI is an **AI-assisted triage tool** for trained health workers. It is NOT a replacement for a qualified doctor's diagnosis. All clinical decisions must be confirmed by a licensed medical professional. This system is designed to assist ASHA workers — not replace them.
