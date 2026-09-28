from datetime import UTC, datetime

import pymongo
from beanie import Document
from pydantic import EmailStr, Field


class User(Document):
    email: EmailStr
    password_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "users"
        indexes = [
            pymongo.IndexModel([("email", pymongo.ASCENDING)], unique=True),
        ]
