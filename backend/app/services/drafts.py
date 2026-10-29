"""Turning parsed foods (from voice, text or a photo) into reviewable drafts.

Nothing here is saved. Every draft goes to a review sheet first: silently
trusting a transcription or a photo plus a lookup is how a tracker quietly
drifts 300 kcal a day.
"""

import asyncio

from beanie import PydanticObjectId
from pydantic import BaseModel

from app.models.food import FoodItem
from app.models.nutrients import Nutrients
from app.services import gemini, nutrition, portions

# Items resolve concurrently, but not all at once: each unknown one can call
# Gemini, USDA and Tavily, and a ten-item thali would trip rate limits.
_CONCURRENCY = 4


class PortionOut(BaseModel):
    key: str
    label: str
    grams: float
    is_default: bool = False


class DraftItem(BaseModel):
    food_id: str | None
    name: str
    # What was actually said or seen, so the review sheet can show it when the
    # match is a different-looking name ("bhendi" -> "Bhindi fry").
    heard_as: str
    quantity: float
    unit: str
    portion_key: str | None
    grams: float
    nutrients: Nutrients
    source: str
    confidence: str
    resolved: bool
    # False when the spoken unit didn't fit this food and its default portion
    # was used instead — highlighted in the review sheet.
    unit_matched: bool = True
    portions: list[PortionOut] = []


def portions_out(food: FoodItem) -> list[PortionOut]:
    return [PortionOut(**p.as_dict()) for p in portions.portions_for(food)]


def draft_for(
    food: FoodItem,
    quantity: float,
    unit: str | None,
    heard_as: str,
    grams_estimate: float | None = None,
) -> DraftItem:
    converted = portions.to_grams(food, quantity, unit)
    grams = converted.grams
    qty = quantity
    portion = converted.portion
    # A photo gives a weight estimate; when the stated unit couldn't be
    # matched, the weight is the better of two guesses.
    if not converted.exact and grams_estimate:
        grams = grams_estimate
        qty = round(grams_estimate / portion.grams, 2) if portion.grams else 1.0
    return DraftItem(
        food_id=str(food.id),
        name=food.name,
        heard_as=heard_as,
        quantity=qty,
        unit=portion.label.removeprefix("1 "),
        portion_key=portion.key,
        grams=round(grams, 1),
        nutrients=food.per_100g.scaled(grams).rounded(2),
        source=food.source,
        confidence=food.confidence,
        resolved=True,
        unit_matched=converted.exact,
        portions=portions_out(food),
    )


def unresolved(parsed: gemini.ParsedFood) -> DraftItem:
    return DraftItem(
        food_id=None,
        name=(parsed.search_name or parsed.food).strip().title(),
        heard_as=parsed.food,
        quantity=parsed.quantity,
        unit=parsed.unit,
        portion_key=None,
        grams=0.0,
        nutrients=Nutrients(),
        source="ai",
        confidence="estimated",
        resolved=False,
        unit_matched=False,
    )


async def build(parsed: list[gemini.ParsedFood], user_id: PydanticObjectId) -> list[DraftItem]:
    gate = asyncio.Semaphore(_CONCURRENCY)

    async def one(entry: gemini.ParsedFood) -> DraftItem:
        async with gate:
            food = await nutrition.resolve(entry.food, user_id, search_name=entry.search_name)
        if food is None:
            return unresolved(entry)
        return draft_for(food, entry.quantity, entry.unit, entry.food, entry.grams_estimate)

    return list(await asyncio.gather(*(one(p) for p in parsed)))
