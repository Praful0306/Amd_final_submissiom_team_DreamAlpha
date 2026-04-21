import asyncio
import os
import uuid

OUTPUT_DIR = "static/audio"
os.makedirs(OUTPUT_DIR, exist_ok=True)

_MAX_CHARS = 500   # gTTS fails on very long strings; truncate safely


def _gtts_sync(text: str, lang: str, filepath: str) -> str:
    """Blocking gTTS call — run inside an executor to avoid blocking the event loop."""
    from gtts import gTTS
    # Truncate to safe length; gTTS crashes on >5000 chars in some locales
    safe_text = text[:_MAX_CHARS].strip()
    if not safe_text:
        safe_text = "Audio generation complete."
    tts = gTTS(text=safe_text, lang=lang, slow=False)
    tts.save(filepath)
    return filepath


async def text_to_speech(text: str, lang: str = "en") -> str:
    """Convert text to speech using Google TTS and return the file path.

    gTTS makes a blocking HTTP call to Google servers.
    We run it in a thread executor so the asyncio event loop is never blocked.

    Args:
        text: The text to synthesise (truncated to 500 chars).
        lang: BCP-47 language code (default "en").

    Returns:
        Path to the generated .mp3 file.
    """
    filename = f"{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(OUTPUT_DIR, filename)

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _gtts_sync, text, lang, filepath)
    return filepath
