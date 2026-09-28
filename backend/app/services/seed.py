"""Loads the curated Indian food composition data into MongoDB.

This is what makes the app accurate for food she actually eats — idli, dosa,
sambar, poriyal — none of which any commercial nutrition API covers properly.
Runs at startup and is idempotent.
"""

import logging

from app.models.food import CONFIDENCE_BY_SOURCE, FoodItem
from app.models.nutrients import HouseholdUnit, Nutrients

log = logging.getLogger(__name__)


async def seed_foods() -> int:
    try:
        from app.data.indian_foods import SEED_FOODS
    except ImportError:
        log.warning("No seed food data found — food search will rely on API tiers.")
        return 0

    existing = {
        food.name.lower(): food
        for food in await FoodItem.find(FoodItem.owner_id == None).to_list()  # noqa: E711
    }

    new_items = []
    for entry in SEED_FOODS:
        already = existing.get(entry["name"].lower())
        if already is not None:
            # Aliases are how search finds a food, and they get refined over
            # time, so keep them current instead of only inserting new rows.
            aliases = entry.get("aliases", [])
            if set(aliases) != set(already.aliases):
                already.aliases = aliases
                await already.save()
            continue
        source = entry.get("source", "indb")
        new_items.append(
            FoodItem(
                name=entry["name"],
                aliases=entry.get("aliases", []),
                category=entry.get("category"),
                per_100g=Nutrients(**entry["per_100g"]),
                household_units=[
                    HouseholdUnit(**unit) for unit in entry.get("household_units", [])
                ]
                or [HouseholdUnit(label="100 g", grams=100.0)],
                source=source,
                confidence=CONFIDENCE_BY_SOURCE.get(source, "database"),
                is_veg=entry.get("is_veg", True),
                owner_id=None,
            )
        )

    if new_items:
        await FoodItem.insert_many(new_items)
        log.info("seeded %d foods", len(new_items))
    return len(new_items)
