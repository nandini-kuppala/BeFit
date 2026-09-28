from datetime import date

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import ActiveTargets, CurrentProfile, CurrentUser
from app.data.default_plan import DEFAULT_WEEK
from app.models.logs import WeightLog
from app.models.profile import (
    DietaryRules,
    HealthCondition,
    Medication,
    Profile,
    Routine,
    Sex,
)
from app.models.targets import Targets
from app.models.workout import PlanDay, PlannedExercise, WorkoutPlan
from app.services.targets import build_targets

router = APIRouter(prefix="/me", tags=["profile"])

# Hypothyroidism on adequate replacement measures ~4% below predicted REE.
# Small, but real, and it compounds over months of tracking.
THYROID_ADJUSTMENT = 0.96


class OnboardingRequest(BaseModel):
    name: str
    sex: Sex = "female"
    age: int = Field(ge=13, le=100)
    height_cm: float = Field(gt=80, lt=250)
    weight_kg: float = Field(gt=25, lt=300)
    goal_weight_kg: float = Field(gt=25, lt=300)
    activity_factor: float = Field(default=1.55, ge=1.2, le=1.9)
    health_conditions: list[HealthCondition] = Field(default_factory=list)
    medications: list[Medication] = Field(default_factory=list)
    dietary_rules: DietaryRules = Field(default_factory=DietaryRules)
    routine: Routine = Field(default_factory=Routine)


class ProfileResponse(BaseModel):
    profile: Profile
    targets: Targets


async def _seed_workout_plan(user_id) -> None:
    if await WorkoutPlan.find_one(WorkoutPlan.user_id == user_id):
        return
    days = [
        PlanDay(
            weekday=day["weekday"],
            focus=day["focus"],
            summary=day["summary"],
            is_rest=day.get("is_rest", False),
            is_veg=day.get("is_veg", False),
            exercises=[PlannedExercise(**e) for e in day["exercises"]],
            video_url=day["video_url"],
            video_title=day["video_title"],
            video_channel=day["video_channel"],
        )
        for day in DEFAULT_WEEK
    ]
    await WorkoutPlan(user_id=user_id, days=days).insert()


@router.post(
    "/onboard", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED
)
async def onboard(user: CurrentUser, body: OnboardingRequest) -> ProfileResponse:
    if await Profile.find_one(Profile.user_id == user.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Profile already exists."
        )

    thyroid = any("thyroid" in c.name.lower() for c in body.health_conditions)

    profile = Profile(
        user_id=user.id,
        name=body.name,
        sex=body.sex,
        age=body.age,
        height_cm=body.height_cm,
        start_weight_kg=body.weight_kg,
        goal_weight_kg=body.goal_weight_kg,
        activity_factor=body.activity_factor,
        metabolic_adjustment=THYROID_ADJUSTMENT if thyroid else 1.0,
        health_conditions=body.health_conditions,
        medications=body.medications,
        dietary_rules=body.dietary_rules,
        routine=body.routine,
    )
    await profile.insert()

    targets = build_targets(profile, body.weight_kg)
    await targets.insert()

    await WeightLog(
        user_id=user.id, date=date.today(), kg=body.weight_kg, note="Starting weight"
    ).insert()
    await _seed_workout_plan(user.id)

    return ProfileResponse(profile=profile, targets=targets)


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(profile: CurrentProfile, targets: ActiveTargets) -> ProfileResponse:
    return ProfileResponse(profile=profile, targets=targets)


class ProfileUpdate(BaseModel):
    name: str | None = None
    age: int | None = Field(default=None, ge=13, le=100)
    height_cm: float | None = None
    goal_weight_kg: float | None = None
    activity_factor: float | None = Field(default=None, ge=1.2, le=1.9)
    health_conditions: list[HealthCondition] | None = None
    medications: list[Medication] | None = None
    dietary_rules: DietaryRules | None = None
    routine: Routine | None = None


@router.patch("/profile", response_model=ProfileResponse)
async def update_profile(
    user: CurrentUser, profile: CurrentProfile, body: ProfileUpdate
) -> ProfileResponse:
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in changes.items():
        setattr(profile, field, value)

    if "health_conditions" in changes:
        thyroid = any("thyroid" in c.name.lower() for c in profile.health_conditions)
        profile.metabolic_adjustment = THYROID_ADJUSTMENT if thyroid else 1.0

    await profile.save()
    targets = await _recalculate(user.id, profile)
    return ProfileResponse(profile=profile, targets=targets)


async def _recalculate(user_id, profile: Profile) -> Targets:
    """Recompute against the latest logged weight, and version the result."""
    latest = (
        await WeightLog.find(WeightLog.user_id == user_id)
        .sort(-WeightLog.date)
        .first_or_none()
    )
    weight = latest.kg if latest else profile.start_weight_kg
    fresh = build_targets(profile, weight)

    today = (
        await Targets.find(Targets.user_id == user_id)
        .sort(-Targets.effective_from)
        .first_or_none()
    )
    # Replace rather than version if today's target was already recalculated,
    # so a burst of profile edits doesn't create a row per keystroke.
    if today is not None and today.effective_from == date.today():
        fresh.id = today.id
        await fresh.replace()
    else:
        await fresh.insert()
    return fresh


@router.post("/targets/recalculate", response_model=Targets)
async def recalculate(user: CurrentUser, profile: CurrentProfile) -> Targets:
    return await _recalculate(user.id, profile)
