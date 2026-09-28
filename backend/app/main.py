import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    auth,
    body,
    chat,
    diet,
    food,
    logs,
    meals,
    profile,
    supplements,
    voice,
    workouts,
)
from app.core.db import connect, disconnect
from app.services.seed import seed_foods

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-8s %(name)s: %(message)s"
)
log = logging.getLogger("befit")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect()
    await seed_foods()
    yield
    await disconnect()


app = FastAPI(
    title="BeFit API",
    version="0.1.0",
    summary="Personal health and fitness tracking. No ads, no subscriptions.",
    lifespan=lifespan,
)

# The mobile app is not browser-hosted, so this is only for the Expo dev client
# and the OpenAPI docs page.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    profile.router,
    food.router,
    meals.router,
    logs.router,
    supplements.router,
    voice.router,
    workouts.router,
    body.router,
    diet.router,
    chat.router,
):
    app.include_router(router)


@app.get("/health", tags=["meta"])
async def health() -> dict:
    from app.models.food import FoodItem

    return {"status": "ok", "foods_indexed": await FoodItem.count()}
