"""
Sahayak AI — PDF/Image text extraction service.

Pipeline (in order):
  1. EasyOCR                         ← FIRST PRIORITY (multilingual: Hindi, Kannada, Telugu, Tamil, English)
  2. PyMuPDF direct text extraction  (fast fallback for clean text-based PDFs)
  3. PyMuPDF render → Tesseract OCR  (fallback if EasyOCR not installed)
  4. Raw byte scan                   (worst case)

Returns clean text ready to send to LLM.
"""
import io
import logging
import os
import re

logger = logging.getLogger(__name__)

# ── EasyOCR singleton (expensive to load, so we load once and reuse) ──────────
_easyocr_reader = None

def _get_easyocr_reader():
    """Lazy-load EasyOCR reader with Indian language support."""
    global _easyocr_reader
    if _easyocr_reader is None:
        try:
            import easyocr
            # English + major Indian languages used on medical reports
            _easyocr_reader = easyocr.Reader(
                ["en", "hi"],   # Add "kn", "ta", "te" if needed (slower load)
                gpu=False,      # Set True if CUDA available — much faster
                verbose=False,
            )
            logger.info("EasyOCR reader loaded (en + hi)")
        except ImportError:
            logger.warning("EasyOCR not installed — run: pip install easyocr")
        except Exception as e:
            logger.warning(f"EasyOCR failed to load: {e}")
    return _easyocr_reader


# ── Main extraction entry point ───────────────────────────────────────────────

async def extract_medical_data(file_bytes: bytes, filename: str = "report.pdf") -> dict:
    """
    FAST extraction pipeline — targets <8 seconds total.

    Strategy:
      1. PyMuPDF text extraction (sync, ~50ms)
      2. Regex extraction (sync, ~1ms) — instant vitals
      3. If regex gets ≥7 key vitals → skip LLM, return immediately
      4. Otherwise: run Groq llama-3.1-8b-instant with 8s timeout
      5. Merge LLM + regex; regex fills gaps
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    from services.extraction_service import (
        normalise_language, translate_with_aws, extract_with_regex,
        EXTRACTION_SYSTEM, EXTRACTION_USER_TEMPLATE,
        parse_llm_json, map_to_form, merge_results, validate_form, interpret_vitals
    )
    from services.bedrock_service import call_llm_extraction

    # ── Step 1: OCR (sync, fast for digital PDFs via PyMuPDF) ─────────────────
    raw_text = extract_text_from_pdf(file_bytes, filename)
    if not raw_text:
        return {"success": False, "error": "No text extracted", "data": {}, "completion_pct": 0}

    # ── Step 2: Normalize (skip AWS translate for English text) ───────────────
    clean_text = normalise_language(raw_text)
    # Only translate if significant non-ASCII (Indian language) content
    non_ascii = sum(1 for c in clean_text if ord(c) > 127)
    if non_ascii / max(len(clean_text), 1) >= 0.15:
        clean_text = translate_with_aws(clean_text)

    # ── Step 3: Regex — instant, always runs ─────────────────────────────────
    regex_data = extract_with_regex(clean_text)
    KEY_VITALS = {"bp", "hr", "temp", "spo2", "sugar", "hb"}
    regex_vitals_found = sum(1 for k in KEY_VITALS if regex_data.get(k))
    logger.info(f"Regex found {len(regex_data)} fields, {regex_vitals_found} key vitals")

    # ── Step 4: LLM (skip if regex already got most vitals) ──────────────────
    llm_form = {}
    if regex_vitals_found >= 5:
        # Regex captured enough vitals — skip LLM for max speed
        logger.info("Regex sufficient (≥5 vitals) — skipping LLM for speed")
    else:
        logger.info("Running Groq 8b-instant extraction (fast path)…")
        user_prompt = EXTRACTION_USER_TEMPLATE.format(text=clean_text[:2000])
        try:
            loop = asyncio.get_event_loop()
            with ThreadPoolExecutor(max_workers=1) as pool:
                llm_raw = await asyncio.wait_for(
                    loop.run_in_executor(pool, call_llm_extraction, EXTRACTION_SYSTEM, user_prompt),
                    timeout=8.0,  # hard cap — never block UI more than 8s
                )
            llm_form = map_to_form(parse_llm_json(llm_raw))
            logger.info(f"LLM extraction succeeded: {sum(1 for v in llm_form.values() if v)} fields")
        except asyncio.TimeoutError:
            logger.warning("LLM extraction timed out (8s) — using regex only")
        except Exception as e:
            logger.warning(f"LLM extraction failed: {e} — using regex only")

    # ── Step 5: Merge (LLM wins, regex fills nulls) ───────────────────────────
    form = merge_results(llm_form, regex_data)

    # ── Step 6: Validate + interpret ─────────────────────────────────────────
    result = validate_form(form)
    interpret_vitals(form)
    interpretation = form.get("_interpretation", {})
    red_flags      = form.get("_red_flags", [])
    abnormal_count = form.get("_abnormal_count", 0)

    result["form"].update({
        "interpretation": interpretation,
        "red_flags":      red_flags,
        "abnormal_count": abnormal_count,
    })

    logger.info(f"Extraction complete — {result['filled_count']} fields, {result['completion_pct']}%")
    return {
        "success"        : True,
        "data"           : result["form"],
        "fields_filled"  : result["filled_count"],
        "completion_pct" : result["completion_pct"],
        "interpretation" : interpretation,
        "red_flags"      : red_flags,
        "abnormal_count" : abnormal_count,
        "missing_fields" : result["missing_core"]
    }


# ── PDF / Image router ────────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes, filename: str = "report.pdf") -> str:
    """
    Extract text from a PDF or image file.

    Pipeline:
      Images → EasyOCR → Tesseract fallback
      PDFs   → PyMuPDF direct → EasyOCR → Tesseract → raw byte scan
    """
    ext = os.path.splitext(filename)[1].lower()

    if ext in (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"):
        return _ocr_image_bytes(file_bytes)

    # ── PDF path ──────────────────────────────────────────────────────────────

    # Step 1: PyMuPDF direct — FASTEST for digital/text-based PDFs (no ML, instant)
    logger.info("PDF uploaded — trying PyMuPDF direct extraction first (fastest)")
    text = _pymupdf_direct(file_bytes)
    if len(text.replace(" ", "").replace("\n", "")) >= 100:
        logger.info("PyMuPDF direct extraction succeeded")
        return _clean(text)

    # Step 2: EasyOCR — for scanned PDFs / handwritten / Indian language text
    logger.info("PyMuPDF insufficient — running EasyOCR (handles scanned + Indian text)")
    text = _easyocr_pdf(file_bytes)
    if len(text.replace(" ", "").replace("\n", "")) >= 50:
        logger.info("EasyOCR extraction succeeded")
        return _clean(text)

    # Step 3: Tesseract fallback
    logger.info("EasyOCR insufficient — trying Tesseract fallback")
    text = _pymupdf_ocr(file_bytes)
    if len(text.replace(" ", "").replace("\n", "")) >= 50:
        logger.info("Tesseract extraction succeeded")
        return _clean(text)

    # Step 4: Raw byte scan (absolute last resort)
    logger.warning("All OCR methods got too little text — using raw byte scan")
    text = _raw_byte_scan(file_bytes)

    cleaned = _clean(text)
    logger.info(f"Extracted {len(cleaned)} chars from {filename}")
    logger.debug(f"First 500 chars:\n{cleaned[:500]}")
    return cleaned


# ── EasyOCR functions ─────────────────────────────────────────────────────────

def _easyocr_pdf(pdf_bytes: bytes) -> str:
    """Render each PDF page as image, run EasyOCR (multilingual)."""
    reader = _get_easyocr_reader()
    if reader is None:
        return ""
    try:
        import fitz
        import numpy as np

        doc  = fitz.open(stream=pdf_bytes, filetype="pdf")
        text = ""
        for page_num in range(min(len(doc), 3)):   # max 3 pages
            page = doc.load_page(page_num)
            pix  = page.get_pixmap(matrix=fitz.Matrix(200/72, 200/72))
            img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                pix.height, pix.width, pix.n
            )
            results = reader.readtext(img_array, detail=0, paragraph=True)
            text += "\n".join(results) + "\n"
        doc.close()
        return text
    except Exception as e:
        logger.warning(f"EasyOCR PDF extraction failed: {e}")
        return ""


def _easyocr_image(img_bytes: bytes) -> str:
    """Run EasyOCR directly on an image file."""
    reader = _get_easyocr_reader()
    if reader is None:
        return ""
    try:
        import numpy as np
        from PIL import Image

        img     = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        arr     = np.array(img)
        results = reader.readtext(arr, detail=0, paragraph=True)
        return "\n".join(results)
    except Exception as e:
        logger.warning(f"EasyOCR image extraction failed: {e}")
        return ""


# ── Image OCR (EasyOCR first, Tesseract fallback) ────────────────────────────

def _ocr_image_bytes(img_bytes: bytes) -> str:
    """For image files: try EasyOCR first, Tesseract as fallback."""
    text = _easyocr_image(img_bytes)
    if len(text.replace(" ", "").replace("\n", "")) >= 30:
        logger.info("EasyOCR image extraction succeeded")
        return _clean(text)

    logger.info("EasyOCR image insufficient — trying Tesseract")
    return _clean(_tesseract_image(img_bytes))


def _tesseract_image(img_bytes: bytes) -> str:
    """Run Tesseract directly on an image file."""
    try:
        import pytesseract
        from PIL import Image
        img = Image.open(io.BytesIO(img_bytes))
        return pytesseract.image_to_string(img, lang="eng", config="--psm 6")
    except Exception as e:
        logger.warning(f"Tesseract image OCR failed: {e}")
        return ""


# ── PyMuPDF functions ─────────────────────────────────────────────────────────

def _pymupdf_direct(pdf_bytes: bytes) -> str:
    """Extract selectable text directly from PDF."""
    try:
        import fitz
        doc  = fitz.open(stream=pdf_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text("text") + "\n"
        doc.close()
        return text
    except Exception as e:
        logger.warning(f"PyMuPDF direct extraction failed: {e}")
        return ""


def _pymupdf_ocr(pdf_bytes: bytes) -> str:
    """Render each PDF page as image, run Tesseract OCR."""
    try:
        import fitz
        import pytesseract
        from PIL import Image

        doc  = fitz.open(stream=pdf_bytes, filetype="pdf")
        text = ""
        for page_num in range(min(len(doc), 3)):
            page = doc.load_page(page_num)
            pix  = page.get_pixmap(matrix=fitz.Matrix(200/72, 200/72))
            img  = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            text += pytesseract.image_to_string(img, lang="eng", config="--psm 6") + "\n"
        doc.close()
        return text
    except Exception as e:
        logger.warning(f"Tesseract PDF OCR failed: {e}")
        return ""


def _raw_byte_scan(pdf_bytes: bytes) -> str:
    """Last resort: scan for readable ASCII strings >= 4 chars."""
    raw   = "".join(chr(b) if 32 <= b <= 126 else " " for b in pdf_bytes)
    words = [w for w in raw.split() if len(w) >= 4]
    return " ".join(words)


# ── Text cleanup ──────────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    """Strip PDF structural garbage, normalise whitespace."""
    text = re.sub(r"<<[\s\S]*?>>",                        " ", text)
    text = re.sub(r"\b(endstream|endobj|startxref|xref)\b", " ", text)
    text = re.sub(r"\d+ \d+ obj\b",                        " ", text)
    text = re.sub(r"xref[\s\S]{0,600}%%EOF",               " ", text)
    text = re.sub(r"[<>]{2,}",                             " ", text)
    text = re.sub(r"[0-9a-f]{20,}",                        " ", text, flags=re.IGNORECASE)
    text = re.sub(r"/[A-Z][A-Za-z]+",                      " ", text)
    text = re.sub(r"[ \t]+",                                " ", text)
    text = re.sub(r"\n{3,}",                                "\n\n", text)
    return text.strip()
