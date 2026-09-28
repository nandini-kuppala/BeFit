import datetime as dt

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser
from app.models.food import FoodItem
from app.models.logs import FoodLog, LoggedFood, Meal
from app.models.meal import SavedMeal, SavedMealItem
from app.models.nutrients import Nutrients
from app.services import nutrition

router = APIRouter(prefix="/meals", tags=["meals"])


class MealItemRequest(BaseModel):
    food_id: PydanticObjectId | None = None
    name: str | None = None
    quantity: float = Field(default=1.0, gt=0)
    unit: str = "serving"


class SavedMealRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    default_meal: Meal = "breakfast"
    items: list[MealItemRequest] = Field(min_length=1)


class SavedMealItemOut(BaseModel):
    food_id: str | None
    name: str
    quantity: float
    unit: str
    grams: float
    nutrients: Nutrients
    confidence: str


class SavedMealOut(BaseModel):
    id: str
    name: str
    default_meal: Meal
    items: list[SavedMealItemOut]
    totals: Nutrients
    confidence: str
    times_logged: int
    last_logged_on: dt.date | None


def _out(meal: SavedMeal) -> SavedMealOut:
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
                grams=item.grams,
                nutrients=item.nutrients,
                confidence=item.confidence,
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
        food = await FoodItem.get(item.food_id)
    if food is None and item.name:
        food = await nutrition.resolve(item.name, user_id)
    if food is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Couldn't resolve '{item.name or item.food_id}'.",
        )

    grams = nutrition.to_grams(food, item.quantity, item.unit)
    return SavedMealItem(
        food_id=food.id,
        name=food.name,
        quantity=item.quantity,
        unit=item.unit,
        grams=round(grams, 1),
        nutrients=food.per_100g.scaled(grams).rounded(),
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
    return [_out(meal) for meal in meals]


@router.post("", response_model=SavedMealOut, status_code=status.HTTP_201_CREATED)
async def create_meal(user: CurrentUser, body: SavedMealRequest) -> SavedMealOut:
    items = [await _resolve(item, user.id) for item in body.items]
    meal = SavedMeal(
        user_id=user.id,
        name=body.name.strip(),
        default_meal=body.default_meal,
        items=items,
    )
    await meal.insert()
    return _out(meal)


@router.put("/{meal_id}", response_model=SavedMealOut)
async def update_meal(
    user: CurrentUser, meal_id: PydanticObjectId, body: SavedMealRequest
) -> SavedMealOut:
    meal = await _owned(user.id, meal_id)
    meal.name = body.name.strip()
    meal.default_meal = body.default_meal
    meal.items = [await _resolve(item, user.id) for item in body.items]
    await meal.save()
    return _out(meal)


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
    date: dt.date = Field(default_factory=dt.date.today)


@router.post("/{meal_id}/log", status_code=status.HTTP_201_CREATED)
async def log_saved_meal(
    user: CurrentUser, meal_id: PydanticObjectId, body: LogMealRequest
) -> dict:
    """One tap. Nutrients are copied as saved rather than re-resolved, so the
    number she saw when she built the meal is the number she gets."""
    saved = await _owned(user.id, meal_id)
    slot: Meal = body.meal or saved.default_meal

    logged = [
        LoggedFood(
            food_id=item.food_id,
            name=item.name,
            quantity=item.quantity,
            unit=item.unit,
            grams=item.grams,
            nutrients=item.nutrients,
            source=item.source,
            confidence=item.confidence,
        )
        for item in saved.items
    ]

    entry = await FoodLog.find_one(
        FoodLog.user_id == user.id, FoodLog.date == body.date, FoodLog.meal == slot
    )
    if entry:
        entry.items.extend(logged)
        await entry.save()
    else:
        entry = FoodLog(user_id=user.id, date=body.date, meal=slot, items=logged)
        await entry.insert()

    saved.times_logged += 1
    saved.last_logged_on = body.date
    await saved.save()

    totals = saved.totals().rounded(1)
    return {"logged_to": slot, "kcal": totals.kcal, "items": len(logged)}
