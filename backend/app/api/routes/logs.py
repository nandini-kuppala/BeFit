import asyncio
import datetime as dt

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.api.deps import CurrentUser, LocalDate, targets_on
from app.core.clock import local_today
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
from app.models.nutrients import NUTRIENT_FIELDS, Nutrients
from app.models.targets import Targets
from app.services import nutrition, portions

router = APIRouter(prefix="/logs", tags=["logs"])


# ------------------------------------------------------------------ food


class QuickAdd(BaseModel):
    """Calories (and optionally macros) without a food — the canteen meal she
    can't identify, or a label she read but doesn't want to save."""

    name: str = Field(default="Quick add", max_length=80)
    kcal: float = Field(ge=0, le=5000)
    protein_g: float = Field(default=0.0, ge=0, le=500)
    fat_g: float = Field(default=0.0, ge=0, le=500)
    carbs_g: float = Field(default=0.0, ge=0, le=1000)


class LogItemRequest(BaseModel):
    food_id: PydanticObjectId | None = None
    name: str | None = Field(default=None, max_length=120)
    quantity: float = Field(default=1.0, gt=0, le=100)
    # A portion key from the food's `portions` ("katori", "idli", "g"), or any
    # spoken unit, which is canonicalised server-side.
    unit: str = Field(default="serving", max_length=40)
    # Grams directly, for "I weighed it". Overrides quantity/unit.
    grams: float | None = Field(default=None, gt=0, le=5000)
    quick: QuickAdd | None = None


class LogFoodRequest(BaseModel):
    date: dt.date = Field(default_factory=local_today)
    meal: Meal
    items: list[LogItemRequest] = Field(min_length=1, max_length=25)
    via_voice: bool = False


async def _to_logged(item: LogItemRequest, user_id: PydanticObjectId) -> LoggedFood:
    if item.quick is not None:
        q = item.quick
        return LoggedFood(
            name=q.name.strip() or "Quick add",
            quantity=1.0,
            unit="entry",
            portion_key="entry",
            grams=0.0,
            nutrients=Nutrients(kcal=q.kcal, protein_g=q.protein_g, fat_g=q.fat_g, carbs_g=q.carbs_g),
            source="personal",
            confidence="estimated",
        )

    food: FoodItem | None = None
    if item.food_id:
        food = await nutrition.get_visible(item.food_id, user_id)
    if food is None and item.name:
        food = await nutrition.resolve(item.name, user_id)
    if food is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Couldn't find '{item.name or item.food_id}'.",
        )

    if item.grams is not None:
        grams, quantity, key, unit = item.grams, item.grams, "g", "g"
    else:
        converted = portions.to_grams(food, item.quantity, item.unit)
        grams, quantity = converted.grams, item.quantity
        key, unit = converted.portion.key, converted.portion.label.removeprefix("1 ")

    return LoggedFood(
        food_id=food.id,
        name=food.name,
        quantity=quantity,
        unit=unit,
        portion_key=key,
        grams=round(grams, 1),
        # Full precision: rounding to 2 dp per item zeroed small micronutrients
        # (B12 in µg) before they could add up. Round for display only.
        nutrients=food.per_100g.scaled(grams),
        source=food.source,
        confidence=food.confidence,
    )


async def _push_items(
    user_id: PydanticObjectId, on: dt.date, meal: Meal, items: list[LoggedFood], via_voice: bool
) -> FoodLog:
    """Append atomically. The old read-extend-save lost an item whenever two
    writes overlapped, and two first writes created two logs for one meal."""
    collection = FoodLog.get_pymongo_collection()
    payload = [item.model_dump() for item in items]
    filter_ = {"user_id": user_id, "date": dt.datetime.combine(on, dt.time()), "meal": meal}
    update = {
        "$push": {"items": {"$each": payload}},
        "$setOnInsert": {"logged_at": dt.datetime.now(dt.UTC)},
    }
    if via_voice:
        update["$set"] = {"via_voice": True}
    else:
        update["$setOnInsert"]["via_voice"] = False
    for attempt in range(2):
        try:
            raw = await collection.find_one_and_update(
                filter_, update, upsert=True, return_document=ReturnDocument.AFTER
            )
            return FoodLog.model_validate({**raw, "id": raw["_id"]})
        except DuplicateKeyError:
            # Two upserts raced to create the meal; the second retries as an update.
            if attempt:
                raise
    raise RuntimeError("unreachable")


@router.post("/food", response_model=FoodLog, status_code=status.HTTP_201_CREATED)
async def log_food(user: CurrentUser, body: LogFoodRequest) -> FoodLog:
    gate = asyncio.Semaphore(4)

    async def one(item: LogItemRequest) -> LoggedFood:
        async with gate:
            return await _to_logged(item, user.id)

    logged = list(await asyncio.gather(*(one(i) for i in body.items)))
    return await _push_items(user.id, body.date, body.meal, logged, body.via_voice)


async def _owned_log(user_id: PydanticObjectId, log_id: PydanticObjectId) -> FoodLog:
    entry = await FoodLog.get(log_id)
    if entry is None or entry.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found.")
    return entry


async def _drop_if_empty(log_id: PydanticObjectId) -> None:
    await FoodLog.get_pymongo_collection().delete_one({"_id": log_id, "items": {"$size": 0}})


@router.delete("/food/{log_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(user: CurrentUser, log_id: PydanticObjectId, item_id: PydanticObjectId) -> None:
    result = await FoodLog.get_pymongo_collection().update_one(
        {"_id": log_id, "user_id": user.id}, {"$pull": {"items": {"id": item_id}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found.")
    await _drop_if_empty(log_id)


@router.delete("/food/{log_id}/item/{index}", status_code=status.HTTP_204_NO_CONTENT, deprecated=True)
async def delete_item_by_index(user: CurrentUser, log_id: PydanticObjectId, index: int) -> None:
    """Old clients address items by position. Resolved to an id first."""
    entry = await _owned_log(user.id, log_id)
    if not 0 <= index < len(entry.items):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")
    await delete_item(user, log_id, entry.items[index].id)


class UpdateItemRequest(BaseModel):
    quantity: float | None = Field(default=None, gt=0, le=100)
    unit: str | None = Field(default=None, max_length=40)
    grams: float | None = Field(default=None, gt=0, le=5000)
    # Move to another meal (and/or day).
    meal: Meal | None = None
    date: dt.date | None = None


@router.patch("/food/{log_id}/items/{item_id}", response_model=LoggedFood)
async def update_item(
    user: CurrentUser,
    log_id: PydanticObjectId,
    item_id: PydanticObjectId,
    body: UpdateItemRequest,
) -> LoggedFood:
    """Change how much, in what unit, or which meal/day it belongs to.

    Nutrients are recomputed from the food's current numbers — editing an
    entry is a fresh statement of what she ate.
    """
    entry = await _owned_log(user.id, log_id)
    item = next((i for i in entry.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")

    updated = item.model_copy()
    amount_changed = body.quantity is not None or body.unit is not None or body.grams is not None
    if amount_changed:
        food = await nutrition.get_visible(item.food_id, user.id) if item.food_id else None
        if food is None:
            # Quick-add or a deleted food: scale the frozen numbers instead.
            if body.quantity is None or item.quantity <= 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="This entry can only be scaled by quantity.",
                )
            factor = body.quantity / item.quantity
            updated.nutrients = Nutrients(
                **{f: getattr(item.nutrients, f) * factor for f in NUTRIENT_FIELDS}
            )
            updated.grams = round(item.grams * factor, 1)
            updated.quantity = body.quantity
        else:
            if body.grams is not None:
                grams, qty, key, unit = body.grams, body.grams, "g", "g"
            else:
                qty = body.quantity if body.quantity is not None else item.quantity
                converted = portions.to_grams(food, qty, body.unit or item.portion_key or item.unit)
                grams = converted.grams
                key, unit = converted.portion.key, converted.portion.label.removeprefix("1 ")
            updated.quantity, updated.unit, updated.portion_key = qty, unit, key
            updated.grams = round(grams, 1)
            updated.nutrients = food.per_100g.scaled(grams)
            updated.name, updated.source, updated.confidence = food.name, food.source, food.confidence

    target_meal = body.meal or entry.meal
    target_date = body.date or entry.date
    collection = FoodLog.get_pymongo_collection()
    if target_meal == entry.meal and target_date == entry.date:
        await collection.update_one(
            {"_id": log_id, "user_id": user.id, "items.id": item_id},
            {"$set": {"items.$": updated.model_dump()}},
        )
    else:
        await collection.update_one(
            {"_id": log_id, "user_id": user.id}, {"$pull": {"items": {"id": item_id}}}
        )
        await _push_items(user.id, target_date, target_meal, [updated], False)
        await _drop_if_empty(log_id)
    return updated


class CopyMealRequest(BaseModel):
    from_date: dt.date
    from_meal: Meal
    to_date: dt.date = Field(default_factory=local_today)
    to_meal: Meal | None = None
    # Specific items only; all when omitted.
    item_ids: list[PydanticObjectId] | None = None


@router.post("/food/copy", response_model=FoodLog, status_code=status.HTTP_201_CREATED)
async def copy_meal(user: CurrentUser, body: CopyMealRequest) -> FoodLog:
    """"Same breakfast as yesterday" in one tap."""
    source = await FoodLog.find_one(
        FoodLog.user_id == user.id, FoodLog.date == body.from_date, FoodLog.meal == body.from_meal
    )
    if source is None or not source.items:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nothing logged there to copy.")
    chosen = [
        i for i in source.items if body.item_ids is None or i.id in set(body.item_ids)
    ]
    if not chosen:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="None of those items exist.")
    copies = [
        i.model_copy(update={"id": PydanticObjectId(), "added_at": dt.datetime.now(dt.UTC)})
        for i in chosen
    ]
    return await _push_items(user.id, body.to_date, body.to_meal or body.from_meal, copies, False)


# ------------------------------------------------------- water / sleep / weight


class WaterRequest(BaseModel):
    ml: int = Field(gt=0, le=3000)
    date: dt.date = Field(default_factory=local_today)


async def _water_doc(user_id: PydanticObjectId, on: dt.date, update: dict) -> WaterLog | None:
    raw = await WaterLog.get_pymongo_collection().find_one_and_update(
        {"user_id": user_id, "date": dt.datetime.combine(on, dt.time())},
        update,
        upsert="$push" in update,
        return_document=ReturnDocument.AFTER,
    )
    return WaterLog.model_validate({**raw, "id": raw["_id"]}) if raw else None


@router.post("/water", response_model=WaterLog)
async def log_water(user: CurrentUser, body: WaterRequest) -> WaterLog:
    entry = WaterEntry(ml=body.ml).model_dump()
    try:
        return await _water_doc(user.id, body.date, {"$push": {"entries": entry}})
    except DuplicateKeyError:
        return await _water_doc(user.id, body.date, {"$push": {"entries": entry}})


@router.delete("/water/last", response_model=WaterLog | None)
async def undo_water(user: CurrentUser, on: LocalDate) -> WaterLog | None:
    """One-tap logging needs one-tap undo, or a misplaced thumb costs a litre."""
    return await _water_doc(user.id, on, {"$pop": {"entries": 1}})


class SleepRequest(BaseModel):
    date: dt.date = Field(default_factory=local_today)
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
    if body.wake_at - body.bed_at > dt.timedelta(hours=20):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That's more than 20 hours — check the times.",
        )
    await SleepLog.find_one(SleepLog.user_id == user.id, SleepLog.date == body.date).upsert(
        {"$set": {"bed_at": body.bed_at, "wake_at": body.wake_at, "quality": body.quality}},
        on_insert=SleepLog(
            user_id=user.id, date=body.date, bed_at=body.bed_at, wake_at=body.wake_at,
            quality=body.quality,
        ),
    )
    return await SleepLog.find_one(SleepLog.user_id == user.id, SleepLog.date == body.date)


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
    days: int = Query(default=7, ge=1, le=90),
    to: dt.date = Query(default_factory=local_today),
) -> SleepTrend:
    """Returns one row per calendar day including the blanks.

    A missing night has to stay visible in the chart — a gap is information,
    and silently dropping it would make a patchy week look like a perfect one.
    """
    start = to - dt.timedelta(days=days - 1)
    logged, targets = await asyncio.gather(
        SleepLog.find(
            SleepLog.user_id == user.id, SleepLog.date >= start, SleepLog.date <= to
        ).to_list(),
        targets_on(user.id, to),
    )
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
    date: dt.date = Field(default_factory=local_today)
    kg: float = Field(gt=25, lt=300)
    note: str | None = Field(default=None, max_length=200)


@router.post("/weight", response_model=WeightLog)
async def log_weight(user: CurrentUser, body: WeightRequest) -> WeightLog:
    await WeightLog.find_one(WeightLog.user_id == user.id, WeightLog.date == body.date).upsert(
        {"$set": {"kg": body.kg, "note": body.note}},
        on_insert=WeightLog(user_id=user.id, date=body.date, kg=body.kg, note=body.note),
    )
    return await WeightLog.find_one(WeightLog.user_id == user.id, WeightLog.date == body.date)


@router.delete("/weight/{on}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_weight(user: CurrentUser, on: dt.date) -> None:
    await WeightLog.find(WeightLog.user_id == user.id, WeightLog.date == on).delete()


@router.get("/weight", response_model=list[WeightLog])
async def weight_history(
    user: CurrentUser, limit: int = Query(default=120, ge=1, le=400)
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
    protein_g: float = 0.0


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


def _rounded_item(item: LoggedFood) -> LoggedFood:
    return item.model_copy(update={"nutrients": item.nutrients.rounded(2)})


@router.get("/day", response_model=DaySummary)
async def day_summary(user: CurrentUser, on: LocalDate) -> DaySummary:
    # Five independent reads, issued together: sequentially they were five
    # round trips to Atlas before the home screen could render.
    logs, targets, water, sleep, weight = await asyncio.gather(
        FoodLog.find(FoodLog.user_id == user.id, FoodLog.date == on).to_list(),
        targets_on(user.id, on),
        WaterLog.find_one(WaterLog.user_id == user.id, WaterLog.date == on),
        SleepLog.find_one(SleepLog.user_id == user.id, SleepLog.date == on),
        WeightLog.find_one(WeightLog.user_id == user.id, WeightLog.date == on),
    )

    by_meal: dict[str, list[FoodLog]] = {}
    for log in logs:
        by_meal.setdefault(log.meal, []).append(log)

    consumed = Nutrients()
    estimated_kcal = 0.0
    meals: list[MealGroup] = []
    for meal in MEAL_ORDER:
        group = by_meal.get(meal, [])
        items = [item for log in group for item in log.items]
        meal_total = Nutrients()
        for item in items:
            meal_total = meal_total + item.nutrients
            if item.confidence == "estimated":
                estimated_kcal += item.nutrients.kcal
        consumed = consumed + meal_total
        meals.append(
            MealGroup(
                meal=meal,
                log_id=str(group[0].id) if group else None,
                items=[_rounded_item(i) for i in items],
                kcal=round(meal_total.kcal, 1),
                protein_g=round(meal_total.protein_g, 1),
            )
        )

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


class DayKcal(BaseModel):
    date: dt.date
    kcal: float
    protein_g: float
    target_kcal: float


@router.get("/history", response_model=list[DayKcal])
async def history(
    user: CurrentUser,
    days: int = Query(default=14, ge=1, le=120),
    to: dt.date = Query(default_factory=local_today),
) -> list[DayKcal]:
    """Calories per day for the date strip and weekly trend, without loading
    every day's full summary."""
    start = to - dt.timedelta(days=days - 1)
    logs, targets = await asyncio.gather(
        FoodLog.find(FoodLog.user_id == user.id, FoodLog.date >= start, FoodLog.date <= to).to_list(),
        targets_on(user.id, to),
    )
    totals: dict[dt.date, list[float]] = {}
    for log in logs:
        bucket = totals.setdefault(log.date, [0.0, 0.0])
        for item in log.items:
            bucket[0] += item.nutrients.kcal
            bucket[1] += item.nutrients.protein_g
    return [
        DayKcal(
            date=start + dt.timedelta(days=i),
            kcal=round(totals.get(start + dt.timedelta(days=i), [0.0, 0.0])[0], 1),
            protein_g=round(totals.get(start + dt.timedelta(days=i), [0.0, 0.0])[1], 1),
            target_kcal=targets.kcal,
        )
        for i in range(days)
    ]
