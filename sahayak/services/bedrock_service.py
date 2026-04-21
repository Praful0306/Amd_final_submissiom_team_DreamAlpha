"""
Sahayak AI — LLM Service
Call chain: LLaMA 70B (AWS Bedrock) -> Mixtral 8x7B (AWS Bedrock) -> Groq Key 1 -> Groq Key 2 -> error
"""
import json
import logging
import os
import sys

# Ensure parent directory is in path for config import
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    LLAMA_AWS_ACCESS_KEY, LLAMA_AWS_SECRET_KEY, LLAMA_MODEL_ID, LLAMA_AWS_REGION,
    MIXTRAL_AWS_ACCESS_KEY, MIXTRAL_AWS_SECRET_KEY, MIXTRAL_MODEL_ID, MIXTRAL_AWS_REGION,
    GROQ_API_KEY_1, GROQ_API_KEY_2, GROQ_LLM_MODEL, GROQ_EXTRACTION_MODEL,
    GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3, GEMINI_API_KEY_4, GEMINI_API_KEY_5,
    GEMINI_EXTRACTION_MODEL,
    OLLAMA_BASE_URL, OLLAMA_MODEL,
)

logger = logging.getLogger(__name__)

# ── Lazy singletons ───────────────────────────────────────────────────────────
_llama_client   = None
_mixtral_client = None


def _get_llama_client():
    global _llama_client
    if _llama_client is None:
        if not LLAMA_AWS_ACCESS_KEY or not LLAMA_AWS_SECRET_KEY:
            raise RuntimeError("LLaMA AWS credentials not set in .env")
        import boto3
        _llama_client = boto3.client(
            "bedrock-runtime",
            aws_access_key_id=LLAMA_AWS_ACCESS_KEY,
            aws_secret_access_key=LLAMA_AWS_SECRET_KEY,
            region_name=LLAMA_AWS_REGION,
        )
        logger.info(f"LLaMA client ready ({LLAMA_AWS_REGION})")
    return _llama_client


def _get_mixtral_client():
    global _mixtral_client
    if _mixtral_client is None:
        if not MIXTRAL_AWS_ACCESS_KEY or not MIXTRAL_AWS_SECRET_KEY:
            raise RuntimeError("Mixtral AWS credentials not set in .env")
        import boto3
        _mixtral_client = boto3.client(
            "bedrock-runtime",
            aws_access_key_id=MIXTRAL_AWS_ACCESS_KEY,
            aws_secret_access_key=MIXTRAL_AWS_SECRET_KEY,
            region_name=MIXTRAL_AWS_REGION,
        )
        logger.info(f"Mixtral client ready ({MIXTRAL_AWS_REGION})")
    return _mixtral_client


# ── AWS Bedrock invocations ───────────────────────────────────────────────────

def _invoke_llama(system_prompt: str, user_prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
    client = _get_llama_client()
    body = {
        "prompt": (
            f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n"
            f"{system_prompt}<|eot_id|>"
            f"<|start_header_id|>user<|end_header_id|>\n"
            f"{user_prompt}<|eot_id|>"
            f"<|start_header_id|>assistant<|end_header_id|>\n"
        ),
        "max_gen_len": max_tokens,
        "temperature": temperature,
        "top_p": 0.9,
    }
    response = client.invoke_model(
        modelId=LLAMA_MODEL_ID,
        body=json.dumps(body),
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(response["body"].read())
    return result.get("generation", result.get("outputs", [{}])[0].get("text", ""))


def _invoke_mixtral(system_prompt: str, user_prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
    client = _get_mixtral_client()
    prompt = f"<s>[INST] {system_prompt}\n\n{user_prompt} [/INST]"
    body = {
        "prompt": prompt,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": 0.9,
    }
    response = client.invoke_model(
        modelId=MIXTRAL_MODEL_ID,
        body=json.dumps(body),
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(response["body"].read())
    # handle both mistral format and bedrock wrapper format
    outputs = result.get("outputs", [])
    if outputs:
        return outputs[0].get("text", "")
    return result.get("generation", "")


# ── Gemini fast extraction ────────────────────────────────────────────────────

def _invoke_gemini(api_key: str, system_prompt: str, user_prompt: str, max_tokens: int = 400) -> str:
    """Call Gemini 2.0 Flash — fastest model for structured extraction."""
    if not api_key:
        raise RuntimeError("Gemini key is empty")
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=GEMINI_EXTRACTION_MODEL,
        system_instruction=system_prompt,
    )
    response = model.generate_content(
        user_prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.0,
            max_output_tokens=max_tokens,
        ),
        request_options={"timeout": 5},
    )
    return response.text


# ── Groq fallback ─────────────────────────────────────────────────────────────

def _invoke_groq(api_key: str, system_prompt: str, user_prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
    """Call Groq API using the groq SDK."""
    if not api_key:
        raise RuntimeError("Groq key is empty")
    from groq import Groq
    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model=GROQ_LLM_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content


# ── Ollama local fallback ─────────────────────────────────────────────────────

def _invoke_ollama(system_prompt: str, user_prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
    """Call local Ollama — works 100% offline. Handles thinking models (gemma4:e2b etc.)."""
    import urllib.request, json as _json
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }
    data = _json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_BASE_URL}/api/chat",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = _json.loads(resp.read())
    msg = result.get("message", {})
    # Some models (gemma4:e2b) use "thinking" field for chain-of-thought reasoning
    # and put final answer in "content"; if content is empty fall back to thinking
    text = msg.get("content", "").strip()
    if not text:
        text = msg.get("thinking", "").strip()
    if not text:
        raise ValueError(f"Ollama ({OLLAMA_MODEL}) returned empty response. Done: {result.get('done_reason')}")
    return text


# ── Public API ────────────────────────────────────────────────────────────────

def call_llm(
    system_prompt: str,
    user_prompt: str,
    model: str = "llama",
    max_tokens: int = 2048,
    temperature: float = 0.2,
) -> str:
    """
    5-tier call chain (most powerful → most offline-friendly):
      1. LLaMA 70B     (AWS Bedrock)         — cloud, most capable
      2. Mixtral 8x7B  (AWS Bedrock)         — cloud fallback
      3. Groq key-1    (llama-3.1-70b)       — fast cloud fallback
      4. Groq key-2    (llama-3.1-70b)       — second Groq fallback
      5. Ollama local  (gemma2:2b)           — 100% offline, always available

    Never crashes — always returns a result if Ollama is running locally.
    """
    attempts = [
        ("LLaMA 70B (AWS)",    lambda: _invoke_llama(system_prompt, user_prompt, max_tokens, temperature)),
        ("Mixtral 8x7B (AWS)", lambda: _invoke_mixtral(system_prompt, user_prompt, max_tokens, temperature)),
        ("Groq key-1",         lambda: _invoke_groq(GROQ_API_KEY_1, system_prompt, user_prompt, max_tokens, temperature)),
        ("Groq key-2",         lambda: _invoke_groq(GROQ_API_KEY_2, system_prompt, user_prompt, max_tokens, temperature)),
        ("Ollama local",       lambda: _invoke_ollama(system_prompt, user_prompt, max_tokens, temperature)),
    ]

    last_error = None
    for name, fn in attempts:
        try:
            logger.info(f"Trying {name}...")
            result = fn()
            if result and result.strip():
                logger.info(f"Success: {name}")
                return result
            raise ValueError("Empty response")
        except Exception as e:
            logger.warning(f"{name} failed: {e}")
            last_error = e
            continue

    raise RuntimeError(
        f"All LLM backends failed (including local Ollama). Last error: {last_error}. "
        "Ensure Ollama is running: 'ollama serve' and 'ollama pull gemma4:e2b'."
    )


def call_llm_extraction(system_prompt: str, user_prompt: str) -> str:
    """
    FAST extraction — Gemini + Groq run IN PARALLEL, first valid response wins.
    Fallback chain (if both fail): AWS LLaMA → AWS Mixtral → Ollama.

    Target: <3 seconds. Digital PDFs skip LLM entirely (regex handles them).
    """
    import concurrent.futures

    def _groq_fast(key: str) -> str:
        if not key:
            raise RuntimeError("empty key")
        from groq import Groq
        r = Groq(api_key=key).chat.completions.create(
            model=GROQ_EXTRACTION_MODEL,
            messages=[{"role": "system", "content": system_prompt},
                      {"role": "user",   "content": user_prompt}],
            temperature=0.0, max_tokens=400,
        )
        return r.choices[0].message.content

    def _gemini_fast(key: str) -> str:
        return _invoke_gemini(key, system_prompt, user_prompt, max_tokens=400)

    # ── Stage 1: Race Gemini keys (1-3) vs Groq keys — 5s timeout ────────────
    valid_gemini = [k for k in [GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3] if k]
    valid_groq   = [k for k in [GROQ_API_KEY_1, GROQ_API_KEY_2] if k]

    tasks = (
        [(f"Gemini-{i+1}", _gemini_fast, k) for i, k in enumerate(valid_gemini)] +
        [(f"Groq-{i+1}",   _groq_fast,   k) for i, k in enumerate(valid_groq)]
    )

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks) or 1)
    try:
        future_map = {pool.submit(fn, key): name for name, fn, key in tasks}
        try:
            for future in concurrent.futures.as_completed(future_map, timeout=6):
                name = future_map[future]
                try:
                    result = future.result()
                    if result and result.strip():
                        logger.info(f"Extraction won: {name}")
                        return result
                except Exception as e:
                    logger.warning(f"Extraction {name} failed: {e}")
        except concurrent.futures.TimeoutError:
            logger.warning("All parallel extraction attempts timed out (6s)")
    finally:
        pool.shutdown(wait=False)  # never block — fire-and-forget remaining threads

    # ── Stage 2: Sequential AWS fallback ──────────────────────────────────────
    for name, fn in [
        ("LLaMA 70B (AWS)",       lambda: _invoke_llama(system_prompt, user_prompt, max_tokens=400, temperature=0.0)),
        ("Mixtral 8x7B (AWS)",    lambda: _invoke_mixtral(system_prompt, user_prompt, max_tokens=400, temperature=0.0)),
        ("Ollama/Gemma4 (local)", lambda: _invoke_ollama(system_prompt, user_prompt, max_tokens=400, temperature=0.0)),
    ]:
        try:
            logger.info(f"Extraction fallback: {name}")
            result = fn()
            if result and result.strip():
                logger.info(f"Extraction success: {name}")
                return result
        except Exception as e:
            logger.warning(f"{name} failed: {e}")

    raise RuntimeError("All extraction backends failed")
