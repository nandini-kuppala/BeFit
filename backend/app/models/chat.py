from datetime import UTC, datetime
from typing import Literal

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ChatThread(Document):
    user_id: PydanticObjectId
    title: str = "New conversation"
    messages: list[ChatMessage] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "chat_threads"
        indexes = [
            pymongo.IndexModel(
                [("user_id", pymongo.ASCENDING), ("updated_at", pymongo.DESCENDING)]
            ),
        ]
