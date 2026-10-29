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
from app.core import http
from app.core.config import get_settings
from app.core.db import connect, disconnect
from app.services.seed import seed_foods

logging.getLogger("google_genai.types").setLevel(logging.ERROR)
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-8s %(name)s: %(message)s"
)
log = logging.getLogger("befit")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect()
    await seed_foods()
    yield
    await http.close()
    await disconnect()


_settings = get_settings()
app = FastAPI(
    title="BeFit API",
    version="0.2.0",
    summary="Personal health and fitness tracking. No ads, no subscriptions.",
    lifespan=lifespan,
    docs_url="/docs" if _settings.expose_docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if _settings.expose_docs else None,
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


@app.get("/healthz", tags=["meta"], include_in_schema=False)
async def liveness() -> dict:
    """No database call — for the host's liveness probe and keep-warm pings."""
    return {"status": "ok"}


@app.get("/health", tags=["meta"])
async def health() -> dict:
    from app.services import catalog

    await catalog.load()
    return {"status": "ok", "foods_indexed": catalog.size()}
