import logging

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import get_settings

log = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None


def document_models() -> list:
    from app.models.body import BodyComposition, BodyMap
    from app.models.chat import ChatThread
    from app.models.diet import DietPlan
    from app.models.food import FoodItem
    from app.models.logs import FoodLog, SleepLog, WaterLog, WeightLog
    from app.models.meal import SavedMeal
    from app.models.profile import Profile
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
    ]


async def connect() -> None:
    global _client
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=8000)
    await _client.admin.command("ping")
    await init_beanie(
        database=_client[settings.mongodb_db],
        document_models=document_models(),
    )
    log.info("connected to MongoDB database %s", settings.mongodb_db)


async def disconnect() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
