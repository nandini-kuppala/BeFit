from datetime import UTC, datetime

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class DietDay(BaseModel):
    weekday: int = Field(ge=0, le=6)
    is_veg: bool = False
    # meal key → what to eat. Free text, because a meal plan she can't edit in
    # her own words is a meal plan she stops following.
    meals: dict[str, str] = Field(default_factory=dict)
    note: str | None = None


class DietPlan(Document):
    user_id: PydanticObjectId
    days: list[DietDay] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "diet_plans"
        indexes = [pymongo.IndexModel([("user_id", pymongo.ASCENDING)], unique=True)]
