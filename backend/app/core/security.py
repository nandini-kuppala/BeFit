from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

from app.core.config import get_settings

TokenType = Literal["access", "refresh"]

# bcrypt silently truncates beyond 72 bytes; reject instead of hashing a prefix.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(subject: str, token_type: TokenType) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    lifetime = (
        timedelta(minutes=settings.access_token_minutes)
        if token_type == "access"
        else timedelta(days=settings.refresh_token_days)
    )
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + lifetime,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType) -> str | None:
    """Return the subject if the token is valid and of the expected type."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload.get("sub")
