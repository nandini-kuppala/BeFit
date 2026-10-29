import asyncio
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

from app.core.config import get_settings

TokenType = Literal["access", "refresh"]

# Pinned rather than read from config: letting the environment choose the
# algorithm is how "none" or an asymmetric/symmetric mix-up gets accepted.
ALGORITHM = "HS256"

# bcrypt silently truncates beyond 72 bytes; reject instead of hashing a prefix.
MAX_PASSWORD_BYTES = 72

# Checked against when the email is unknown, so a failed login costs the same
# time either way and response timing doesn't reveal which emails exist.
_DUMMY_HASH = bcrypt.hashpw(b"timing-equaliser", bcrypt.gensalt()).decode()


def password_fits(password: str) -> bool:
    return len(password.encode()) <= MAX_PASSWORD_BYTES


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _check(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


# bcrypt takes ~250 ms of pure CPU by design. Run on the event loop it stalls
# every other request in flight for that long, so it goes to a thread.
async def hash_password(password: str) -> str:
    return await asyncio.to_thread(_hash, password)


async def verify_password(password: str, password_hash: str | None) -> bool:
    return await asyncio.to_thread(_check, password, password_hash or _DUMMY_HASH)


def create_token(subject: str, token_type: TokenType, version: int = 0) -> str:
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
        # Bumped on sign-out-everywhere and account changes; any token minted
        # under an older version stops working.
        "ver": version,
        "iat": now,
        "exp": now + lifetime,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: TokenType) -> tuple[str, int] | None:
    """Return (subject, version) if the token is valid and of the expected type."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type or not payload.get("sub"):
        return None
    return payload["sub"], int(payload.get("ver", 0))
