"""The nutrition resolution chain.

    1. personal overrides   foods she has corrected before      [verified]
    2. seeded Indian DB     INDB / IFCT, local                   [verified]
    3. barcode              Open Food Facts                      [database]
    4. USDA FoodData        Western / generic                    [database]
    5. Gemini estimate      last resort, flagged                 [estimated]
                                    │
                                    └──► written back into tier 1/2

Tiers 1-2 are local Mongo queries: no network, no rate limit, no cost. Anything
resolved from tiers 4-5 is persisted so the same food is never paid for twice.
"""

import logging
import re

from beanie import PydanticObjectId
from beanie.operators import In

from app.models.food import CONFIDENCE_BY_SOURCE, FoodItem
from app.models.nutrients import HouseholdUnit, Nutrients
from app.services import gemini, openfoodfacts, usda

log = logging.getLogger(__name__)

GRAM_UNITS = {"g", "gm", "gram", "grams"}
ML_UNITS = {"ml", "millilitre", "milliliter"}


def to_grams(food: FoodItem, quantity: float, unit: str) -> float:
    """Convert a spoken quantity into grams using the food's own portions."""
    unit = (unit or "").strip().lower()

    if unit in GRAM_UNITS or unit in ML_UNITS:
        return quantity

    for household in food.household_units:
        label = household.label.lower()
        # "1 katori" matches unit "katori"; "1 idli" matches unit "idli".
        if unit and unit in label:
            return quantity * household.grams

    return quantity * food.default_grams()


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


async def search_local(
    query: str, user_id: PydanticObjectId, limit: int = 12
) -> list[FoodItem]:
    """Tiers 1-2. Personal foods rank above shared ones."""
    query = _normalise(query)
    if not query:
        return []

    owner_filter = In(FoodItem.owner_id, [user_id, None])

    results = (
        await FoodItem.find({"$text": {"$search": query}}, owner_filter)
        .sort([("score", {"$meta": "textScore"})])
        .limit(limit)
        .to_list()
    )

    if not results:
        # Text search misses substrings ("poriy" → "poriyal"), so fall back to
        # a prefix regex before spending a network call.
        escaped = re.escape(query)
        results = (
            await FoodItem.find(
                {"name": {"$regex": escaped, "$options": "i"}}, owner_filter
            )
            .limit(limit)
            .to_list()
        )

    results.sort(key=lambda food: _rank(food, query))
    return results


_CONFIDENCE_RANK = {"verified": 0, "database": 1, "estimated": 2}


def _rank(food: FoodItem, query: str) -> tuple:
    """Ordering for search results, most specific signal first.

    Name closeness leads, because Mongo's text score happily ranks
    "Rava idli" above "Idli" for the query "idli" — both contain the term, and
    relevance alone can't tell that the plain form is what was meant.
    """
    name = food.name.lower()
    aliases = {alias.lower() for alias in food.aliases}

    if name == query or query in aliases:
        closeness = 0
    elif name.startswith(query):
        closeness = 1
    elif any(alias.startswith(query) for alias in aliases):
        closeness = 2
    else:
        closeness = 3

    return (
        closeness,
        # A correction the user made herself always beats a shared entry.
        0 if food.source == "personal" else 1,
        _CONFIDENCE_RANK.get(food.confidence, 3),
        # Shorter names are the more generic dish: "Idli" over "Rava idli".
        len(name),
        name,
    )


async def _persist(
    name: str,
    nutrients: Nutrients,
    source: str,
    user_id: PydanticObjectId | None,
    household_units: list[HouseholdUnit] | None = None,
    is_veg: bool = True,
    barcode: str | None = None,
) -> FoodItem:
    food = FoodItem(
        name=name,
        per_100g=nutrients,
        source=source,
        confidence=CONFIDENCE_BY_SOURCE[source],
        household_units=household_units or [HouseholdUnit(label="100 g", grams=100.0)],
        is_veg=is_veg,
        barcode=barcode,
        owner_id=user_id,
    )
    await food.insert()
    return food


async def resolve(name: str, user_id: PydanticObjectId) -> FoodItem | None:
    """Walk the chain until something matches. Caches whatever it finds."""
    # Fetch a spread of candidates so the ranking above gets to choose;
    # a database-level limit of 1 would hand back whatever Mongo's text score
    # happened to put first.
    local = await search_local(name, user_id, limit=15)
    if local:
        return local[0]

    usda_hits = await usda.search(name, limit=1)
    if usda_hits:
        hit = usda_hits[0]
        if hit["nutrients"].kcal > 0:
            log.info("resolved %r via USDA", name)
            return await _persist(hit["name"], hit["nutrients"], "usda", None)

    estimated = await gemini.estimate_nutrition(name)
    if estimated:
        nutrients, meta = estimated
        if nutrients.kcal > 0:
            log.info("resolved %r via Gemini estimate", name)
            return await _persist(
                meta.name or name.title(),
                nutrients,
                "ai",
                user_id,
                household_units=[
                    HouseholdUnit(
                        label=meta.typical_portion_label,
                        grams=meta.typical_portion_grams,
                    ),
                    HouseholdUnit(label="100 g", grams=100.0),
                ],
                is_veg=meta.is_veg,
            )

    log.warning("could not resolve food %r through any tier", name)
    return None


async def resolve_barcode(barcode: str, user_id: PydanticObjectId) -> FoodItem | None:
    existing = await FoodItem.find_one(FoodItem.barcode == barcode)
    if existing:
        return existing

    product = await openfoodfacts.lookup_barcode(barcode)
    if not product or product["nutrients"].kcal <= 0:
        return None

    units = [HouseholdUnit(label="100 g", grams=100.0)]
    if product.get("serving_grams"):
        units.insert(
            0, HouseholdUnit(label="1 serving", grams=product["serving_grams"])
        )

    name = product["name"]
    if product.get("brand"):
        name = f"{name} ({product['brand'].split(',')[0].strip()})"

    return await _persist(
        name,
        product["nutrients"],
        "openfoodfacts",
        None,
        household_units=units,
        barcode=barcode,
    )


async def save_correction(
    original: FoodItem, nutrients: Nutrients, user_id: PydanticObjectId
) -> FoodItem:
    """A user correction becomes a personal `verified` food that outranks the
    original for this user from now on."""
    existing = await FoodItem.find_one(
        FoodItem.owner_id == user_id,
        FoodItem.name == original.name,
        FoodItem.source == "personal",
    )
    if existing:
        existing.per_100g = nutrients
        existing.household_units = original.household_units
        await existing.save()
        return existing

    return await _persist(
        original.name,
        nutrients,
        "personal",
        user_id,
        household_units=original.household_units,
        is_veg=original.is_veg,
    )
