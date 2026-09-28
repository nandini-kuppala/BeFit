import datetime as dt

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import ActiveTargets, CurrentUser
from app.models.food import FoodItem
from app.models.logs import (
    MEAL_ORDER,
    FoodLog,
    LoggedFood,
    Meal,
    SleepLog,
    WaterEntry,
    WaterLog,
    WeightLog,
)
from app.models.nutrients import Nutrients
from app.models.targets import Targets
from app.services import nutrition

router = APIRouter(prefix="/logs", tags=["logs"])


# ------------------------------------------------------------------ food


class LogItemRequest(BaseModel):
    food_id: PydanticObjectId | None = None
    name: str | None = None
    quantity: float = Field(default=1.0, gt=0)
    unit: str = "serving"


class LogFoodRequest(BaseModel):
    date: dt.date = Field(default_factory=dt.date.today)
    meal: Meal
    items: list[LogItemRequest] = Field(min_length=1)
    via_voice: bool = False


async def _to_logged(item: LogItemRequest, user_id: PydanticObjectId) -> LoggedFood:
    food: FoodItem | None = None
    if item.food_id:
        food = await FoodItem.get(item.food_id)
    if food is None and item.name:
        food = await nutrition.resolve(item.name, user_id)
    if food is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Couldn't resolve '{item.name or item.food_id}'.",
        )

    grams = nutrition.to_grams(food, item.quantity, item.unit)
    return LoggedFood(
        food_id=food.id,
        name=food.name,
        quantity=item.quantity,
        unit=item.unit,
        grams=round(grams, 1),
        nutrients=food.per_100g.scaled(grams).rounded(),
        source=food.source,
        confidence=food.confidence,
    )


@router.post("/food", response_model=FoodLog, status_code=status.HTTP_201_CREATED)
async def log_food(user: CurrentUser, body: LogFoodRequest) -> FoodLog:
    logged = [await _to_logged(item, user.id) for item in body.items]

    existing = await FoodLog.find_one(
        FoodLog.user_id == user.id, FoodLog.date == body.date, FoodLog.meal == body.meal
    )
    if existing:
        existing.items.extend(logged)
        existing.via_voice = existing.via_voice or body.via_voice
        await existing.save()
        return existing

    entry = FoodLog(
        user_id=user.id,
        date=body.date,
        meal=body.meal,
        items=logged,
        via_voice=body.via_voice,
    )
    await entry.insert()
    return entry


@router.delete("/food/{log_id}/item/{index}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(user: CurrentUser, log_id: PydanticObjectId, index: int) -> None:
    entry = await FoodLog.get(log_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found.")
    if not 0 <= index < len(entry.items):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")
    entry.items.pop(index)
    if entry.items:
        await entry.save()
    else:
        await entry.delete()


# ------------------------------------------------------- water / sleep / weight


class WaterRequest(BaseModel):
    ml: int = Field(gt=0, le=3000)
    date: dt.date = Field(default_factory=dt.date.today)


@router.post("/water", response_model=WaterLog)
async def log_water(user: CurrentUser, body: WaterRequest) -> WaterLog:
    entry = await WaterLog.find_one(
        WaterLog.user_id == user.id, WaterLog.date == body.date
    )
    if entry is None:
        entry = WaterLog(user_id=user.id, date=body.date)
    entry.entries.append(WaterEntry(ml=body.ml))
    await entry.save()
    return entry


@router.delete("/water/last", response_model=WaterLog | None)
async def undo_water(
    user: CurrentUser, on: dt.date = Query(default_factory=dt.date.today)
) -> WaterLog | None:
    """One-tap logging needs one-tap undo, or a misplaced thumb costs a litre."""
    entry = await WaterLog.find_one(WaterLog.user_id == user.id, WaterLog.date == on)
    if entry is None or not entry.entries:
        return None
    entry.entries.pop()
    await entry.save()
    return entry


class SleepRequest(BaseModel):
    date: dt.date = Field(default_factory=dt.date.today)
    bed_at: dt.datetime
    wake_at: dt.datetime
    quality: int | None = Field(default=None, ge=1, le=5)


@router.post("/sleep", response_model=SleepLog)
async def log_sleep(user: CurrentUser, body: SleepRequest) -> SleepLog:
    if body.wake_at <= body.bed_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Wake time must be after bed time.",
        )
    entry = await SleepLog.find_one(SleepLog.user_id == user.id, SleepLog.date == body.date)
    if entry is None:
        entry = SleepLog(
            user_id=user.id, date=body.date, bed_at=body.bed_at, wake_at=body.wake_at
        )
    else:
        entry.bed_at, entry.wake_at = body.bed_at, body.wake_at
    entry.quality = body.quality
    await entry.save()
    return entry


class SleepNight(BaseModel):
    date: dt.date
    minutes: int | None
    bed_at: dt.datetime | None
    wake_at: dt.datetime | None
    quality: int | None


class SleepTrend(BaseModel):
    nights: list[SleepNight]
    target_hours: float
    average_minutes: int | None
    nights_on_target: int


@router.get("/sleep", response_model=SleepTrend)
async def sleep_trend(
    user: CurrentUser,
    targets: ActiveTargets,
    days: int = Query(default=7, ge=1, le=90),
    to: dt.date = Query(default_factory=dt.date.today),
) -> SleepTrend:
    """Returns one row per calendar day including the blanks.

    A missing night has to stay visible in the chart — a gap is information,
    and silently dropping it would make a patchy week look like a perfect one.
    """
    start = to - dt.timedelta(days=days - 1)
    logged = await SleepLog.find(
        SleepLog.user_id == user.id,
        SleepLog.date >= start,
        SleepLog.date <= to,
    ).to_list()
    by_date = {entry.date: entry for entry in logged}

    nights: list[SleepNight] = []
    for offset in range(days):
        day = start + dt.timedelta(days=offset)
        entry = by_date.get(day)
        nights.append(
            SleepNight(
                date=day,
                minutes=entry.duration_minutes if entry else None,
                bed_at=entry.bed_at if entry else None,
                wake_at=entry.wake_at if entry else None,
                quality=entry.quality if entry else None,
            )
        )

    recorded = [night.minutes for night in nights if night.minutes is not None]
    target_minutes = targets.sleep_hours * 60
    return SleepTrend(
        nights=nights,
        target_hours=targets.sleep_hours,
        average_minutes=round(sum(recorded) / len(recorded)) if recorded else None,
        nights_on_target=sum(1 for value in recorded if value >= target_minutes - 30),
    )


class WeightRequest(BaseModel):
    date: dt.date = Field(default_factory=dt.date.today)
    kg: float = Field(gt=25, lt=300)
    note: str | None = None


@router.post("/weight", response_model=WeightLog)
async def log_weight(user: CurrentUser, body: WeightRequest) -> WeightLog:
    entry = await WeightLog.find_one(
        WeightLog.user_id == user.id, WeightLog.date == body.date
    )
    if entry is None:
        entry = WeightLog(user_id=user.id, date=body.date, kg=body.kg, note=body.note)
    else:
        entry.kg, entry.note = body.kg, body.note
    await entry.save()
    return entry


@router.get("/weight", response_model=list[WeightLog])
async def weight_history(
    user: CurrentUser, limit: int = Query(default=120, le=400)
) -> list[WeightLog]:
    return (
        await WeightLog.find(WeightLog.user_id == user.id)
        .sort(-WeightLog.date)
        .limit(limit)
        .to_list()
    )


# ------------------------------------------------------------------ day rollup


class MicroProgress(BaseModel):
    key: str
    label: str
    unit: str
    consumed: float
    target: float
    percent: float
    is_upper_limit: bool
    exceeded: bool
    priority: int


class MealGroup(BaseModel):
    meal: Meal
    log_id: str | None
    items: list[LoggedFood]
    kcal: float


class DaySummary(BaseModel):
    date: dt.date
    targets: Targets
    consumed: Nutrients
    remaining_kcal: float
    meals: list[MealGroup]
    micros: list[MicroProgress]
    # Share of the day's calories that came from AI-estimated data. When this
    # is high the headline number deserves less trust, and the UI says so.
    estimated_share: float
    water_ml: int
    sleep_minutes: int | None
    weight_kg: float | None


@router.get("/day", response_model=DaySummary)
async def day_summary(
    user: CurrentUser,
    targets: ActiveTargets,
    on: dt.date = Query(default_factory=dt.date.today),
) -> DaySummary:
    logs = await FoodLog.find(FoodLog.user_id == user.id, FoodLog.date == on).to_list()
    by_meal = {log.meal: log for log in logs}

    consumed = Nutrients()
    estimated_kcal = 0.0
    for log in logs:
        for item in log.items:
            consumed = consumed + item.nutrients
            if item.confidence == "estimated":
                estimated_kcal += item.nutrients.kcal

    meals = [
        MealGroup(
            meal=meal,
            log_id=str(by_meal[meal].id) if meal in by_meal else None,
            items=by_meal[meal].items if meal in by_meal else [],
            kcal=round(by_meal[meal].totals().kcal, 1) if meal in by_meal else 0.0,
        )
        for meal in MEAL_ORDER
    ]

    micros = []
    for target in targets.micros:
        amount = getattr(consumed, target.key, 0.0)
        percent = (amount / target.amount * 100.0) if target.amount else 0.0
        micros.append(
            MicroProgress(
                key=target.key,
                label=target.label,
                unit=target.unit,
                consumed=round(amount, 2),
                target=target.amount,
                percent=round(percent, 1),
                is_upper_limit=target.is_upper_limit,
                exceeded=target.is_upper_limit and amount > target.amount,
                priority=target.priority,
            )
        )
    micros.sort(key=lambda m: (m.priority, m.label))

    water = await WaterLog.find_one(WaterLog.user_id == user.id, WaterLog.date == on)
    sleep = await SleepLog.find_one(SleepLog.user_id == user.id, SleepLog.date == on)
    weight = await WeightLog.find_one(WeightLog.user_id == user.id, WeightLog.date == on)

    return DaySummary(
        date=on,
        targets=targets,
        consumed=consumed.rounded(1),
        remaining_kcal=round(targets.kcal - consumed.kcal, 1),
        meals=meals,
        micros=micros,
        estimated_share=round(estimated_kcal / consumed.kcal, 3) if consumed.kcal else 0.0,
        water_ml=water.total_ml if water else 0,
        sleep_minutes=sleep.duration_minutes if sleep else None,
        weight_kg=weight.kg if weight else None,
    )
