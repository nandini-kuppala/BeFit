import asyncio
import datetime as dt

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser
from app.api.routes.logs import _push_items
from app.core.clock import local_today
from app.models.food import FoodItem
from app.models.logs import FoodLog, LoggedFood, Meal
from app.models.meal import SavedMeal, SavedMealItem
from app.models.nutrients import NUTRIENT_FIELDS, Nutrients
from app.services import drafts, nutrition, portions

router = APIRouter(prefix="/meals", tags=["meals"])


class MealItemRequest(BaseModel):
    food_id: PydanticObjectId | None = None
    name: str | None = Field(default=None, max_length=120)
    quantity: float = Field(default=1.0, gt=0, le=100)
    unit: str = Field(default="serving", max_length=40)
    grams: float | None = Field(default=None, gt=0, le=5000)


class SavedMealRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    default_meal: Meal = "breakfast"
    items: list[MealItemRequest] = Field(min_length=1, max_length=30)


class SavedMealItemOut(BaseModel):
    food_id: str | None
    name: str
    quantity: float
    unit: str
    portion_key: str | None = None
    grams: float
    nutrients: Nutrients
    confidence: str
    # The food's portions, so the editor can change units without looking the
    # food up again. Opening a meal used to re-run the slow lookup chain for
    # every item and silently drop any that failed.
    portions: list[drafts.PortionOut] = []


class SavedMealOut(BaseModel):
    id: str
    name: str
    default_meal: Meal
    items: list[SavedMealItemOut]
    totals: Nutrients
    confidence: str
    times_logged: int
    last_logged_on: dt.date | None


def _out(meal: SavedMeal, foods: dict | None = None) -> SavedMealOut:
    foods = foods or {}
    return SavedMealOut(
        id=str(meal.id),
        name=meal.name,
        default_meal=meal.default_meal,
        items=[
            SavedMealItemOut(
                food_id=str(item.food_id) if item.food_id else None,
                name=item.name,
                quantity=item.quantity,
                unit=item.unit,
                portion_key=item.portion_key,
                grams=item.grams,
                nutrients=item.nutrients.rounded(2),
                confidence=item.confidence,
                portions=drafts.portions_out(foods[item.food_id])
                if item.food_id in foods
                else [],
            )
            for item in meal.items
        ],
        totals=meal.totals().rounded(1),
        confidence=meal.lowest_confidence(),
        times_logged=meal.times_logged,
        last_logged_on=meal.last_logged_on,
    )


async def _resolve(item: MealItemRequest, user_id: PydanticObjectId) -> SavedMealItem:
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
    return SavedMealItem(
        food_id=food.id,
        name=food.name,
        quantity=quantity,
        unit=unit,
        portion_key=key,
        grams=round(grams, 1),
        nutrients=food.per_100g.scaled(grams),
        source=food.source,
        confidence=food.confidence,
    )


async def _owned(user_id: PydanticObjectId, meal_id: PydanticObjectId) -> SavedMeal:
    meal = await SavedMeal.get(meal_id)
    if meal is None or meal.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal not found.")
    return meal


@router.get("", response_model=list[SavedMealOut])
async def list_meals(user: CurrentUser) -> list[SavedMealOut]:
    """Most-logged first — the thing she eats every morning should be at the top
    without her having to organise anything."""
    meals = await SavedMeal.find(SavedMeal.user_id == user.id).to_list()
    meals.sort(key=lambda m: (-m.times_logged, m.name.lower()))
    foods = await _foods_for(meals)
    return [_out(meal, foods) for meal in meals]


async def _foods_for(meals: list[SavedMeal]) -> dict:
    ids = {item.food_id for meal in meals for item in meal.items if item.food_id}
    if not ids:
        return {}
    return {f.id: f for f in await FoodItem.find({"_id": {"$in": list(ids)}}).to_list()}


@router.post("", response_model=SavedMealOut, status_code=status.HTTP_201_CREATED)
async def create_meal(user: CurrentUser, body: SavedMealRequest) -> SavedMealOut:
    items = list(await asyncio.gather(*(_resolve(item, user.id) for item in body.items)))
    meal = SavedMeal(
        user_id=user.id,
        name=body.name.strip(),
        default_meal=body.default_meal,
        items=items,
    )
    await meal.insert()
    return _out(meal, await _foods_for([meal]))


@router.put("/{meal_id}", response_model=SavedMealOut)
async def update_meal(
    user: CurrentUser, meal_id: PydanticObjectId, body: SavedMealRequest
) -> SavedMealOut:
    meal = await _owned(user.id, meal_id)
    meal.name = body.name.strip()
    meal.default_meal = body.default_meal
    meal.items = list(await asyncio.gather(*(_resolve(item, user.id) for item in body.items)))
    await meal.save()
    return _out(meal, await _foods_for([meal]))


@router.delete("/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meal(user: CurrentUser, meal_id: PydanticObjectId) -> None:
    meal = await _owned(user.id, meal_id)
    await meal.delete()


class FromLogRequest(BaseModel):
    """Saving a meal out of something already logged is the fastest way to build
    the library, because the hard part — getting the items right — is done."""

    name: str = Field(min_length=1, max_length=80)
    log_id: PydanticObjectId


@router.post("/from-log", response_model=SavedMealOut, status_code=status.HTTP_201_CREATED)
async def create_from_log(user: CurrentUser, body: FromLogRequest) -> SavedMealOut:
    log = await FoodLog.get(body.log_id)
    if log is None or log.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found.")
    if not log.items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That meal has nothing in it yet.",
        )

    meal = SavedMeal(
        user_id=user.id,
        name=body.name.strip(),
        default_meal=log.meal,
        items=[
            SavedMealItem(
                food_id=item.food_id,
                name=item.name,
                quantity=item.quantity,
                unit=item.unit,
                portion_key=item.portion_key,
                grams=item.grams,
                nutrients=item.nutrients,
                source=item.source,
                confidence=item.confidence,
            )
            for item in log.items
        ],
    )
    await meal.insert()
    return _out(meal)


class LogMealRequest(BaseModel):
    meal: Meal | None = None
    date: dt.date = Field(default_factory=local_today)
    # Half the usual bowl, or a double helping.
    scale: float = Field(default=1.0, gt=0, le=10)


@router.post("/{meal_id}/log", status_code=status.HTTP_201_CREATED)
async def log_saved_meal(
    user: CurrentUser, meal_id: PydanticObjectId, body: LogMealRequest
) -> dict:
    """One tap. Nutrients are copied as saved rather than re-resolved, so the
    number she saw when she built the meal is the number she gets."""
    saved = await _owned(user.id, meal_id)
    slot: Meal = body.meal or saved.default_meal

    def scaled(n: Nutrients) -> Nutrients:
        return Nutrients(**{f: getattr(n, f) * body.scale for f in NUTRIENT_FIELDS})

    logged = [
        LoggedFood(
            food_id=item.food_id,
            name=item.name,
            quantity=round(item.quantity * body.scale, 3),
            unit=item.unit,
            portion_key=item.portion_key,
            grams=round(item.grams * body.scale, 1),
            nutrients=scaled(item.nutrients),
            source=item.source,
            confidence=item.confidence,
        )
        for item in saved.items
    ]
    await _push_items(user.id, body.date, slot, logged, False)
    await SavedMeal.get_pymongo_collection().update_one(
        {"_id": saved.id},
        {"$inc": {"times_logged": 1}, "$set": {"last_logged_on": dt.datetime.combine(body.date, dt.time())}},
    )

    totals = saved.totals()
    return {"logged_to": slot, "kcal": round(totals.kcal * body.scale, 1), "items": len(logged)}
