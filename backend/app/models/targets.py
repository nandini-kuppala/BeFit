from datetime import date

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class MicroTarget(BaseModel):
    key: str
    label: str
    amount: float
    unit: str
    # An upper limit is a ceiling to stay under, not a goal to reach. Iodine in
    # autoimmune thyroid disease is the case this exists for: exceeding it is
    # harmful, so the UI must warn rather than congratulate.
    is_upper_limit: bool = False
    priority: int = 2  # 1 high, 2 medium, 3 low — drives display order


class Targets(Document):
    """Versioned so a day logged in month one is still scored against the
    target that was active then, rather than today's lower one."""

    user_id: PydanticObjectId
    effective_from: date

    bmr_kcal: float
    tdee_kcal: float
    kcal: float
    protein_g: float
    fat_g: float
    carbs_g: float
    fibre_g: float
    water_ml: int = 3000
    sleep_hours: float = 7.5

    rate_kg_per_week: float
    micros: list[MicroTarget] = Field(default_factory=list)

    class Settings:
        name = "targets"
        indexes = [
            pymongo.IndexModel(
                [("user_id", pymongo.ASCENDING), ("effective_from", pymongo.DESCENDING)]
            ),
        ]
