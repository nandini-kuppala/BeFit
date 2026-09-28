import datetime as dt

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field

from app.models.food import Confidence, FoodSource
from app.models.logs import Meal
from app.models.nutrients import Nutrients


class SavedMealItem(BaseModel):
    food_id: PydanticObjectId | None = None
    name: str
    quantity: float = 1.0
    unit: str = "serving"
    grams: float
    # Frozen at save time, exactly like a food log. "Oats with almonds" should
    # keep meaning what it meant when she built it, even if the underlying food
    # is later corrected.
    nutrients: Nutrients
    source: FoodSource
    confidence: Confidence


class SavedMeal(Document):
    """A named group of foods she eats often, logged in one tap.

    The pattern every serious tracker converges on: build it once, and the
    thing she eats four mornings a week stops costing four searches.
    """

    user_id: PydanticObjectId
    name: str
    items: list[SavedMealItem] = Field(default_factory=list)
    # Which meal slot it usually belongs to, so one-tap logging has a sensible
    # default instead of asking every time.
    default_meal: Meal = "breakfast"
    times_logged: int = 0
    last_logged_on: dt.date | None = None
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.UTC))

    def totals(self) -> Nutrients:
        total = Nutrients()
        for item in self.items:
            total = total + item.nutrients
        return total

    def lowest_confidence(self) -> Confidence:
        """A meal is only as trustworthy as its shakiest ingredient."""
        rank: dict[str, int] = {"verified": 0, "database": 1, "estimated": 2}
        worst: Confidence = "verified"
        for item in self.items:
            if rank.get(item.confidence, 3) > rank.get(worst, 3):
                worst = item.confidence
        return worst

    class Settings:
        name = "saved_meals"
        indexes = [
            pymongo.IndexModel(
                [("user_id", pymongo.ASCENDING), ("times_logged", pymongo.DESCENDING)]
            ),
        ]
