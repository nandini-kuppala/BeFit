import datetime as dt
from typing import Annotated

from beanie import PydanticObjectId
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core import ratelimit
from app.core.clock import local_today
from app.core.security import decode_token
from app.models.profile import Profile
from app.models.targets import Targets
from app.models.user import User

bearer = HTTPBearer(auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    if credentials is None:
        raise CREDENTIALS_ERROR
    decoded = decode_token(credentials.credentials, "access")
    if decoded is None:
        raise CREDENTIALS_ERROR
    subject, version = decoded
    try:
        user = await User.get(PydanticObjectId(subject))
    except Exception:
        raise CREDENTIALS_ERROR from None
    if user is None or user.token_version != version:
        raise CREDENTIALS_ERROR
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def current_profile(user: CurrentUser) -> Profile:
    profile = await Profile.find_one(Profile.user_id == user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile not set up. Complete onboarding first.",
        )
    return profile


CurrentProfile = Annotated[Profile, Depends(current_profile)]


async def targets_on(user_id: PydanticObjectId, on: dt.date | None = None) -> Targets:
    """The targets that were in force on `on` — not simply the newest.

    Targets are versioned so that a day from last month is scored against what
    she was aiming for then. Reading the latest row for every date silently
    re-scored all of history whenever the plan changed.
    """
    query = Targets.find(Targets.user_id == user_id)
    if on is not None:
        query = Targets.find(Targets.user_id == user_id, Targets.effective_from <= on)
    targets = await query.sort(-Targets.effective_from).first_or_none()
    if targets is None and on is not None:
        # A day before the first target existed: the earliest is the best proxy.
        targets = (
            await Targets.find(Targets.user_id == user_id)
            .sort(+Targets.effective_from)
            .first_or_none()
        )
    if targets is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No targets yet. Complete onboarding first.",
        )
    return targets


async def active_targets(user: CurrentUser) -> Targets:
    return await targets_on(user.id)


ActiveTargets = Annotated[Targets, Depends(active_targets)]


# Optional `on` query parameter that defaults to the user's local today.
LocalDate = Annotated[dt.date, Query(default_factory=local_today)]


def ai_quota(limit: int = 20, window_s: float = 60.0):
    """Per-user ceiling for routes that spend Gemini / Sarvam / Tavily quota."""

    async def dependency(user: CurrentUser) -> User:
        ratelimit.check(f"ai:{user.id}", limit, window_s)
        return user

    return Depends(dependency)
