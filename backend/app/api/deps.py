from typing import Annotated

from beanie import PydanticObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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
    subject = decode_token(credentials.credentials, "access")
    if subject is None:
        raise CREDENTIALS_ERROR
    user = await User.get(PydanticObjectId(subject))
    if user is None:
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


async def active_targets(user: CurrentUser) -> Targets:
    targets = (
        await Targets.find(Targets.user_id == user.id)
        .sort(-Targets.effective_from)
        .first_or_none()
    )
    if targets is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No targets yet. Complete onboarding first.",
        )
    return targets


ActiveTargets = Annotated[Targets, Depends(active_targets)]
