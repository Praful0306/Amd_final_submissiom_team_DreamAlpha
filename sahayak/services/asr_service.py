"""
Sahayak AI — ASR (Automatic Speech Recognition) Service

Priority order:
  1. faster-whisper (offline, fast, tiny model ~39MB already cached)
  2. Groq Whisper API (online fallback if faster-whisper fails)

faster-whisper tiny runs in ~0.5–1s on CPU with int8 quantisation.
The model is already cached at: ~/.cache/huggingface/hub/models--Systran--faster-whisper-tiny
"""

import os
import logging
import tempfile

logger = logging.getLogger("sahayak.asr")

# ── faster-whisper singleton ──────────────────────────────────────────────────

_whisper_model = None

def _get_whisper_model():
    """Lazy-load faster-whisper tiny model (singleton)."""
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            logger.info("Loading faster-whisper tiny (int8, CPU)…")
            _whisper_model = WhisperModel(
                "tiny",
                device="cpu",
                compute_type="int8",    # fastest & lowest memory
                num_workers=2,
                cpu_threads=4,
            )
            logger.info("faster-whisper tiny loaded OK")
        except Exception as e:
            logger.warning("faster-whisper failed to load: %s", e)
    return _whisper_model


def _ext_from_content_type(content_type: str) -> str:
    """Map MIME type → file extension for correct temp file naming."""
    mapping = {
        "audio/webm":  ".webm",
        "audio/mp4":   ".mp4",
        "audio/mpeg":  ".mp3",
        "audio/ogg":   ".ogg",
        "audio/wav":   ".wav",
        "audio/wave":  ".wav",
        "audio/x-wav": ".wav",
        "audio/flac":  ".flac",
    }
    ct = (content_type or "").lower().split(";")[0].strip()
    return mapping.get(ct, ".webm")   # default to .webm (browser standard)


# ── Public API ────────────────────────────────────────────────────────────────

async def transcribe_audio(audio_file) -> dict:
    """
    Transcribe an uploaded audio file to text.

    Tries faster-whisper first (offline, fast).
    Falls back to Groq Whisper API if faster-whisper is unavailable.

    Args:
        audio_file: FastAPI UploadFile object.

    Returns:
        dict with 'text', 'language', and optional 'duration'.
    """
    content  = await audio_file.read()
    ct       = getattr(audio_file, "content_type", "") or ""
    ext      = _ext_from_content_type(ct)

    # Save to temp file with CORRECT extension so decoders recognise the format
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # ── 1. faster-whisper (offline) ───────────────────────────────────────
        model = _get_whisper_model()
        if model is not None:
            try:
                lang = getattr(audio_file, "language", None) or None
                segments, info = model.transcribe(
                    tmp_path,
                    language=lang,           # None = auto-detect
                    beam_size=1,             # fastest decoding
                    vad_filter=True,         # skip silence
                    vad_parameters={"min_silence_duration_ms": 300},
                )
                text = " ".join(s.text.strip() for s in segments).strip()
                logger.info(
                    "faster-whisper: lang=%s prob=%.2f text=%r",
                    info.language, info.language_probability, text[:60]
                )
                return {
                    "text":     text or "[no speech detected]",
                    "language": info.language,
                    "duration": getattr(info, "duration", None),
                }
            except Exception as e:
                logger.warning("faster-whisper transcription error: %s — falling back to Groq", e)

        # ── 2. Groq Whisper API (online fallback) ─────────────────────────────
        return await _groq_transcribe(tmp_path)

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


async def _groq_transcribe(tmp_path: str) -> dict:
    """Fallback: Groq Whisper API transcription."""
    from config import OPENAI_API_KEY, OPENAI_BASE_URL, WHISPER_MODEL
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("your_"):
        raise RuntimeError(
            "No offline model available and OPENAI_API_KEY not set. "
            "faster-whisper is installed — check the logs for why it failed."
        )
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)
    with open(tmp_path, "rb") as f:
        transcript = client.audio.transcriptions.create(
            model=WHISPER_MODEL,
            file=f,
            response_format="json",
        )
    return {
        "text":     transcript.text,
        "language": None,
        "duration": getattr(transcript, "duration", None),
    }
