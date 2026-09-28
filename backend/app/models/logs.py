from datetime import UTC, date, datetime
from typing import Literal

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

from app.models.food import Confidence, FoodSource
from app.models.nutrients import Nutrients

Meal = Literal["breakfast", "mid_morning", "lunch", "snack", "dinner"]

MEAL_ORDER: tuple[Meal, ...] = (
    "breakfast",
    "mid_morning",
    "lunch",
    "snack",
    "dinner",
)


class LoggedFood(BaseModel):
    food_id: PydanticObjectId | None = None
    name: str
    quantity: float = 1.0
    unit: str = "serving"
    grams: float
    # Resolved at log time and frozen. If the underlying food is later
    # corrected, history stays as it was actually eaten and counted.
    nutrients: Nutrients
    source: FoodSource
    confidence: Confidence


class FoodLog(Document):
    user_id: PydanticObjectId
    date: date
    meal: Meal
    items: list[LoggedFood] = Field(default_factory=list)
    logged_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    via_voice: bool = False

    def totals(self) -> Nutrients:
        total = Nutrients()
        for item in self.items:
            total = total + item.nutrients
        return total

    class Settings:
        name = "food_logs"
        indexes = [
            pymongo.IndexModel(
                [("user_id", pymongo.ASCENDING), ("date", pymongo.DESCENDING)]
            ),
        ]


class WaterEntry(BaseModel):
    ml: int
    at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class WaterLog(Document):
    user_id: PydanticObjectId
    date: date
    entries: list[WaterEntry] = Field(default_factory=list)

    @property
    def total_ml(self) -> int:
        return sum(entry.ml for entry in self.entries)

    class Settings:
        name = "water_logs"
        indexes = [
            pymongo.IndexModel(
                [("user_id", pymongo.ASCENDING), ("date", pymongo.DESCENDING)],
                unique=True,
            ),
        ]


class SleepLog(Document):
    user_id: PydanticObjectId
    date: date  # the morning she woke up
    bed_at: datetime
    wake_at: datetime
    quality: int | None = Field(default=None, ge=1, le=5)

    @property
    def duration_minutes(self) -> int:
        return int((self.wake_at - self.bed_at).total_seconds() // 60)

    class Settings:
        name = "sleep_logs"
        indexes = [
            pymongo.IndexModel(
                [("user_id", pymongo.ASCENDING), ("date", pymongo.DESCENDING)],
                unique=True,
            ),
        ]


class WeightLog(Document):
    user_id: PydanticObjectId
    date: date
    kg: float = Field(gt=0)
    note: str | None = None

    class Settings:
        name = "weight_logs"
        indexes = [
            pymongo.IndexModel(
                [("user_id", pymongo.ASCENDING), ("date", pymongo.DESCENDING)],
                unique=True,
            ),
        ]
