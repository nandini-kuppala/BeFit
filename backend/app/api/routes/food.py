from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser
from app.models.food import FoodItem
from app.models.nutrients import HouseholdUnit, Nutrients
from app.services import nutrition

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

    @classmethod
    def of(cls, food: FoodItem) -> "FoodSummary":
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
        )


@router.get("/search", response_model=list[FoodSummary])
async def search(
    user: CurrentUser,
    q: str = Query(min_length=1, max_length=80),
    limit: int = Query(default=12, le=40),
) -> list[FoodSummary]:
    """Local tiers only — instant, offline-capable, no API cost."""
    results = await nutrition.search_local(q, user.id, limit)
    return [FoodSummary.of(food) for food in results]


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
    name: str = Field(min_length=1, max_length=120)
    per_100g: Nutrients
    household_units: list[HouseholdUnit] = Field(default_factory=list)
    is_veg: bool = True


@router.post("/custom", response_model=FoodSummary, status_code=status.HTTP_201_CREATED)
async def create_custom(user: CurrentUser, body: CustomFoodRequest) -> FoodSummary:
    food = FoodItem(
        name=body.name,
        per_100g=body.per_100g,
        household_units=body.household_units
        or [HouseholdUnit(label="100 g", grams=100.0)],
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
