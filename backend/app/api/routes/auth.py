from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.api.deps import CurrentUser
from app.core.security import (
    create_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    email: EmailStr
    # bcrypt truncates silently past 72 bytes, so cap it rather than hash a prefix.
    password: str = Field(min_length=8, max_length=72)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: str
    has_profile: bool


async def _tokens_for(user: User) -> TokenPair:
    from app.models.profile import Profile

    profile = await Profile.find_one(Profile.user_id == user.id)
    return TokenPair(
        access_token=create_token(str(user.id), "access"),
        refresh_token=create_token(str(user.id), "refresh"),
        user_id=str(user.id),
        has_profile=profile is not None,
    )


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(body: Credentials) -> TokenPair:
    email = body.email.lower()
    if await User.find_one(User.email == email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    user = User(email=email, password_hash=hash_password(body.password))
    await user.insert()
    return await _tokens_for(user)


@router.post("/login", response_model=TokenPair)
async def login(body: Credentials) -> TokenPair:
    user = await User.find_one(User.email == body.email.lower())
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    return await _tokens_for(user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest) -> TokenPair:
    from beanie import PydanticObjectId

    subject = decode_token(body.refresh_token, "refresh")
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )
    user = await User.get(PydanticObjectId(subject))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found."
        )
    return await _tokens_for(user)


class Me(BaseModel):
    id: str
    email: EmailStr


@router.get("/me", response_model=Me)
async def me(user: CurrentUser) -> Me:
    return Me(id=str(user.id), email=user.email)
