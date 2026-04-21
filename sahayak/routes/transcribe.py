from fastapi import APIRouter, UploadFile, File, HTTPException
from models.schemas import TranscribeResponse
from services.asr_service import transcribe_audio

router = APIRouter(prefix="/transcribe", tags=["Transcription"])

# MIME types that are audio (including octet-stream which browsers sometimes send for blobs)
_AUDIO_TYPES = {
    "audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg",
    "audio/wav", "audio/wave", "audio/x-wav", "audio/flac",
    "audio/aac", "audio/opus", "video/webm",  # browsers may send video/webm for audio
    "application/octet-stream",               # generic blob MIME from some browsers
    "",                                        # no content-type header — accept anyway
}


@router.post("/", response_model=TranscribeResponse)
async def transcribe(
    file: UploadFile  = File(None),
    audio: UploadFile = File(None),
):
    """Transcribe an uploaded audio file to text using faster-whisper (offline).

    Accepts either 'file' or 'audio' field name for compatibility.
    Primary: faster-whisper tiny (offline, ~1s on CPU).
    Fallback: Groq Whisper API (online).
    """
    upload = file or audio
    if upload is None:
        raise HTTPException(
            status_code=422,
            detail="Audio file required. Send a FormData field named 'file' or 'audio'."
        )

    ct = (upload.content_type or "").lower().split(";")[0].strip()
    if ct not in _AUDIO_TYPES and not ct.startswith("audio/") and not ct.startswith("video/"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: '{ct}'. Send an audio file (webm, mp4, wav, ogg, mp3)."
        )

    try:
        result = await transcribe_audio(upload)
        return TranscribeResponse(
            text=result.get("text", ""),
            duration=result.get("duration"),
            language=result.get("language"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
