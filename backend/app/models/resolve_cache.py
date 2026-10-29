import datetime as dt

import pymongo
from beanie import Document, PydanticObjectId


class ResolveCache(Document):
    """What a free-text food name resolved to through the network tiers.

    The chain costs Gemini, USDA and Tavily calls and up to 20 s. Without this,
    every repeat of an unusual food — or a typo — paid that again. Misses are
    cached too (food_id None), for a shorter time, so a non-food or an
    unfindable dish doesn't hammer every API on each attempt.
    """

    key: str  # normalised query
    owner_id: PydanticObjectId | None = None
    food_id: PydanticObjectId | None = None
    expires_at: dt.datetime

    class Settings:
        name = "resolve_cache"
        indexes = [
            pymongo.IndexModel(
                [("key", pymongo.ASCENDING), ("owner_id", pymongo.ASCENDING)],
                unique=True,
            ),
            pymongo.IndexModel([("expires_at", pymongo.ASCENDING)], expireAfterSeconds=0),
        ]

    @staticmethod
    def expiry(hit: bool) -> dt.datetime:
        return dt.datetime.now(dt.UTC) + (dt.timedelta(days=60) if hit else dt.timedelta(days=2))
