from datetime import UTC, datetime

import pymongo
from beanie import Document
from pydantic import EmailStr, Field


class User(Document):
    email: EmailStr
    password_hash: str
    # Every token carries the version it was minted under. Incrementing this
    # revokes all of them at once — sign out everywhere, or a password change.
    token_version: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "users"
        indexes = [
            pymongo.IndexModel([("email", pymongo.ASCENDING)], unique=True),
        ]
