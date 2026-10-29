"""In-memory index of the shared food database, for instant search.

Search used to issue five sequential Mongo queries per keystroke — a $text
search plus an unanchored case-insensitive regex per word, each of which scans
the whole collection — and then score every row with difflib. From a phone in
India to an Atlas cluster that was most of a second before anything rendered.

The shared foods (seed + everything cached from USDA/OFF/web) are a few
thousand rows: small enough to hold in memory and fuzzy-match in C with
rapidfuzz. Personal foods are still read per request, because they are few and
must reflect edits immediately.

The index reloads itself every few minutes so that, when the API runs on more
than one instance, foods another instance cached become searchable here too.
"""

import asyncio
import logging
import time

from beanie import PydanticObjectId
from rapidfuzz import fuzz, process

from app.models.food import FoodItem, normalise_name

log = logging.getLogger(__name__)

RELOAD_EVERY_S = 300

_foods: dict[PydanticObjectId, FoodItem] = {}
_keys: list[str] = []
_key_food: list[PydanticObjectId] = []
_loaded_at = 0.0
_lock = asyncio.Lock()


def _rebuild_keys() -> None:
    keys: list[str] = []
    owners: list[PydanticObjectId] = []
    for food in _foods.values():
        for text in (food.name, *food.aliases):
            norm = normalise_name(text)
            if norm:
                keys.append(norm)
                owners.append(food.id)
    global _keys, _key_food
    _keys, _key_food = keys, owners


async def load(force: bool = False) -> None:
    global _foods, _loaded_at
    if not force and time.monotonic() - _loaded_at < RELOAD_EVERY_S and _foods:
        return
    async with _lock:
        if not force and time.monotonic() - _loaded_at < RELOAD_EVERY_S and _foods:
            return
        rows = await FoodItem.find(FoodItem.owner_id == None).to_list()  # noqa: E711
        _foods = {row.id: row for row in rows if row.id is not None}
        _rebuild_keys()
        _loaded_at = time.monotonic()
        log.info("food catalog loaded: %d shared foods, %d search keys", len(_foods), len(_keys))


def put(food: FoodItem) -> None:
    """Register a newly cached or updated shared food without a full reload."""
    if food.owner_id is not None or food.id is None:
        return
    _foods[food.id] = food
    _rebuild_keys()


def get(food_id: PydanticObjectId) -> FoodItem | None:
    return _foods.get(food_id)


def family(name: str) -> list[FoodItem]:
    return [f for f in _foods.values() if f.family == name]


def candidates(query: str, limit: int = 120) -> list[FoodItem]:
    """Shared foods whose name or an alias is plausibly what was typed.

    Recall only — WRatio is generous on purpose (partial and token-order
    matches). Precision is decided afterwards by matching.score.
    """
    norm = normalise_name(query)
    if not norm or not _keys:
        return []
    hits = process.extract(
        norm, _keys, scorer=fuzz.WRatio, limit=limit * 2, score_cutoff=50
    )
    seen: dict[PydanticObjectId, FoodItem] = {}
    for _, _, index in hits:
        food_id = _key_food[index]
        if food_id not in seen:
            seen[food_id] = _foods[food_id]
            if len(seen) >= limit:
                break
    return list(seen.values())


def size() -> int:
    return len(_foods)
