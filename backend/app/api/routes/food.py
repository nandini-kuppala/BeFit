from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser
from app.models.food import FoodItem
from app.models.nutrients import HouseholdUnit, Nutrients
from app.services import matching, nutrition

router = APIRouter(prefix="/food", tags=["food"])


class FoodSummary(BaseModel):
    id: str
    name: str
    category: str | None
    source: str
    confidence: str
    is_veg: bool
    per_100g: Nutrients
    household_units: list[HouseholdUnit]
    default_grams: float
    # How well this answers the query, 0-1. Lets the UI tell a real hit from a
    # near miss instead of presenting both as equally correct.
    match_score: float = 1.0

    @classmethod
    def of(cls, food: FoodItem, match_score: float = 1.0) -> "FoodSummary":
        return cls(
            id=str(food.id),
            name=food.name,
            category=food.category,
            source=food.source,
            confidence=food.confidence,
            is_veg=food.is_veg,
            per_100g=food.per_100g,
            household_units=food.household_units
            or [HouseholdUnit(label="100 g", grams=100.0)],
            default_grams=food.default_grams(),
            match_score=round(match_score, 3),
        )


class SearchResponse(BaseModel):
    results: list[FoodSummary]
    # True when something matched closely enough to log without a second
    # thought. When false the UI should offer lookup or manual entry rather
    # than presenting near misses as answers.
    has_exact_match: bool
    query: str


@router.get("/search", response_model=SearchResponse)
async def search(
    user: CurrentUser,
    q: str = Query(min_length=1, max_length=80),
    limit: int = Query(default=12, le=40),
) -> SearchResponse:
    """Local tiers only — instant, offline-capable, no API cost."""
    scored = await nutrition.search_scored(q, user.id, limit)
    return SearchResponse(
        results=[FoodSummary.of(food, value) for food, value in scored],
        has_exact_match=bool(scored and scored[0][1] >= matching.CONFIDENT),
        query=q,
    )


class ResolveRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@router.post("/resolve", response_model=FoodSummary)
async def resolve(user: CurrentUser, body: ResolveRequest) -> FoodSummary:
    """Walks the full chain, including network tiers. Caches what it finds."""
    food = await nutrition.resolve(body.name, user.id)
    if food is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Couldn't find nutrition data for '{body.name}'. Add it manually.",
        )
    return FoodSummary.of(food)


@router.get("/barcode/{barcode}", response_model=FoodSummary)
async def barcode(user: CurrentUser, barcode: str) -> FoodSummary:
    food = await nutrition.resolve_barcode(barcode, user.id)
    if food is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This product isn't in Open Food Facts yet.",
        )
    return FoodSummary.of(food)


class CustomFoodRequest(BaseModel):
    """A food entered by hand, in the terms a label is actually written in.

    Packets state values per serving, not per 100 g, so the form accepts
    whichever basis the user is reading from and converts here. Asking someone
    to do that arithmetic themselves is how wrong numbers get saved.
    """

    name: str = Field(min_length=1, max_length=120)
    # What the figures below describe: 100 for a per-100g label, or the serving
    # weight when copying from a packet.
    basis_grams: float = Field(default=100.0, gt=0, le=2000)

    kcal: float = Field(ge=0, le=900)
    protein_g: float = Field(default=0.0, ge=0, le=100)
    fat_g: float = Field(default=0.0, ge=0, le=100)
    carbs_g: float = Field(default=0.0, ge=0, le=100)
    fibre_g: float = Field(default=0.0, ge=0, le=100)
    sugar_g: float = Field(default=0.0, ge=0, le=100)

    iron_mg: float = Field(default=0.0, ge=0)
    calcium_mg: float = Field(default=0.0, ge=0)
    sodium_mg: float = Field(default=0.0, ge=0)
    potassium_mg: float = Field(default=0.0, ge=0)

    serving_label: str = Field(default="", max_length=40)
    serving_grams: float | None = Field(default=None, gt=0, le=2000)
    is_veg: bool = True


@router.post("/custom", response_model=FoodSummary, status_code=status.HTTP_201_CREATED)
async def create_custom(user: CurrentUser, body: CustomFoodRequest) -> FoodSummary:
    """Saved as `personal`/`verified` — she read it off the packet, which is a
    better source than anything the chain would have guessed."""
    factor = 100.0 / body.basis_grams
    per_100g = Nutrients(
        kcal=round(body.kcal * factor, 2),
        protein_g=round(body.protein_g * factor, 2),
        fat_g=round(body.fat_g * factor, 2),
        carbs_g=round(body.carbs_g * factor, 2),
        fibre_g=round(body.fibre_g * factor, 2),
        sugar_g=round(body.sugar_g * factor, 2),
        iron_mg=round(body.iron_mg * factor, 3),
        calcium_mg=round(body.calcium_mg * factor, 2),
        sodium_mg=round(body.sodium_mg * factor, 2),
        potassium_mg=round(body.potassium_mg * factor, 2),
    )

    units: list[HouseholdUnit] = []
    serving_grams = body.serving_grams or (
        body.basis_grams if body.basis_grams != 100.0 else None
    )
    if serving_grams:
        units.append(
            HouseholdUnit(
                label=body.serving_label.strip() or "1 serving", grams=serving_grams
            )
        )
    units.append(HouseholdUnit(label="100 g", grams=100.0))

    name = body.name.strip()
    # Re-entering a food she already added should correct it, not create a
    # second row that competes with the first in search.
    existing = await FoodItem.find_one(
        FoodItem.owner_id == user.id, FoodItem.name == name
    )
    if existing is not None:
        existing.per_100g = per_100g
        existing.household_units = units
        existing.is_veg = body.is_veg
        await existing.save()
        return FoodSummary.of(existing)

    food = FoodItem(
        name=name,
        per_100g=per_100g,
        household_units=units,
        source="personal",
        confidence="verified",
        is_veg=body.is_veg,
        owner_id=user.id,
    )
    await food.insert()
    return FoodSummary.of(food)


class CorrectionRequest(BaseModel):
    per_100g: Nutrients


@router.post("/{food_id}/correct", response_model=FoodSummary)
async def correct(
    user: CurrentUser, food_id: PydanticObjectId, body: CorrectionRequest
) -> FoodSummary:
    """A correction becomes a personal verified food that outranks the original
    for this user from now on — which is how accuracy compounds over time."""
    original = await FoodItem.get(food_id)
    if original is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found.")
    corrected = await nutrition.save_correction(original, body.per_100g, user.id)
    return FoodSummary.of(corrected)
