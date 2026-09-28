import datetime as dt
from typing import Literal

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import Field

# Coarse on purpose. A supplement schedule that demands exact clock times is a
# schedule she stops following by week three.
SupplementTime = Literal["morning", "breakfast", "midday", "evening", "bedtime"]

SUPPLEMENT_TIME_LABELS: dict[str, str] = {
    "morning": "Morning, empty stomach",
    "breakfast": "With breakfast",
    "midday": "Midday",
    "evening": "Evening",
    "bedtime": "Before bed",
}

SUPPLEMENT_TIME_ORDER: tuple[str, ...] = (
    "morning",
    "breakfast",
    "midday",
    "evening",
    "bedtime",
)

# Minerals that bind levothyroxine in the gut and blunt absorption. Matched
# against the supplement name so the app can warn about the gap rather than
# leaving her to remember it.
BINDING_MINERALS: tuple[str, ...] = (
    "iron",
    "ferrous",
    "calcium",
    "magnesium",
    "zinc",
    "multivitamin",
)


class Supplement(Document):
    user_id: PydanticObjectId
    name: str
    dose: str = ""
    time_of_day: SupplementTime = "morning"
    # Monday = 0. Empty means every day, which is the common case.
    days: list[int] = Field(default_factory=list)
    note: str | None = None
    is_active: bool = True
    sort_order: int = 0
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.UTC))

    def due_on(self, day: dt.date) -> bool:
        return self.is_active and (not self.days or day.weekday() in self.days)

    def binds_levothyroxine(self) -> bool:
        lowered = self.name.lower()
        return any(mineral in lowered for mineral in BINDING_MINERALS)

    class Settings:
        name = "supplements"
        indexes = [pymongo.IndexModel([("user_id", pymongo.ASCENDING)])]


class SupplementLog(Document):
    """One row per supplement per day it was actually taken.

    Absence is the "not taken" state, so un-ticking is a delete rather than a
    flag flip — that keeps the streak maths a simple count of rows.
    """

    user_id: PydanticObjectId
    supplement_id: PydanticObjectId
    date: dt.date
    taken_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.UTC))

    class Settings:
        name = "supplement_logs"
        indexes = [
            pymongo.IndexModel(
                [
                    ("user_id", pymongo.ASCENDING),
                    ("supplement_id", pymongo.ASCENDING),
                    ("date", pymongo.DESCENDING),
                ],
                unique=True,
            ),
        ]
