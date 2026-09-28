from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentProfile, CurrentUser
from app.data.default_diet import DEFAULT_DIET_WEEK, MEAL_TIMES, PG_SWAPS
from app.models.diet import DietDay, DietPlan
from app.models.logs import MEAL_ORDER

router = APIRouter(prefix="/diet", tags=["diet"])

# Shown to someone who has no plan yet, so "add a plan" isn't a leap of faith
# into an empty form. One day, kept short on purpose.
EXAMPLE_DAY: dict[str, str] = {
    "breakfast": "Soaked oats 40 g + almonds + 1 fruit",
    "mid_morning": "Buttermilk or a boiled egg",
    "lunch": "Rice 150 g + dal + a vegetable + protein 100 g",
    "snack": "Fruit + roasted chana 20 g",
    "dinner": "2 eggs or paneer + sautéed vegetables",
}


class WeekResponse(BaseModel):
    has_plan: bool
    days: list[DietDay]
    meal_times: dict[str, str]
    pg_swaps: list[dict]
    # Populated only when there is no plan yet.
    example_day: dict[str, str] | None = None


async def _existing(user_id) -> DietPlan | None:
    return await DietPlan.find_one(DietPlan.user_id == user_id)


async def _require(user_id) -> DietPlan:
    plan = await _existing(user_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No diet plan yet. Create one first.",
        )
    return plan


@router.get("/week", response_model=WeekResponse)
async def week(user: CurrentUser, profile: CurrentProfile) -> WeekResponse:
    plan = await _existing(user.id)
    if plan is None:
        return WeekResponse(
            has_plan=False,
            days=[],
            meal_times=MEAL_TIMES,
            pg_swaps=PG_SWAPS,
            example_day=EXAMPLE_DAY,
        )
    return WeekResponse(
        has_plan=True,
        days=sorted(plan.days, key=lambda d: d.weekday),
        meal_times=MEAL_TIMES,
        pg_swaps=PG_SWAPS,
    )


class CreatePlanRequest(BaseModel):
    # False builds an empty week she fills in herself.
    from_template: bool = True


@router.post("/plan", response_model=WeekResponse, status_code=status.HTTP_201_CREATED)
async def create_plan(
    user: CurrentUser, profile: CurrentProfile, body: CreatePlanRequest
) -> WeekResponse:
    if await _existing(user.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A diet plan already exists."
        )

    veg_days = profile.dietary_rules.veg_days
    if body.from_template:
        days = [
            DietDay(
                weekday=day["weekday"],
                # The template's veg days are a starting point; her own profile
                # wins if onboarding set different ones.
                is_veg=day["weekday"] in veg_days if veg_days else day.get("is_veg", False),
                meals=dict(day["meals"]),
                note=day.get("note"),
            )
            for day in DEFAULT_DIET_WEEK
        ]
    else:
        days = [
            DietDay(
                weekday=weekday,
                is_veg=weekday in veg_days,
                meals={key: "" for key in MEAL_ORDER},
            )
            for weekday in range(7)
        ]

    plan = DietPlan(user_id=user.id, days=days)
    await plan.insert()
    return WeekResponse(
        has_plan=True,
        days=sorted(plan.days, key=lambda d: d.weekday),
        meal_times=MEAL_TIMES,
        pg_swaps=PG_SWAPS,
    )


def _day_of(plan: DietPlan, weekday: int) -> DietDay:
    if not 0 <= weekday <= 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Weekday must be 0 (Monday) to 6 (Sunday).",
        )
    for day in plan.days:
        if day.weekday == weekday:
            return day
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found.")


class MealUpdate(BaseModel):
    meal: str = Field(min_length=1, max_length=40)
    text: str = Field(max_length=400)


@router.patch("/day/{weekday}", response_model=DietDay)
async def update_meal(user: CurrentUser, weekday: int, body: MealUpdate) -> DietDay:
    """Single-slot edit, used by the inline tap-to-edit on the plan view."""
    plan = await _require(user.id)
    day = _day_of(plan, weekday)
    day.meals[body.meal] = body.text
    await plan.save()
    return day


class DaySlot(BaseModel):
    key: str = Field(min_length=1, max_length=40)
    text: str = Field(default="", max_length=400)


class DayUpdate(BaseModel):
    """Whole-day replace, used by the dedicated editor screen.

    Meals arrive as an ordered list rather than a dict so she can rename slots
    and reorder them without the editor having to diff two dictionaries.
    """

    is_veg: bool = False
    note: str | None = Field(default=None, max_length=400)
    meals: list[DaySlot] = Field(default_factory=list)


@router.put("/day/{weekday}", response_model=DietDay)
async def replace_day(user: CurrentUser, weekday: int, body: DayUpdate) -> DietDay:
    plan = await _require(user.id)
    day = _day_of(plan, weekday)

    day.is_veg = body.is_veg
    day.note = body.note or None
    # Dicts preserve insertion order in Python 3.7+, so the editor's ordering
    # survives the round trip.
    day.meals = {slot.key: slot.text for slot in body.meals if slot.key.strip()}

    await plan.save()
    return day


class CopyDayRequest(BaseModel):
    from_weekday: int = Field(ge=0, le=6)


@router.post("/day/{weekday}/copy", response_model=DietDay)
async def copy_day(user: CurrentUser, weekday: int, body: CopyDayRequest) -> DietDay:
    """Most weeks repeat. Copying Tuesday onto Thursday beats retyping it."""
    plan = await _require(user.id)
    source = _day_of(plan, body.from_weekday)
    target = _day_of(plan, weekday)

    target.meals = dict(source.meals)
    target.note = source.note
    target.is_veg = source.is_veg
    await plan.save()
    return target
