import datetime as dt
import json

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field

from app.api.deps import CurrentUser
from app.core import ratelimit
from app.core.config import get_settings
from app.core.security import (
    create_token,
    decode_token,
    hash_password,
    password_fits,
    verify_password,
)
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    email: EmailStr
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
        access_token=create_token(str(user.id), "access", user.token_version),
        refresh_token=create_token(str(user.id), "refresh", user.token_version),
        user_id=str(user.id),
        has_profile=profile is not None,
    )


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(body: Credentials, request: Request) -> TokenPair:
    ratelimit.check(f"register:{ratelimit.client_ip(request)}", 5, 3600)
    email = body.email.lower()

    allowed = get_settings().allowed_email_set
    if allowed and email not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign-ups are closed on this server.",
        )
    if not password_fits(body.password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password is too long — keep it under 72 bytes.",
        )
    if await User.find_one(User.email == email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    user = User(email=email, password_hash=await hash_password(body.password))
    await user.insert()
    return await _tokens_for(user)


@router.post("/login", response_model=TokenPair)
async def login(body: Credentials, request: Request) -> TokenPair:
    email = body.email.lower()
    ratelimit.check(f"login-ip:{ratelimit.client_ip(request)}", 20, 300)
    ratelimit.check(f"login:{email}", 8, 300)
    user = await User.find_one(User.email == email)
    ok = await verify_password(body.password, user.password_hash if user else None)
    if user is None or not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    return await _tokens_for(user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest) -> TokenPair:
    decoded = decode_token(body.refresh_token, "refresh")
    if decoded is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )
    subject, version = decoded
    user = await User.get(PydanticObjectId(subject))
    if user is None or user.token_version != version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has ended."
        )
    return await _tokens_for(user)


class Me(BaseModel):
    id: str
    email: EmailStr


@router.get("/me", response_model=Me)
async def me(user: CurrentUser) -> Me:
    return Me(id=str(user.id), email=user.email)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(user: CurrentUser) -> None:
    """Revokes every token issued so far, on every device."""
    await user.inc({User.token_version: 1})


# ------------------------------------------------------------ data rights
# Play Store requires in-app account deletion for any app that creates
# accounts, and India's DPDP Act gives users the right to their data and to
# erasure. Both act on every collection that holds something of hers.


def _owned_collections() -> list[tuple[type, str]]:
    from app.core.db import document_models

    owned = []
    for model in document_models():
        fields = model.model_fields
        if "user_id" in fields:
            owned.append((model, "user_id"))
        elif "owner_id" in fields:
            owned.append((model, "owner_id"))
    return owned


@router.get("/me/export")
async def export_data(user: CurrentUser) -> Response:
    """Everything stored about this account, as one JSON download."""
    ratelimit.check(f"export:{user.id}", 3, 3600)
    payload: dict = {
        "exported_at": dt.datetime.now(dt.UTC).isoformat(),
        "account": {"email": user.email, "created_at": user.created_at.isoformat()},
    }
    for model, field in _owned_collections():
        rows = await model.find({field: user.id}).to_list()
        payload[model.Settings.name] = [
            row.model_dump(mode="json", exclude={"password_hash"}) for row in rows
        ]
    return Response(
        content=json.dumps(payload, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="befit-export.json"'},
    )


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=72)


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(user: CurrentUser, body: DeleteAccountRequest) -> None:
    """Hard delete — every log, plan, scan and chat, then the account itself.

    Asks for the password again: this cannot be undone, and an unlocked phone
    in someone else's hand should not be enough.
    """
    if not await verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Password is incorrect."
        )
    for model, field in _owned_collections():
        await model.find({field: user.id}).delete()
    await user.delete()
