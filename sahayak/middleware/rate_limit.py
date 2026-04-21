"""
Sahayak AI — Rate Limiter
In-memory token bucket per IP address per action.
Strictly guards expensive AWS Bedrock calls to control cost.

Limits (configurable via .env):
  /diagnose/   : 10 calls / hour per IP
  /diagnose/tts: 20 calls / hour per IP
  /upload-report: 5 calls / hour per IP
"""
import time
import logging
from collections import defaultdict
from typing import Dict, List

from config import (
    RATE_LIMIT_DIAGNOSE_PER_HOUR,
    RATE_LIMIT_TTS_PER_HOUR,
    RATE_LIMIT_OCR_PER_HOUR,
)

logger = logging.getLogger(__name__)

# ── Storage ───────────────────────────────────────────────────────────────────
# {action_key: {ip: [timestamps]}}
# No threading.Lock needed — FastAPI runs in a single thread (asyncio event loop).
# threading.Lock would block the event loop on every request.
_buckets: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))

# ── Limits config ─────────────────────────────────────────────────────────────
LIMITS = {
    "diagnose":  {"max": RATE_LIMIT_DIAGNOSE_PER_HOUR,  "window": 3600},
    "tts":       {"max": RATE_LIMIT_TTS_PER_HOUR,        "window": 3600},
    "ocr":       {"max": RATE_LIMIT_OCR_PER_HOUR,        "window": 3600},
}


def check_and_consume(ip: str, action: str) -> dict:
    """
    Check if the IP is within rate limit for the given action.
    Consumes one token if allowed.

    Returns:
        {
          "allowed": bool,
          "remaining": int,
          "reset_in_seconds": int,
          "limit": int
        }
    """
    config = LIMITS.get(action, {"max": 10, "window": 3600})
    max_calls = config["max"]
    window    = config["window"]
    now       = time.time()
    cutoff    = now - window

    if True:  # no lock needed in single-process asyncio
        bucket = _buckets[action][ip]
        # Remove expired timestamps
        _buckets[action][ip] = [t for t in bucket if t > cutoff]
        bucket = _buckets[action][ip]

        remaining = max_calls - len(bucket)

        if remaining <= 0:
            oldest   = min(bucket)
            reset_in = int(window - (now - oldest))
            logger.warning(f"Rate limit hit: ip={ip} action={action}")
            return {
                "allowed": False,
                "remaining": 0,
                "reset_in_seconds": max(0, reset_in),
                "limit": max_calls,
            }

        # Consume one token
        _buckets[action][ip].append(now)
        remaining -= 1

        return {
            "allowed": True,
            "remaining": remaining,
            "reset_in_seconds": window,
            "limit": max_calls,
        }


def get_status(ip: str) -> dict:
    """Return current rate limit status for all actions for this IP."""
    now = time.time()
    status = {}
    if True:  # no lock needed in single-process asyncio
        for action, config in LIMITS.items():
            window  = config["window"]
            max_c   = config["max"]
            cutoff  = now - window
            bucket  = [t for t in _buckets[action].get(ip, []) if t > cutoff]
            status[action] = {
                "used": len(bucket),
                "remaining": max(0, max_c - len(bucket)),
                "limit": max_c,
            }
    # Expose simplest view for frontend
    return {
        "remaining": status.get("diagnose", {}).get("remaining", RATE_LIMIT_DIAGNOSE_PER_HOUR),
        "limit": RATE_LIMIT_DIAGNOSE_PER_HOUR,
        "detail": status,
    }
