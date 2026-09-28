"""The nutrition resolution chain.

    1. personal overrides   foods corrected or entered by hand   [verified]
    2. seeded Indian DB     INDB / IFCT, local                   [verified]
    3. barcode              Open Food Facts                      [database]
    4. USDA FoodData        Western / generic                    [database]
    5. web search           Tavily + Gemini extraction           [estimated]
    6. Gemini estimate      last resort, flagged                 [estimated]
                                    │
                                    └──► written back into tier 1/2

Tiers 1-2 are local Mongo queries: no network, no rate limit, no cost. Anything
resolved from tiers 4-6 is persisted so the same food is never paid for twice.

Two rules keep the chain honest, both learned from it getting them wrong:

  - A local hit is only accepted when it genuinely matches. Returning the best
    available row regardless of quality meant "pumpkin seeds" resolved to
    sesame seeds and stopped, never reaching a tier that knew the answer.
  - An external hit is checked against the query before it is trusted. USDA
    answers everything with something; "pumpkin sed" comes back as
    "Bread, pumpkin" unless the spelling is fixed first and the reply verified.
"""

import logging
import re

from beanie import PydanticObjectId
from beanie.operators import In

from app.models.food import CONFIDENCE_BY_SOURCE, FoodItem
from app.models.nutrients import HouseholdUnit, Nutrients
from app.services import gemini, matching, openfoodfacts, tavily, usda

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


_CONFIDENCE_RANK = {"verified": 0, "database": 1, "estimated": 2}

# How many rows to pull out of Mongo before scoring properly in Python. The
# database is small enough that generous recall costs nothing, and precision is
# decided by `matching.score`, not by Mongo.
_CANDIDATE_POOL = 300


async def _candidates(query: str, user_id: PydanticObjectId) -> list[FoodItem]:
    """Wide net: anything sharing a word, a prefix or a substring."""
    owner_filter = In(FoodItem.owner_id, [user_id, None])
    found: dict[PydanticObjectId, FoodItem] = {}

    async def collect(rows: list[FoodItem]) -> None:
        for row in rows:
            if row.id is not None:
                found[row.id] = row

    await collect(
        await FoodItem.find({"$text": {"$search": query}}, owner_filter)
        .limit(_CANDIDATE_POOL)
        .to_list()
    )

    # Text search is word-based, so it misses partial words ("poriy" ->
    # "poriyal") and typos entirely. Regex on each token catches the rest.
    for token in matching.tokens(query)[:4]:
        if len(token) < 3:
            continue
        escaped = re.escape(token)
        await collect(
            await FoodItem.find(
                {
                    "$or": [
                        {"name": {"$regex": escaped, "$options": "i"}},
                        {"aliases": {"$regex": escaped, "$options": "i"}},
                    ]
                },
                owner_filter,
            )
            .limit(_CANDIDATE_POOL)
            .to_list()
        )

    return list(found.values())


def _sort_key(scored: tuple[FoodItem, float]) -> tuple:
    food, value = scored
    return (
        # Best textual match first — this is the signal that actually answers
        # "did the user mean this?".
        -value,
        # A correction the user made herself beats a shared entry.
        0 if food.source == "personal" else 1,
        _CONFIDENCE_RANK.get(food.confidence, 3),
        # Shorter names are the more generic dish: "Idli" over "Rava idli".
        len(food.name),
        food.name.lower(),
    )


async def search_scored(
    query: str, user_id: PydanticObjectId, limit: int = 12
) -> list[tuple[FoodItem, float]]:
    """Tiers 1-2, with each hit's match score attached.

    Anything below `matching.SEARCH_FLOOR` is dropped rather than shown. A
    search for pumpkin seeds that returns sesame seeds is not a helpful near
    miss — it is a wrong answer that invites a wrong log.
    """
    query = _normalise(query)
    if not query:
        return []

    scored = [
        (food, matching.score(query, food.name, food.aliases))
        for food in await _candidates(query, user_id)
    ]
    relevant = [pair for pair in scored if pair[1] >= matching.SEARCH_FLOOR]
    relevant.sort(key=_sort_key)
    return relevant[:limit]


async def search_local(
    query: str, user_id: PydanticObjectId, limit: int = 12
) -> list[FoodItem]:
    return [food for food, _ in await search_scored(query, user_id, limit)]


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
    """Walk the chain until something genuinely matches. Caches what it finds.

    The rule that matters: a local row is only accepted when it actually
    answers the query. The previous version returned the best local row
    whenever *any* row came back, so "pumpkin seeds" matched the word "seeds"
    in sesame seeds and the chain stopped there — never reaching USDA or the
    web, and logging the wrong food with a confident `verified` badge.
    """
    query = _normalise(name)
    if not query:
        return None

    local = await search_scored(query, user_id, limit=15)
    if local and local[0][1] >= matching.CONFIDENT:
        return local[0][0]

    # Typos have to be fixed before the query leaves the building: USDA
    # answers "pumpkin sed" with "Bread, pumpkin".
    canonical = await gemini.canonicalise_food(name)
    if canonical is not None and not canonical.is_food:
        log.info("%r does not name a food", name)
        return None

    search_term = (canonical.search_term or name).strip() if canonical else name
    display_name = (canonical.canonical_name or name).strip() if canonical else name

    # The corrected spelling may well be in the local database already.
    if matching.normalise(search_term) != query:
        corrected = await search_scored(search_term, user_id, limit=15)
        if corrected and corrected[0][1] >= matching.CONFIDENT:
            log.info("resolved %r locally after correcting to %r", name, search_term)
            return corrected[0][0]

    food = await _from_usda(search_term, display_name)
    if food is not None:
        return food

    food = await _from_web(search_term, display_name, user_id)
    if food is not None:
        return food

    estimated = await gemini.estimate_nutrition(search_term)
    if estimated:
        nutrients, meta = estimated
        if nutrients.kcal > 0:
            log.info("resolved %r via Gemini estimate", name)
            return await _persist(
                meta.name or display_name.title(),
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


async def _from_usda(search_term: str, display_name: str) -> FoodItem | None:
    """USDA, but only if what it returns is actually the food asked for.

    The API answers every query with something. Taking the top hit on faith is
    how a search for pumpkin seeds becomes a log of pumpkin bread.
    """
    hits = await usda.search(search_term, limit=5)
    if not hits:
        return None

    scored = [
        (hit, matching.score(search_term, hit["name"]))
        for hit in hits
        if hit["nutrients"].kcal > 0
    ]
    if not scored:
        return None

    hit, value = max(scored, key=lambda pair: pair[1])
    if value < matching.SEARCH_FLOOR:
        log.info(
            "USDA's best for %r was %r (%.2f) — too far off, moving on",
            search_term,
            hit["name"],
            value,
        )
        return None

    log.info("resolved %r via USDA as %r (%.2f)", search_term, hit["name"], value)
    return await _persist(hit["name"], hit["nutrients"], "usda", None)


async def _from_web(
    search_term: str, display_name: str, user_id: PydanticObjectId
) -> FoodItem | None:
    """Published figures found by web search and read out by Gemini."""
    snippets = await tavily.search_nutrition(search_term)
    if not snippets:
        return None

    extracted = await gemini.extract_nutrition_from_web(search_term, snippets)
    if extracted is None:
        return None

    nutrients, meta = extracted
    units = [HouseholdUnit(label="100 g", grams=100.0)]
    if meta.typical_portion_grams and meta.typical_portion_grams > 0:
        units.insert(
            0,
            HouseholdUnit(
                label=meta.typical_portion_label or "1 serving",
                grams=meta.typical_portion_grams,
            ),
        )

    log.info("resolved %r via web search (%s)", search_term, meta.source_note)
    return await _persist(
        meta.name or display_name.title(),
        nutrients,
        "web",
        user_id,
        household_units=units,
        is_veg=meta.is_veg,
    )


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
