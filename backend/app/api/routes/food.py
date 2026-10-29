import datetime as dt

from beanie import PydanticObjectId
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, ai_quota
from app.api.uploads import image_mime, read_limited
from app.core.clock import local_now, local_today
from app.models.food import FoodItem, RecipeIngredient, normalise_name
from app.models.logs import FoodLog, Meal
from app.models.nutrients import NUTRIENT_FIELDS, HouseholdUnit, Nutrients
from app.services import drafts, gemini, matching, nutrition

router = APIRouter(prefix="/food", tags=["food"])

MAX_PHOTO_BYTES = 8 * 1024 * 1024


class FoodSummary(BaseModel):
    id: str
    name: str
    category: str | None
    source: str
    confidence: str
    is_veg: bool
    brand: str | None = None
    per_100g: Nutrients
    # Every unit it can be logged in, one unit each, default first. Clients
    # should send `portion_key` + quantity; grams are computed server-side.
    portions: list[drafts.PortionOut]
    default_grams: float
    # Kept for older clients; same data as `portions`.
    household_units: list[HouseholdUnit]
    family: str | None = None
    variant: str | None = None
    # How many other variations of this dish exist ("Roti" -> 4 more).
    variants_count: int = 0
    is_personal: bool = False
    is_recipe: bool = False
    # How well this answers the query, 0-1. Lets the UI tell a real hit from a
    # near miss instead of presenting both as equally correct.
    match_score: float = 1.0

    @classmethod
    def of(cls, food: FoodItem, match_score: float = 1.0, variants_count: int = 0) -> "FoodSummary":
        portions = drafts.portions_out(food)
        return cls(
            id=str(food.id),
            name=food.name,
            category=food.category,
            source=food.source,
            confidence=food.confidence,
            is_veg=food.is_veg,
            brand=food.brand,
            per_100g=food.per_100g,
            portions=portions,
            default_grams=portions[0].grams,
            household_units=food.household_units or [HouseholdUnit(label="100 g", grams=100.0)],
            family=food.family,
            variant=food.variant,
            variants_count=variants_count,
            is_personal=food.owner_id is not None,
            is_recipe=bool(food.recipe),
            match_score=round(match_score, 3),
        )


class SearchResponse(BaseModel):
    results: list[FoodSummary]
    # True when something matched closely enough to log without a second
    # thought. When false the UI should offer lookup or manual entry rather
    # than presenting near misses as answers.
    has_exact_match: bool
    query: str


def _family_sizes() -> dict[str, int]:
    from app.services import catalog

    sizes: dict[str, int] = {}
    for food in catalog._foods.values():  # noqa: SLF001 — read-only view
        if food.family:
            sizes[food.family] = sizes.get(food.family, 0) + 1
    return sizes


@router.get("/search", response_model=SearchResponse)
async def search(
    user: CurrentUser,
    q: str = Query(min_length=1, max_length=80),
    limit: int = Query(default=15, ge=1, le=40),
) -> SearchResponse:
    """Local tiers only — instant, no API cost."""
    scored = await nutrition.search_scored(q, user.id, limit)
    sizes = _family_sizes()
    return SearchResponse(
        results=[
            FoodSummary.of(
                food, value, max(sizes.get(food.family, 1) - 1, 0) if food.family else 0
            )
            for food, value in scored
        ],
        has_exact_match=bool(scored and scored[0][1] >= matching.CONFIDENT),
        query=q,
    )


# ----------------------------------------------------------- recent / frequent


class RecentFood(BaseModel):
    food: FoodSummary
    times: int
    last_logged: dt.datetime
    # What she had last time — the sheet opens prefilled with it, which is
    # the single biggest saving for foods eaten the same way every day.
    last_quantity: float
    last_portion_key: str | None
    last_meal: Meal


class RecentResponse(BaseModel):
    recent: list[RecentFood]
    frequent: list[RecentFood]
    # Frequent at this time of day: what she usually has for this meal.
    for_meal: list[RecentFood]
    meal: Meal


def _meal_now() -> Meal:
    from app.api.routes.voice import guess_meal

    return guess_meal(local_now().hour)


@router.get("/recent", response_model=RecentResponse)
async def recent(
    user: CurrentUser,
    days: int = Query(default=45, ge=1, le=365),
    meal: Meal | None = None,
) -> RecentResponse:
    since = local_today() - dt.timedelta(days=days)
    pipeline = [
        {"$match": {"user_id": user.id, "date": {"$gte": dt.datetime.combine(since, dt.time())}}},
        {"$unwind": "$items"},
        {"$match": {"items.food_id": {"$ne": None}}},
        {"$sort": {"items.added_at": -1}},
        {"$group": {
            "_id": "$items.food_id",
            "times": {"$sum": 1},
            "last": {"$first": "$items.added_at"},
            "quantity": {"$first": "$items.quantity"},
            "portion_key": {"$first": "$items.portion_key"},
            "meal": {"$first": "$meal"},
            "meals": {"$push": "$meal"},
        }},
    ]
    rows = await (await FoodLog.get_pymongo_collection().aggregate(pipeline)).to_list()

    ids = [row["_id"] for row in rows]
    foods = {
        f.id: f
        for f in await FoodItem.find({"_id": {"$in": ids}}).to_list()
        if f.owner_id in (None, user.id)
    }
    entries: list[tuple[RecentFood, list[str]]] = []
    for row in rows:
        food = foods.get(row["_id"])
        if food is None:
            continue
        entries.append(
            (
                RecentFood(
                    food=FoodSummary.of(food),
                    times=row["times"],
                    last_logged=row["last"] or dt.datetime.now(dt.UTC),
                    last_quantity=row.get("quantity") or 1.0,
                    last_portion_key=row.get("portion_key"),
                    last_meal=row.get("meal") or "breakfast",
                ),
                row.get("meals", []),
            )
        )

    target_meal = meal or _meal_now()
    by_recent = sorted(entries, key=lambda e: e[0].last_logged, reverse=True)
    by_count = sorted(entries, key=lambda e: (e[0].times, e[0].last_logged), reverse=True)
    for_meal = sorted(
        (e for e in entries if target_meal in e[1]),
        key=lambda e: (e[1].count(target_meal), e[0].last_logged),
        reverse=True,
    )
    return RecentResponse(
        recent=[e[0] for e in by_recent[:15]],
        frequent=[e[0] for e in by_count[:15]],
        for_meal=[e[0] for e in for_meal[:10]],
        meal=target_meal,
    )


# ------------------------------------------------------------------ lookups


class ResolveRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@router.post("/resolve", response_model=FoodSummary, dependencies=[ai_quota(20, 60)])
async def resolve(user: CurrentUser, body: ResolveRequest) -> FoodSummary:
    """Walks the full chain, including network tiers. Caches what it finds."""
    food = await nutrition.resolve(body.name, user.id)
    if food is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Couldn't find nutrition data for '{body.name}'. Add it manually.",
        )
    return FoodSummary.of(food)


@router.get("/barcode/{barcode}", response_model=FoodSummary, dependencies=[ai_quota(30, 60)])
async def barcode(user: CurrentUser, barcode: str) -> FoodSummary:
    if not barcode.isdigit() or not 6 <= len(barcode) <= 14:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Not a valid barcode.")
    food = await nutrition.resolve_barcode(barcode, user.id)
    if food is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This product isn't in Open Food Facts yet. Add it from the label.",
        )
    return FoodSummary.of(food)


class PhotoResponse(BaseModel):
    meal: Meal
    items: list[drafts.DraftItem]


@router.post("/photo", response_model=PhotoResponse, dependencies=[ai_quota(10, 60)])
async def photo(
    user: CurrentUser,
    file: UploadFile = File(...),
    hint: str = Form(default="", max_length=200),
    meal: Meal | None = Form(default=None),
) -> PhotoResponse:
    """Snap-to-log: a photo of a plate becomes draft items for review.

    The image is sent for recognition and discarded; nothing is stored until
    she confirms the items.
    """
    mime = image_mime(file)
    image = await read_limited(file, MAX_PHOTO_BYTES, "That photo is too large.")
    parsed = await gemini.recognise_food_photo(image, mime, hint)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="I couldn't see any food in that photo. Try closer, in better light.",
        )
    items = await drafts.build(parsed, user.id)
    return PhotoResponse(meal=meal or _meal_now(), items=items)


# ------------------------------------------------------------------ detail


class FoodDetail(FoodSummary):
    variants: list[FoodSummary] = []
    recipe: list[RecipeIngredient] | None = None
    recipe_yield_g: float | None = None


@router.get("/{food_id}", response_model=FoodDetail)
async def detail(user: CurrentUser, food_id: PydanticObjectId) -> FoodDetail:
    food = await nutrition.get_visible(food_id, user.id)
    if food is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found.")
    variants = await nutrition.variants_of(food, user.id)
    summary = FoodSummary.of(food, variants_count=len(variants))
    return FoodDetail(
        **summary.model_dump(),
        variants=[FoodSummary.of(v) for v in variants],
        recipe=food.recipe,
        recipe_yield_g=food.recipe_yield_g,
    )


# ---------------------------------------------------------- personal foods


class PortionIn(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    grams: float = Field(gt=0, le=3000)


class CustomFoodRequest(BaseModel):
    """A food entered by hand, in the terms a label is actually written in.

    Packets state values per serving, not per 100 g, so the form accepts
    whichever basis the user is reading from and converts here. Asking someone
    to do that arithmetic themselves is how wrong numbers get saved.
    """

    name: str = Field(min_length=1, max_length=120)
    basis_grams: float = Field(default=100.0, gt=0, le=2000)

    kcal: float = Field(ge=0, le=5000)
    protein_g: float = Field(default=0.0, ge=0, le=1000)
    fat_g: float = Field(default=0.0, ge=0, le=1000)
    carbs_g: float = Field(default=0.0, ge=0, le=1000)
    fibre_g: float = Field(default=0.0, ge=0, le=1000)
    sugar_g: float = Field(default=0.0, ge=0, le=1000)

    iron_mg: float = Field(default=0.0, ge=0, le=1000)
    calcium_mg: float = Field(default=0.0, ge=0, le=10000)
    sodium_mg: float = Field(default=0.0, ge=0, le=50000)
    potassium_mg: float = Field(default=0.0, ge=0, le=50000)

    serving_label: str = Field(default="", max_length=40)
    serving_grams: float | None = Field(default=None, gt=0, le=2000)
    extra_portions: list[PortionIn] = Field(default_factory=list, max_length=6)
    is_veg: bool = True
    barcode: str | None = Field(default=None, pattern=r"^\d{6,14}$")


def _per_100g_from_basis(values: dict[str, float], basis_grams: float) -> Nutrients:
    factor = 100.0 / basis_grams
    per_100g = Nutrients(**{k: round(v * factor, 3) for k, v in values.items()})
    # Physically impossible per-100g values mean a typo, not a food.
    macro_mass = per_100g.protein_g + per_100g.fat_g + per_100g.carbs_g + per_100g.fibre_g
    if per_100g.kcal > 950 or macro_mass > 105:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Those numbers add up to more than the food weighs — check the serving size.",
        )
    return per_100g


@router.post("/custom", response_model=FoodSummary, status_code=status.HTTP_201_CREATED)
async def create_custom(user: CurrentUser, body: CustomFoodRequest) -> FoodSummary:
    """Saved as `personal`/`verified` — read off the packet, which is a better
    source than anything the chain would have guessed."""
    values = {
        key: getattr(body, key)
        for key in (
            "kcal", "protein_g", "fat_g", "carbs_g", "fibre_g", "sugar_g",
            "iron_mg", "calcium_mg", "sodium_mg", "potassium_mg",
        )
    }
    per_100g = _per_100g_from_basis(values, body.basis_grams)

    units: list[HouseholdUnit] = []
    serving_grams = body.serving_grams or (body.basis_grams if body.basis_grams != 100.0 else None)
    if serving_grams:
        units.append(HouseholdUnit(label=body.serving_label.strip() or "1 serving", grams=serving_grams))
    units.extend(HouseholdUnit(label=p.label.strip(), grams=p.grams) for p in body.extra_portions)
    units.append(HouseholdUnit(label="100 g", grams=100.0))

    name = body.name.strip()
    # Re-entering a food she already added should correct it, not create a
    # second row that competes with the first in search.
    existing = await FoodItem.find_one(
        FoodItem.owner_id == user.id, FoodItem.name_norm == normalise_name(name)
    )
    if existing is not None:
        existing.per_100g = per_100g
        existing.household_units = units
        existing.is_veg = body.is_veg
        existing.barcode = body.barcode or existing.barcode
        await existing.save()
        return FoodSummary.of(existing)

    food = FoodItem(
        name=name,
        per_100g=per_100g,
        household_units=units,
        source="personal",
        confidence="verified",
        is_veg=body.is_veg,
        barcode=body.barcode,
        owner_id=user.id,
    )
    await food.insert()
    return FoodSummary.of(food)


class RecipeRequest(BaseModel):
    """A dish built from its ingredients — the way to log home cooking exactly.

    Weigh (or estimate) what went into the pot, then the cooked total. Per-100 g
    values follow from that, cooking water and all.
    """

    name: str = Field(min_length=1, max_length=120)
    ingredients: list[RecipeIngredient] = Field(min_length=1, max_length=40)
    # Weight of the finished dish. If omitted, the raw total is used — right
    # for salads and smoothies, wrong for anything simmered or fried.
    cooked_weight_g: float | None = Field(default=None, gt=0, le=50_000)
    servings: float = Field(default=1.0, gt=0, le=100)
    serving_label: str = Field(default="1 serving", max_length=40)
    is_veg: bool | None = None


@router.post("/recipe", response_model=FoodSummary, status_code=status.HTTP_201_CREATED)
async def create_recipe(user: CurrentUser, body: RecipeRequest) -> FoodSummary:
    total = Nutrients()
    raw_weight = 0.0
    veg = True
    ingredients: list[RecipeIngredient] = []
    for part in body.ingredients:
        food = await nutrition.get_visible(part.food_id, user.id) if part.food_id else None
        if food is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Pick '{part.name}' from search so its nutrition is known.",
            )
        total = total + food.per_100g.scaled(part.grams)
        raw_weight += part.grams
        veg = veg and food.is_veg
        ingredients.append(RecipeIngredient(food_id=food.id, name=food.name, grams=part.grams))

    yield_g = body.cooked_weight_g or raw_weight
    per_100g = Nutrients(
        **{f: round(getattr(total, f) * 100.0 / yield_g, 3) for f in NUTRIENT_FIELDS}
    )
    units = [
        HouseholdUnit(label=body.serving_label.strip() or "1 serving", grams=round(yield_g / body.servings, 1)),
        HouseholdUnit(label="100 g", grams=100.0),
    ]
    name = body.name.strip()
    existing = await FoodItem.find_one(
        FoodItem.owner_id == user.id, FoodItem.name_norm == normalise_name(name)
    )
    food = existing or FoodItem(
        name=name, per_100g=per_100g, source="personal", confidence="verified", owner_id=user.id
    )
    food.per_100g = per_100g
    food.household_units = units
    food.recipe = ingredients
    food.recipe_yield_g = yield_g
    food.is_veg = veg if body.is_veg is None else body.is_veg
    food.category = "recipe"
    await food.save()
    return FoodSummary.of(food)


@router.delete("/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_personal(user: CurrentUser, food_id: PydanticObjectId) -> None:
    """Remove one of her own foods. Past logs keep their frozen numbers."""
    food = await FoodItem.get(food_id)
    if food is None or food.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found.")
    await food.delete()


class CorrectionRequest(BaseModel):
    per_100g: Nutrients
    portions: list[PortionIn] | None = Field(default=None, max_length=8)


@router.post("/{food_id}/correct", response_model=FoodSummary)
async def correct(
    user: CurrentUser, food_id: PydanticObjectId, body: CorrectionRequest
) -> FoodSummary:
    """A correction becomes a personal verified food that outranks the original
    for this user from now on — which is how accuracy compounds over time."""
    original = await nutrition.get_visible(food_id, user.id)
    if original is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found.")
    values = body.per_100g
    if any(getattr(values, f) < 0 for f in NUTRIENT_FIELDS) or values.kcal > 950:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Values must be per 100 g, non-negative, and at most 950 kcal.",
        )
    units = None
    if body.portions:
        units = [HouseholdUnit(label=p.label.strip(), grams=p.grams) for p in body.portions]
        units.append(HouseholdUnit(label="100 g", grams=100.0))
    corrected = await nutrition.save_correction(original, values, user.id, units)
    return FoodSummary.of(corrected)
