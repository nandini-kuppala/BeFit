from datetime import UTC, datetime
from typing import Literal

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import Field

from app.models.nutrients import HouseholdUnit, Nutrients

# Where the numbers came from. Ordered by the resolution chain in
# services/nutrition.py — earlier is more trustworthy.
FoodSource = Literal[
    "personal",  # the user corrected this herself, or entered it by hand
    "indb",  # Anuvaad Indian Nutrient Databank
    "ifct",  # Indian Food Composition Tables 2017
    "usda",  # USDA FoodData Central
    "openfoodfacts",  # barcode / packaged
    "web",  # published figures read off a web search
    "ai",  # Gemini estimate from memory
]

# What the UI badge says. Never let an estimate look like a measured value.
Confidence = Literal["verified", "database", "estimated"]

CONFIDENCE_BY_SOURCE: dict[str, Confidence] = {
    "personal": "verified",
    "indb": "verified",
    "ifct": "verified",
    "usda": "database",
    "openfoodfacts": "database",
    # Read off published pages rather than recalled, so better than a guess —
    # but a model reading a web page is not a composition table, and the badge
    # should not pretend otherwise.
    "web": "estimated",
    "ai": "estimated",
}


class FoodItem(Document):
    name: str
    aliases: list[str] = Field(default_factory=list)
    category: str | None = None
    per_100g: Nutrients
    household_units: list[HouseholdUnit] = Field(default_factory=list)

    source: FoodSource
    confidence: Confidence
    is_veg: bool = True
    barcode: str | None = None

    # Set only for personal foods and corrections; None means shared/global.
    owner_id: PydanticObjectId | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def default_grams(self) -> float:
        return self.household_units[0].grams if self.household_units else 100.0

    class Settings:
        name = "food_items"
        indexes = [
            pymongo.IndexModel(
                [("name", pymongo.TEXT), ("aliases", pymongo.TEXT)],
                name="food_text",
                weights={"name": 10, "aliases": 5},
            ),
            pymongo.IndexModel([("owner_id", pymongo.ASCENDING)]),
            pymongo.IndexModel([("barcode", pymongo.ASCENDING)], sparse=True),
        ]
