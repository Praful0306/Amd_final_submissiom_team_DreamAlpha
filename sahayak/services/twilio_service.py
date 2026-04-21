"""
Sahayak AI — Direct Twilio SMS Service
Backend fallback for SMS/calls — works without Make.com.

Usage:
  from services.twilio_service import send_sms, send_bulk_alert
"""
import logging
import os
from typing import Optional

logger = logging.getLogger("sahayak.twilio")


def _get_credentials():
    """Read Twilio credentials from env at call-time."""
    return (
        os.getenv("TWILIO_ACCOUNT_SID", ""),
        os.getenv("TWILIO_AUTH_TOKEN", ""),
        os.getenv("TWILIO_PHONE_NUMBER", ""),
    )


def _get_client():
    """Return Twilio REST client or raise if not configured."""
    sid, token, _ = _get_credentials()
    if not sid or not token:
        raise RuntimeError(
            "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set in .env"
        )
    if sid.startswith("your_") or token.startswith("your_"):
        raise RuntimeError("Twilio credentials are still placeholders in .env")
    from twilio.rest import Client
    return Client(sid, token)


def _normalize_phone(phone: str) -> str:
    """Ensure phone is E.164 format for Twilio."""
    phone = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if phone.startswith("0"):
        phone = "+91" + phone[1:]           # Indian local → E.164
    elif phone.startswith("91") and not phone.startswith("+"):
        phone = "+" + phone
    elif not phone.startswith("+"):
        phone = "+91" + phone               # assume India if no country code
    return phone


def send_sms(to_phone: str, message: str) -> dict:
    """
    Send a single SMS via Twilio.
    Returns: {"success": bool, "sid": str|None, "error": str|None}
    """
    try:
        _, _, from_phone = _get_credentials()
        to = _normalize_phone(to_phone)
        client = _get_client()
        msg = client.messages.create(
            body=message[:1600],            # Twilio limit
            from_=from_phone,
            to=to,
        )
        logger.info("SMS sent to %s — SID: %s", to, msg.sid)
        return {"success": True, "sid": msg.sid, "error": None}
    except Exception as exc:
        logger.error("Twilio SMS failed to %s: %s", to_phone, exc)
        return {"success": False, "sid": None, "error": str(exc)}


def send_high_risk_alert(patient_name: str, patient_phone: str,
                          risk_level: str, diagnosis: Optional[str],
                          asha_phone: Optional[str] = None) -> dict:
    """
    Send HIGH/EMERGENCY alert SMS to patient and ASHA worker.
    Returns combined result dict.
    """
    msg = (
        f"[Sahayak AI Alert] {risk_level}: {patient_name} "
        f"— {diagnosis or 'Clinical assessment needed'}. "
        "Please contact your ASHA worker or nearest PHC immediately."
    )
    results = {}

    # SMS to patient
    if patient_phone:
        results["patient"] = send_sms(patient_phone, msg)

    # SMS to ASHA worker
    if asha_phone:
        asha_msg = (
            f"[Sahayak AI] HIGH RISK PATIENT: {patient_name} | "
            f"Risk: {risk_level} | Dx: {diagnosis or 'Unknown'}. "
            "Immediate home visit recommended."
        )
        results["asha"] = send_sms(asha_phone, asha_msg)

    return results


def send_bulk_alert(patients: list) -> dict:
    """
    Send SMS to multiple high-risk patients at once.
    patients: list of {name, phone, risk_level, diagnosis}
    """
    sent = 0
    failed = 0
    for p in patients:
        r = send_sms(
            p.get("phone", ""),
            f"[Sahayak AI] Health alert for {p.get('name','Patient')}: "
            f"{p.get('risk_level','HIGH')} risk. "
            f"{p.get('diagnosis','Assessment needed')}. "
            "Please visit your nearest PHC.",
        )
        if r["success"]:
            sent += 1
        else:
            failed += 1
    return {"sent": sent, "failed": failed, "total": len(patients)}


def twilio_configured() -> bool:
    """Check if Twilio is properly configured without making an API call."""
    sid, token, phone = _get_credentials()
    return bool(sid and token and phone and
                not sid.startswith("your_") and
                not token.startswith("your_"))
