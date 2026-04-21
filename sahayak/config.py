"""
Sahayak AI — Configuration
All secrets loaded from environment variables / .env file.
"""
import os
from dotenv import load_dotenv

project_root = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("HF_HOME", os.path.join(project_root, ".hf_cache"))
os.environ.setdefault("TRANSFORMERS_CACHE", os.path.join(project_root, ".hf_cache"))

load_dotenv(os.path.join(project_root, ".env"), override=True)

# ── AWS Bedrock — LLaMA 3.1 70B ──────────────────────────────────────────────
# Model verified: meta.llama3-1-70b-instruct-v1:0 (us-east-1 / us-west-2)
LLAMA_AWS_ACCESS_KEY    = os.getenv("LLAMA_AWS_ACCESS_KEY", "")
LLAMA_AWS_SECRET_KEY    = os.getenv("LLAMA_AWS_SECRET_KEY", "")
LLAMA_MODEL_ID          = os.getenv("LLAMA_MODEL_ID", "us.meta.llama3-1-70b-instruct-v1:0")  # cross-region inference profile
LLAMA_AWS_REGION        = os.getenv("LLAMA_AWS_REGION", "us-east-1")

# ── AWS Bedrock — Mixtral 8x7B ────────────────────────────────────────────────
# Correct AWS Bedrock model ID: mistral.mixtral-8x7b-instruct-v0:1
# (NOT "mixtral-8x7b-instruct" — that is the HuggingFace name, not the Bedrock ID)
MIXTRAL_AWS_ACCESS_KEY  = os.getenv("MIXTRAL_AWS_ACCESS_KEY", "")
MIXTRAL_AWS_SECRET_KEY  = os.getenv("MIXTRAL_AWS_SECRET_KEY", "")
MIXTRAL_MODEL_ID        = os.getenv("MIXTRAL_MODEL_ID", "mistral.mixtral-8x7b-instruct-v0:1")
MIXTRAL_AWS_REGION      = os.getenv("MIXTRAL_AWS_REGION", "us-east-1")

# ── Groq — Whisper ASR ───────────────────────────────────────────────────────
OPENAI_API_KEY   = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL  = os.getenv("OPENAI_BASE_URL", "https://api.groq.com/openai/v1")
WHISPER_MODEL    = os.getenv("WHISPER_MODEL", "whisper-large-v3")
VISION_LLM_MODEL = os.getenv("VISION_LLM_MODEL", "llama-3.2-90b-vision-preview")

# ── Groq — LLM fallback (2 keys, used if both AWS models fail) ───────────────
GROQ_API_KEY_1        = os.getenv("GROQ_API_KEY_1", "")
GROQ_API_KEY_2        = os.getenv("GROQ_API_KEY_2", "")
GROQ_LLM_MODEL        = os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")     # for diagnosis chat (quality)
GROQ_EXTRACTION_MODEL = os.getenv("GROQ_EXTRACTION_MODEL", "llama-3.1-8b-instant")  # for PDF extraction (speed)

# ── Database ──────────────────────────────────────────────────────────────────
_default_db_path = os.path.join(project_root, "patients.db").replace("\\", "/")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_default_db_path}")

# ── FAISS / RAG ───────────────────────────────────────────────────────────────
FAISS_INDEX_DIR = os.getenv("FAISS_INDEX_DIR", "data/faiss_index")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
CHUNK_SIZE      = int(os.getenv("CHUNK_SIZE", "200"))
CHUNK_OVERLAP   = int(os.getenv("CHUNK_OVERLAP", "20"))
TOP_K           = int(os.getenv("TOP_K", "8"))

# ── Gemini — PDF Extraction (5 keys rotating for rate limit handling) ────────
GEMINI_API_KEY_1      = os.getenv("GEMINI_API_KEY_1", "")
GEMINI_API_KEY_2      = os.getenv("GEMINI_API_KEY_2", "")
GEMINI_API_KEY_3      = os.getenv("GEMINI_API_KEY_3", "")
GEMINI_API_KEY_4      = os.getenv("GEMINI_API_KEY_4", "")
GEMINI_API_KEY_5      = os.getenv("GEMINI_API_KEY_5", "")
GEMINI_EXTRACTION_MODEL = os.getenv("GEMINI_EXTRACTION_MODEL", "gemini-2.5-flash")

# ── Rate Limiting ─────────────────────────────────────────────────────────────
# Strict: only call AWS when user explicitly requests — saves cost
RATE_LIMIT_DIAGNOSE_PER_HOUR  = int(os.getenv("RATE_LIMIT_DIAGNOSE_PER_HOUR", "50"))
RATE_LIMIT_TTS_PER_HOUR       = int(os.getenv("RATE_LIMIT_TTS_PER_HOUR", "100"))
RATE_LIMIT_OCR_PER_HOUR       = int(os.getenv("RATE_LIMIT_OCR_PER_HOUR", "50"))

# ── Frontend ──────────────────────────────────────────────────────────────────
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ── Supabase — Government DB Sync ────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# ── Twilio — Direct SMS ───────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID   = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN    = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER  = os.getenv("TWILIO_PHONE_NUMBER", "")

# ── Ollama — Local Offline LLM Fallback ───────────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "gemma2:2b")

# ── App ───────────────────────────────────────────────────────────────────────
APP_VERSION = "3.3.0"
