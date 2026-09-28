import datetime as dt

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser
from app.models.body import BodyComposition, BodyMap, MapKind, SegmentalLean, ZoneMark
from app.services import gemini

router = APIRouter(prefix="/body", tags=["body"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}


class ScanDraft(BaseModel):
    """Extracted but NOT saved.

    OCR on a printed report is good, not perfect, so nothing is trusted until
    she has seen the numbers and accepted them.
    """

    weight_kg: float | None = None
    body_fat_pct: float | None = None
    skeletal_muscle_kg: float | None = None
    visceral_fat_level: float | None = None
    bmr_kcal: float | None = None
    body_water_l: float | None = None
    segmental_lean: SegmentalLean | None = None
    found_any: bool


@router.post("/composition/scan", response_model=ScanDraft)
async def scan(user: CurrentUser, file: UploadFile = File(...)) -> ScanDraft:
    """Photo of an InBody-style printout → structured values for review.

    The image is read, sent for extraction and discarded. Only the numbers she
    confirms are ever stored.
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a photo of the report (JPEG, PNG or WebP).",
        )

    image = await file.read()
    if len(image) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="That image is too large. Try a smaller photo.",
        )

    result = await gemini.extract_body_scan(image, file.content_type)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Couldn't read that report. Try a straighter, brighter photo.",
        )

    segmental = SegmentalLean(
        left_arm_kg=result.left_arm_kg,
        right_arm_kg=result.right_arm_kg,
        trunk_kg=result.trunk_kg,
        left_leg_kg=result.left_leg_kg,
        right_leg_kg=result.right_leg_kg,
    )
    has_segmental = any(
        value is not None for value in segmental.model_dump().values()
    )

    found = any(
        value is not None
        for value in (
            result.weight_kg,
            result.body_fat_pct,
            result.skeletal_muscle_kg,
            result.visceral_fat_level,
            result.bmr_kcal,
            result.body_water_l,
        )
    ) or has_segmental

    return ScanDraft(
        weight_kg=result.weight_kg,
        body_fat_pct=result.body_fat_pct,
        skeletal_muscle_kg=result.skeletal_muscle_kg,
        visceral_fat_level=result.visceral_fat_level,
        bmr_kcal=result.bmr_kcal,
        body_water_l=result.body_water_l,
        segmental_lean=segmental if has_segmental else None,
        found_any=found,
    )


class SaveScanRequest(BaseModel):
    date: dt.date = Field(default_factory=dt.date.today)
    weight_kg: float | None = None
    body_fat_pct: float | None = Field(default=None, ge=1, le=75)
    skeletal_muscle_kg: float | None = None
    visceral_fat_level: float | None = None
    bmr_kcal: float | None = None
    body_water_l: float | None = None
    segmental_lean: SegmentalLean | None = None


@router.post("/composition", response_model=BodyComposition, status_code=status.HTTP_201_CREATED)
async def save_scan(user: CurrentUser, body: SaveScanRequest) -> BodyComposition:
    entry = BodyComposition(
        user_id=user.id,
        date=body.date,
        weight_kg=body.weight_kg,
        body_fat_pct=body.body_fat_pct,
        skeletal_muscle_kg=body.skeletal_muscle_kg,
        visceral_fat_level=body.visceral_fat_level,
        bmr_kcal=body.bmr_kcal,
        body_water_l=body.body_water_l,
        segmental_lean=body.segmental_lean,
        user_corrected=True,
    )
    await entry.insert()

    # A scan that reports weight is also a weigh-in; no reason to make her
    # enter the same number twice.
    if body.weight_kg:
        from app.models.logs import WeightLog

        existing = await WeightLog.find_one(
            WeightLog.user_id == user.id, WeightLog.date == body.date
        )
        if existing is None:
            await WeightLog(
                user_id=user.id,
                date=body.date,
                kg=body.weight_kg,
                note="From body composition scan",
            ).insert()

    return entry


@router.get("/composition", response_model=list[BodyComposition])
async def composition_history(user: CurrentUser, limit: int = 24) -> list[BodyComposition]:
    return (
        await BodyComposition.find(BodyComposition.user_id == user.id)
        .sort(-BodyComposition.date)
        .limit(limit)
        .to_list()
    )


class MapRequest(BaseModel):
    zones: list[ZoneMark] = Field(default_factory=list)


@router.get("/map/{kind}", response_model=BodyMap | None)
async def get_map(user: CurrentUser, kind: MapKind) -> BodyMap | None:
    return (
        await BodyMap.find(BodyMap.user_id == user.id, BodyMap.kind == kind)
        .sort(-BodyMap.date)
        .first_or_none()
    )


@router.put("/map/{kind}", response_model=BodyMap)
async def put_map(user: CurrentUser, kind: MapKind, body: MapRequest) -> BodyMap:
    """One map per kind per day, so editing today's marks updates rather than
    piling up rows — but yesterday's stays, which is what makes it a history."""
    today = dt.date.today()
    entry = await BodyMap.find_one(
        BodyMap.user_id == user.id, BodyMap.kind == kind, BodyMap.date == today
    )
    if entry is None:
        entry = BodyMap(user_id=user.id, kind=kind, date=today, zones=body.zones)
        await entry.insert()
    else:
        entry.zones = body.zones
        await entry.save()
    return entry
