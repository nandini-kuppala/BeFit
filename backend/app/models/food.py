import re
from datetime import UTC, datetime
from typing import Literal

import pymongo
from beanie import Document, Insert, PydanticObjectId, Replace, Save, before_event
from pydantic import BaseModel, Field, model_validator

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


class RecipeIngredient(BaseModel):
    food_id: PydanticObjectId | None = None
    name: str
    grams: float = Field(gt=0, le=10_000)


class FoodItem(Document):
    name: str
    aliases: list[str] = Field(default_factory=list)
    category: str | None = None
    per_100g: Nutrients
    household_units: list[HouseholdUnit] = Field(default_factory=list)

    # Lower-cased, punctuation-free name. Indexed, so exact and prefix lookups
    # are an index seek instead of a case-insensitive regex over every row.
    name_norm: str = ""

    # Variations of one dish share a family: "Roti", "Roti with ghee" and
    # "Tandoori roti" are separate foods (different numbers per 100 g) but the
    # UI offers them side by side, the way people actually choose.
    family: str | None = None
    variant: str | None = None

    brand: str | None = None
    # g per ml, for foods logged by volume. Water-like by default; oil is 0.92,
    # honey 1.42. Without it "1 tbsp oil" was weighed as if it were water.
    density_g_per_ml: float | None = None

    # Where a network-tier food came from ("usda:171", "off:8901234567890").
    # Unique, so looking the same thing up twice updates one row instead of
    # adding a duplicate that then competes with the first in search.
    external_id: str | None = None

    # A dish she built from ingredients. per_100g is computed from these and
    # the cooked weight, so a homemade sabzi is as exact as its ingredients.
    recipe: list[RecipeIngredient] | None = None
    recipe_yield_g: float | None = None

    source: FoodSource
    confidence: Confidence
    is_veg: bool = True
    barcode: str | None = None

    # Set only for personal foods and corrections; None means shared/global.
    owner_id: PydanticObjectId | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @model_validator(mode="after")
    def _fill_norm(self) -> "FoodItem":
        if not self.name_norm:
            self.name_norm = normalise_name(self.name)
        return self

    @before_event(Insert, Replace, Save)
    def _refresh_norm(self) -> None:
        self.name_norm = normalise_name(self.name)

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
            pymongo.IndexModel(
                [("owner_id", pymongo.ASCENDING), ("name_norm", pymongo.ASCENDING)]
            ),
            pymongo.IndexModel([("family", pymongo.ASCENDING)], sparse=True),
            pymongo.IndexModel(
                [("external_id", pymongo.ASCENDING)],
                unique=True,
                partialFilterExpression={"external_id": {"$type": "string"}},
            ),
        ]


_NON_WORD = re.compile(r"[^\w\s]+")
_SPACES = re.compile(r"\s+")


def normalise_name(text: str) -> str:
    text = _NON_WORD.sub(" ", (text or "").lower())
    return _SPACES.sub(" ", text).strip()
