import logging

from beanie import init_beanie
from pymongo import AsyncMongoClient

from app.core.config import get_settings

log = logging.getLogger(__name__)

_client: AsyncMongoClient | None = None


def document_models() -> list:
    from app.models.body import BodyComposition, BodyMap
    from app.models.chat import ChatThread
    from app.models.diet import DietPlan
    from app.models.food import FoodItem
    from app.models.logs import FoodLog, SleepLog, WaterLog, WeightLog
    from app.models.meal import SavedMeal
    from app.models.profile import Profile
    from app.models.resolve_cache import ResolveCache
    from app.models.supplement import Supplement, SupplementLog
    from app.models.targets import Targets
    from app.models.user import User
    from app.models.workout import Exercise, WorkoutPlan, WorkoutSession

    return [
        User,
        Profile,
        Targets,
        FoodItem,
        FoodLog,
        SavedMeal,
        WaterLog,
        SleepLog,
        WeightLog,
        Supplement,
        SupplementLog,
        BodyComposition,
        BodyMap,
        DietPlan,
        Exercise,
        WorkoutPlan,
        WorkoutSession,
        ChatThread,
        ResolveCache,
    ]


async def connect() -> None:
    global _client
    settings = get_settings()
    # PyMongo's native async client. Motor (what this used before) wraps the
    # sync driver in a thread pool and reached end of life in May 2026.
    _client = AsyncMongoClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=8000,
        appname="befit-api",
    )
    await _client.admin.command("ping")
    database = _client[settings.mongodb_db]

    # Data fixes have to land before init_beanie builds indexes: a unique
    # index cannot be created over rows that already violate it.
    from app.core.migrations import run_migrations

    await run_migrations(database)
    await init_beanie(database=database, document_models=document_models())
    log.info("connected to MongoDB database %s", settings.mongodb_db)


async def disconnect() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
