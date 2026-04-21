"""
Sahayak AI — Firebase Authentication Service
Replaces JWT auth with Firebase Auth.

Flow:
  1. User signs in via Firebase SDK on frontend (email + password)
  2. Firebase returns an ID token (signed JWT)
  3. Frontend sends token as: Authorization: Bearer <firebase_id_token>
  4. Backend verifies token with firebase-admin
  5. Firebase UID is extracted — used as primary user identifier

Setup:
  - Set FIREBASE_SERVICE_ACCOUNT_PATH in .env (path to downloaded JSON)
  - OR set FIREBASE_SERVICE_ACCOUNT_JSON (full JSON as string, for deployment)
"""
import os
import json
import logging
from typing import Optional

logger = logging.getLogger("sahayak.firebase_auth")

_firebase_app = None
_firebase_available = False


def _init_firebase():
    """Lazy-initialise Firebase Admin SDK. Returns True if successful."""
    global _firebase_app, _firebase_available

    if _firebase_available:
        return True

    try:
        import firebase_admin
        from firebase_admin import credentials, auth as fb_auth

        # Option 1: JSON file path
        sa_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "")
        # Option 2: Full JSON string (for Render/Railway/Heroku deployment)
        sa_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")

        if _firebase_app is None:
            if sa_path and os.path.exists(sa_path):
                cred = credentials.Certificate(sa_path)
            elif sa_json:
                sa_dict = json.loads(sa_json)
                cred = credentials.Certificate(sa_dict)
            else:
                logger.warning(
                    "Firebase: No service account configured. "
                    "Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON in .env"
                )
                return False

            _firebase_app = firebase_admin.initialize_app(cred)

        _firebase_available = True
        logger.info("Firebase Admin SDK initialised ✅")
        return True

    except ImportError:
        logger.warning(
            "firebase-admin not installed. Run: pip install firebase-admin\n"
            "Falling back to local JWT auth."
        )
        return False
    except Exception as exc:
        logger.error("Firebase init failed: %s", exc)
        return False


def verify_firebase_token(id_token: str) -> Optional[dict]:
    """
    Verify a Firebase ID token and return the decoded claims.
    Returns None if invalid or Firebase not configured.

    Returned dict contains:
      uid:   str   — Firebase UID (globally unique)
      email: str   — user's email
      name:  str   — display name (if set)
    """
    if not _init_firebase():
        return None

    try:
        from firebase_admin import auth as fb_auth
        decoded = fb_auth.verify_id_token(id_token)
        return {
            "uid":   decoded.get("uid"),
            "email": decoded.get("email", ""),
            "name":  decoded.get("name", decoded.get("display_name", "")),
        }
    except Exception as exc:
        logger.warning("Firebase token verification failed: %s", exc)
        return None


def get_or_create_firebase_user(
    uid: str,
    email: str,
    name: str,
    role: str,
    db
) -> "User":
    """
    Get existing user by firebase_uid, or create a new one.
    This replaces the old register/login endpoints.
    Called on every authenticated request if user not in local DB yet.
    """
    from db.database import User, Patient
    from services.auth_service import generate_share_code

    # Check if user already exists by firebase_uid
    user = db.query(User).filter(User.firebase_uid == uid).first()
    if user:
        return user

    # Also check by email (handles users who registered before Firebase migration)
    user = db.query(User).filter(User.email == email.lower()).first()
    if user:
        # Link Firebase UID to existing account
        user.firebase_uid = uid
        db.commit()
        from services.sync_service import queue_snapshot_change
        queue_snapshot_change("user", user.id, actor_id=user.id, actor_role=user.role)
        return user

    # Create new user record
    safe_name = name or email.split("@")[0].title()
    user = User(
        email=email.lower(),
        password_hash="firebase_auth",  # no local password needed
        full_name=safe_name,
        role=role if role in ("patient", "doctor", "asha") else "patient",
        firebase_uid=uid,
        is_active=True,
    )
    db.add(user)
    db.flush()

    # Create patient profile automatically for patient role
    if user.role == "patient":
        share = generate_share_code()
        while db.query(Patient).filter(Patient.share_code == share).first():
            share = generate_share_code()
        patient = Patient(
            user_id=user.id,
            firebase_uid=uid,
            name=user.full_name,
            age=0,
            gender="Not specified",
            email=email.lower(),
            share_code=share,
        )
        db.add(patient)

    db.commit()
    from services.sync_service import queue_snapshot_change
    queue_snapshot_change("user", user.id, actor_id=user.id, actor_role=user.role)
    if user.role == "patient":
        patient = db.query(Patient).filter(Patient.user_id == user.id).first()
        if patient:
            queue_snapshot_change("patient", patient.id, actor_id=user.id, actor_role=user.role)
    logger.info("New Firebase user created: uid=%s role=%s", uid, user.role)
    return user


def firebase_is_configured() -> bool:
    """Check if Firebase Admin is configured and ready."""
    return _init_firebase()
