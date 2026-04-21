"""
Sahayak AI — Authentication Service
JWT tokens, password hashing, share code generation.
"""
import os
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional

from passlib.context import CryptContext
from jose import JWTError, jwt

SECRET_KEY  = os.getenv("JWT_SECRET_KEY", secrets.token_hex(32))
ALGORITHM   = "HS256"
ACCESS_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_ctx.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    # JWT spec (RFC 7519) requires sub to be a string
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM],
                             options={"verify_sub": False})  # allow integer sub for backward compat
        return payload
    except JWTError as e:
        import logging
        logging.getLogger("sahayak.auth").warning("decode_token JWTError: %s | key_prefix=%s", e, SECRET_KEY[:8])
        return None


def generate_share_code(length: int = 8) -> str:
    """Generate a patient share code for doctor access."""
    chars = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(length))
