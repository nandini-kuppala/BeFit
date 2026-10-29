"""The nutrition resolution chain.

    1. personal overrides   foods corrected or entered by hand   [verified]
    2. shared database      curated Indian dishes, IFCT 2017,    [verified]
                            plus everything cached below
    3. barcode              Open Food Facts                      [database]
    4. USDA FoodData        Western / generic                    [database]
    5. web search           Tavily + Gemini extraction           [estimated]
    6. Gemini estimate      last resort, flagged                 [estimated]
                                    │
                                    └──► written back into tier 2, with the
                                         query as an alias, and remembered in
                                         the resolve cache

Tiers 1-2 are answered from memory (services/catalog.py) plus one indexed query
for personal foods. Tiers 4-6 cost API calls, so their results are persisted
and the query that led there is cached — a repeat, or the same typo, never
walks the chain twice.

Rules that keep the chain honest:

  - A local hit is only accepted when it genuinely matches (matching.score).
    "pumpkin seeds" once resolved to sesame seeds on the shared word "seeds".
  - An external hit is checked against the query before it is trusted. USDA
    answers everything with something.
  - The whole walk has a time budget. USDA and the web search run concurrently;
    a stalled provider costs its timeout once, not a minute of serial waiting.
"""

import asyncio
import logging

from beanie import PydanticObjectId
from beanie.operators import In
from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.models.food import CONFIDENCE_BY_SOURCE, FoodItem, normalise_name
from app.models.nutrients import HouseholdUnit, Nutrients
from app.models.resolve_cache import ResolveCache
from app.services import (
    catalog,
    gemini,
    matching,
    openfoodfacts,
    portions,
    tavily,
    usda,
)

log = logging.getLogger(__name__)

# How far below the best hit a result may score and still be shown.
RELATIVE_FLOOR = 0.22

_CONFIDENCE_RANK = {"verified": 0, "database": 1, "estimated": 2}
_SOURCE_RANK = {"personal": 0, "indb": 1, "ifct": 2, "openfoodfacts": 3, "usda": 4, "web": 5, "ai": 6}


def to_grams(food: FoodItem, quantity: float, unit: str) -> float:
    """Kept for callers that only need the number."""
    return portions.to_grams(food, quantity, unit).grams


# ------------------------------------------------------------------ search


async def _personal_foods(user_id: PydanticObjectId) -> list[FoodItem]:
    return await FoodItem.find(FoodItem.owner_id == user_id).to_list()


def _sort_key(scored: tuple[FoodItem, float]) -> tuple:
    food, value = scored
    return (
        # Best textual match first — the signal that answers "did she mean this?"
        -round(value, 2),
        # Her own entries beat shared ones.
        0 if food.owner_id is not None else 1,
        _CONFIDENCE_RANK.get(food.confidence, 3),
        # Curated dishes before raw ingredients before cached guesses.
        _SOURCE_RANK.get(food.source, 9),
        # Shorter names are the more generic dish: "Idli" over "Rava idli".
        len(food.name),
        food.name.lower(),
    )


def _score_all(query: str, foods: list[FoodItem]) -> list[tuple[FoodItem, float]]:
    scored = [(food, matching.score(query, food.name, food.aliases)) for food in foods]
    relevant = [pair for pair in scored if pair[1] >= matching.SEARCH_FLOOR]
    relevant.sort(key=_sort_key)
    return relevant


async def search_scored(
    query: str, user_id: PydanticObjectId, limit: int = 12
) -> list[tuple[FoodItem, float]]:
    """Tiers 1-2, with each hit's match score attached.

    Anything below `matching.SEARCH_FLOOR` is dropped rather than shown: a
    search for pumpkin seeds that returns sesame seeds is not a helpful near
    miss — it is a wrong answer that invites a wrong log.
    """
    query = normalise_name(query)
    if not query:
        return []

    await catalog.load()
    personal = await _personal_foods(user_id)
    candidates = catalog.candidates(query) + personal

    # A personal correction shadows the shared food it was made from.
    shadowed = {normalise_name(f.name) for f in personal}
    candidates = [
        f for f in candidates if f.owner_id is not None or normalise_name(f.name) not in shadowed
    ]
    # Scoring is pure CPU; keep it off the event loop for large candidate sets.
    if len(candidates) > 150:
        scored = await asyncio.to_thread(_score_all, query, candidates)
    else:
        scored = _score_all(query, candidates)
    # With a real answer on the list, far weaker fuzzy matches are noise: a
    # search for "roti" found Chapati and then "Beet root" on root≈roti.
    if scored and scored[0][1] >= matching.CONFIDENT:
        floor = max(matching.SEARCH_FLOOR, scored[0][1] - RELATIVE_FLOOR)
        scored = [pair for pair in scored if pair[1] >= floor]
    return scored[:limit]


async def search_local(query: str, user_id: PydanticObjectId, limit: int = 12) -> list[FoodItem]:
    return [food for food, _ in await search_scored(query, user_id, limit)]


async def get_visible(food_id: PydanticObjectId, user_id: PydanticObjectId) -> FoodItem | None:
    """A food this user may see: shared, or her own. Someone else's personal
    food is invisible — it used to be loggable by anyone who had its id."""
    food = catalog.get(food_id) or await FoodItem.get(food_id)
    if food is None or food.owner_id not in (None, user_id):
        return None
    return food


async def variants_of(food: FoodItem, user_id: PydanticObjectId) -> list[FoodItem]:
    if not food.family:
        return []
    await catalog.load()
    shared = catalog.family(food.family)
    personal = await FoodItem.find(
        FoodItem.owner_id == user_id, FoodItem.family == food.family
    ).to_list()
    return [f for f in [*personal, *shared] if f.id != food.id]


# ------------------------------------------------------------- persistence


async def _persist(
    name: str,
    nutrients: Nutrients,
    source: str,
    user_id: PydanticObjectId | None,
    household_units: list[HouseholdUnit] | None = None,
    is_veg: bool = True,
    barcode: str | None = None,
    external_id: str | None = None,
    aliases: list[str] | None = None,
    brand: str | None = None,
) -> FoodItem:
    """Insert, or update the row this external id already has.

    The query that led here is kept as an alias, so the next search for the
    same words finds this row locally instead of walking the chain again.
    """
    clean_aliases = sorted(
        {a.strip() for a in (aliases or []) if a and normalise_name(a) != normalise_name(name)}
    )[:10]

    if external_id:
        existing = await FoodItem.find_one(FoodItem.external_id == external_id)
        if existing is not None:
            merged = sorted(set(existing.aliases) | set(clean_aliases))[:20]
            if merged != existing.aliases:
                existing.aliases = merged
                await existing.save()
            catalog.put(existing)
            return existing

    food = FoodItem(
        name=name,
        aliases=clean_aliases,
        per_100g=nutrients,
        source=source,
        confidence=CONFIDENCE_BY_SOURCE[source],
        household_units=household_units or [HouseholdUnit(label="100 g", grams=100.0)],
        is_veg=is_veg,
        barcode=barcode,
        owner_id=user_id,
        external_id=external_id,
        brand=brand,
    )
    try:
        await food.insert()
    except DuplicateKeyError:
        # Another request cached the same external food a moment ago.
        found = await FoodItem.find_one(FoodItem.external_id == external_id)
        if found is not None:
            return found
        raise
    catalog.put(food)
    return food


async def _cache_get(key: str, user_id: PydanticObjectId) -> tuple[bool, FoodItem | None]:
    """(was cached, food). A cached miss is (True, None)."""
    entry = await ResolveCache.find_one(
        ResolveCache.key == key, In(ResolveCache.owner_id, [user_id, None])
    )
    if entry is None:
        return False, None
    if entry.food_id is None:
        return True, None
    food = await get_visible(entry.food_id, user_id)
    return (food is not None), food


async def _cache_put(key: str, food: FoodItem | None, user_id: PydanticObjectId) -> None:
    # Results that live in her personal space are cached for her only.
    owner = user_id if (food is None or food.owner_id is not None) else None
    await ResolveCache.find_one(
        ResolveCache.key == key, ResolveCache.owner_id == owner
    ).upsert(
        {"$set": {
            ResolveCache.food_id: food.id if food else None,
            ResolveCache.expires_at: ResolveCache.expiry(food is not None),
        }},
        on_insert=ResolveCache(
            key=key,
            owner_id=owner,
            food_id=food.id if food else None,
            expires_at=ResolveCache.expiry(food is not None),
        ),
    )


# ------------------------------------------------------------------ resolve


async def resolve(
    name: str, user_id: PydanticObjectId, search_name: str | None = None
) -> FoodItem | None:
    """Walk the chain until something genuinely matches. Caches what it finds.

    `search_name` is an already-corrected spelling (the voice parser returns
    one), which saves a Gemini round trip per item.
    """
    query = normalise_name(name)
    if not query:
        return None

    for term in dict.fromkeys(filter(None, [query, normalise_name(search_name or "")])):
        local = await search_scored(term, user_id, limit=5)
        if local and local[0][1] >= matching.CONFIDENT:
            return local[0][0]

    cached, food = await _cache_get(query, user_id)
    if cached:
        return food

    try:
        async with asyncio.timeout(get_settings().resolve_budget_s):
            food = await _resolve_remote(name, query, user_id, search_name)
    except TimeoutError:
        log.warning("resolving %r ran out of time", name)
        return None  # not cached: a timeout says nothing about the food

    await _cache_put(query, food, user_id)
    return food


async def _resolve_remote(
    name: str, query: str, user_id: PydanticObjectId, search_name: str | None
) -> FoodItem | None:
    if search_name and normalise_name(search_name) != query:
        search_term, display_name = search_name, search_name
    else:
        # Typos have to be fixed before the query leaves the building: USDA
        # answers "pumpkin sed" with "Bread, pumpkin".
        canonical = await gemini.canonicalise_food(name)
        if canonical is not None and not canonical.is_food:
            log.info("%r does not name a food", name)
            return None
        search_term = (canonical.search_term or name).strip() if canonical else name
        display_name = (canonical.canonical_name or name).strip() if canonical else name

        if normalise_name(search_term) != query:
            corrected = await search_scored(search_term, user_id, limit=5)
            if corrected and corrected[0][1] >= matching.CONFIDENT:
                log.info("resolved %r locally after correcting to %r", name, search_term)
                return corrected[0][0]

    aliases = [name, search_term, display_name]

    # USDA and the web search are independent: ask both at once and prefer
    # USDA's measured values when it has a genuine match.
    usda_task = asyncio.create_task(_from_usda(search_term, aliases))
    web_task = asyncio.create_task(_from_web(search_term, display_name, user_id, aliases))
    food = await usda_task
    if food is not None:
        web_task.cancel()
        return food
    food = await web_task
    if food is not None:
        return food

    estimated = await gemini.estimate_nutrition(search_term)
    if estimated:
        nutrients, meta = estimated
        if nutrients.kcal > 0:
            log.info("resolved %r via Gemini estimate", name)
            units = [HouseholdUnit(label="100 g", grams=100.0)]
            if meta.typical_portion_grams and 0 < meta.typical_portion_grams <= 2000:
                units.insert(
                    0,
                    HouseholdUnit(
                        label=meta.typical_portion_label or "1 serving",
                        grams=meta.typical_portion_grams,
                    ),
                )
            return await _persist(
                meta.name or display_name.title(),
                nutrients,
                "ai",
                user_id,
                household_units=units,
                is_veg=meta.is_veg,
                aliases=aliases,
            )

    log.warning("could not resolve food %r through any tier", name)
    return None


async def _from_usda(search_term: str, aliases: list[str]) -> FoodItem | None:
    """USDA, but only if what it returns is actually the food asked for."""
    hits = await usda.search(search_term, limit=5)
    scored = [
        (hit, matching.score(search_term, hit["name"]))
        for hit in hits
        if hit["nutrients"].kcal > 0
    ]
    if not scored:
        return None

    hit, value = max(scored, key=lambda pair: pair[1])
    if value < matching.SEARCH_FLOOR:
        log.info("USDA's best for %r was %r (%.2f) — too far off", search_term, hit["name"], value)
        return None

    log.info("resolved %r via USDA as %r (%.2f)", search_term, hit["name"], value)
    return await _persist(
        hit["name"],
        hit["nutrients"],
        "usda",
        None,
        household_units=hit.get("portions") or None,
        external_id=f"usda:{hit['fdc_id']}" if hit.get("fdc_id") else None,
        aliases=aliases,
    )


async def _from_web(
    search_term: str, display_name: str, user_id: PydanticObjectId, aliases: list[str]
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
    if meta.typical_portion_grams and 0 < meta.typical_portion_grams <= 2000:
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
        aliases=aliases,
    )


async def resolve_barcode(barcode: str, user_id: PydanticObjectId) -> FoodItem | None:
    existing = await FoodItem.find_one(
        FoodItem.barcode == barcode, In(FoodItem.owner_id, [user_id, None])
    )
    if existing:
        return existing

    product = await openfoodfacts.lookup_barcode(barcode)
    if not product or product["nutrients"].kcal <= 0:
        return None

    units = [HouseholdUnit(label="100 g", grams=100.0)]
    if product.get("serving_grams"):
        units.insert(
            0,
            HouseholdUnit(
                label=product.get("serving_label") or "1 serving",
                grams=product["serving_grams"],
            ),
        )

    name = product["name"]
    brand = (product.get("brand") or "").split(",")[0].strip() or None
    if brand:
        name = f"{name} ({brand})"

    return await _persist(
        name,
        product["nutrients"],
        "openfoodfacts",
        None,
        household_units=units,
        barcode=barcode,
        external_id=f"off:{barcode}",
        brand=brand,
    )


async def save_correction(
    original: FoodItem,
    nutrients: Nutrients,
    user_id: PydanticObjectId,
    household_units: list[HouseholdUnit] | None = None,
) -> FoodItem:
    """A user correction becomes a personal `verified` food that shadows the
    original for this user from now on."""
    existing = await FoodItem.find_one(
        FoodItem.owner_id == user_id,
        FoodItem.name_norm == normalise_name(original.name),
    )
    units = household_units or original.household_units
    if existing:
        existing.per_100g = nutrients
        existing.household_units = units
        existing.source = "personal"
        existing.confidence = "verified"
        await existing.save()
        return existing

    food = FoodItem(
        name=original.name,
        aliases=original.aliases,
        category=original.category,
        family=original.family,
        variant=original.variant,
        per_100g=nutrients,
        household_units=units,
        source="personal",
        confidence="verified",
        is_veg=original.is_veg,
        density_g_per_ml=original.density_g_per_ml,
        brand=original.brand,
        owner_id=user_id,
    )
    await food.insert()
    return food
