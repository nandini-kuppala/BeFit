from datetime import UTC, datetime
from typing import Literal

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

Sex = Literal["female", "male", "other"]


class HealthCondition(BaseModel):
    name: str
    notes: str | None = None


class Medication(BaseModel):
    name: str
    dose: str
    time: str = "06:30"
    # Drives the food-lockout window on the dashboard. Levothyroxine needs a
    # 60 min gap from any food and 4 h from calcium, iron or soy protein.
    empty_stomach: bool = False
    food_gap_minutes: int = 0
    mineral_gap_minutes: int = 0


class DietaryRules(BaseModel):
    # Weekday numbers, Monday = 0.
    veg_days: list[int] = Field(default_factory=list)
    excluded_foods: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)


class Routine(BaseModel):
    wake: str = "06:30"
    sleep: str = "22:30"
    gym_start: str | None = None
    gym_end: str | None = None
    work_start: str | None = None
    work_end: str | None = None


class Profile(Document):
    user_id: PydanticObjectId
    name: str
    sex: Sex = "female"
    age: int = Field(ge=13, le=100)
    height_cm: float = Field(gt=0)
    start_weight_kg: float = Field(gt=0)
    goal_weight_kg: float = Field(gt=0)
    # Mifflin-St Jeor multiplier: 1.2 sedentary → 1.725 very active.
    activity_factor: float = 1.55
    # Applied to BMR. Hypothyroidism on adequate replacement measures ~4% lower.
    metabolic_adjustment: float = 1.0

    health_conditions: list[HealthCondition] = Field(default_factory=list)
    medications: list[Medication] = Field(default_factory=list)
    dietary_rules: DietaryRules = Field(default_factory=DietaryRules)
    routine: Routine = Field(default_factory=Routine)

    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "profiles"
        indexes = [
            pymongo.IndexModel([("user_id", pymongo.ASCENDING)], unique=True),
        ]
