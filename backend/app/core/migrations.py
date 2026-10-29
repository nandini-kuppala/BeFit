"""One-off data fixes, run at startup before indexes are built.

Each step is idempotent and recorded in the `meta` collection, so a restart
costs one small read. Steps operate on raw documents (not Beanie models)
because they exist precisely to repair data the current models would reject.
"""

import datetime as dt
import logging
import re

from bson import ObjectId

log = logging.getLogger(__name__)

_NON_WORD = re.compile(r"[^\w\s]+")
_SPACES = re.compile(r"\s+")


def _norm(text: str) -> str:
    return _SPACES.sub(" ", _NON_WORD.sub(" ", (text or "").lower())).strip()


async def _merge_duplicate_meal_logs(db) -> None:
    """Fold duplicate (user, date, meal) food logs into one, giving every item
    an id. Needed before the unique index can exist."""
    logs = db["food_logs"]
    groups = logs.aggregate(
        [
            {"$group": {
                "_id": {"u": "$user_id", "d": "$date", "m": "$meal"},
                "ids": {"$push": "$_id"},
                "n": {"$sum": 1},
            }},
            {"$match": {"n": {"$gt": 1}}},
        ]
    )
    merged = 0
    async for group in await groups:
        docs = await logs.find({"_id": {"$in": group["ids"]}}).sort("logged_at", 1).to_list()
        keeper, rest = docs[0], docs[1:]
        items = list(keeper.get("items", []))
        for doc in rest:
            items.extend(doc.get("items", []))
        await logs.update_one(
            {"_id": keeper["_id"]},
            {"$set": {
                "items": items,
                "via_voice": any(d.get("via_voice") for d in docs),
            }},
        )
        await logs.delete_many({"_id": {"$in": [d["_id"] for d in rest]}})
        merged += len(rest)
    if merged:
        log.info("migration: merged %d duplicate meal logs", merged)

    # Give every logged item an id and a timestamp.
    fixed = 0
    async for doc in logs.find({"items": {"$elemMatch": {"id": {"$exists": False}}}}):
        items = doc.get("items", [])
        for item in items:
            item.setdefault("id", ObjectId())
            item.setdefault("added_at", doc.get("logged_at") or dt.datetime.now(dt.UTC))
        await logs.update_one({"_id": doc["_id"]}, {"$set": {"items": items}})
        fixed += 1
    if fixed:
        log.info("migration: gave item ids to %d food logs", fixed)


async def _backfill_food_name_norm(db) -> None:
    foods = db["food_items"]
    count = 0
    async for doc in foods.find(
        {"$or": [{"name_norm": {"$exists": False}}, {"name_norm": ""}]},
        {"name": 1},
    ):
        await foods.update_one({"_id": doc["_id"]}, {"$set": {"name_norm": _norm(doc.get("name", ""))}})
        count += 1
    if count:
        log.info("migration: normalised %d food names", count)




STEPS = [
    ("2026-10-merge-meal-logs", _merge_duplicate_meal_logs),
    ("2026-10-food-name-norm", _backfill_food_name_norm),
]


async def run_migrations(db) -> None:
    meta = db["meta"]
    done = await meta.find_one({"_id": "migrations"}) or {"steps": []}
    applied = set(done.get("steps", []))
    for name, step in STEPS:
        if name in applied:
            continue
        log.info("running migration %s", name)
        await step(db)
        applied.add(name)
        await meta.update_one(
            {"_id": "migrations"}, {"$set": {"steps": sorted(applied)}}, upsert=True
        )
