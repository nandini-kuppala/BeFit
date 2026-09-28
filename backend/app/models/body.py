from datetime import date
from typing import Literal

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class SegmentalLean(BaseModel):
    left_arm_kg: float | None = None
    right_arm_kg: float | None = None
    trunk_kg: float | None = None
    left_leg_kg: float | None = None
    right_leg_kg: float | None = None


class BodyComposition(Document):
    """An InBody-style scan, extracted by OCR then confirmed by the user.

    `user_corrected` matters: OCR on a printed report is good but not perfect,
    so nothing is trusted until she has seen and accepted it.
    """

    user_id: PydanticObjectId
    date: date
    weight_kg: float | None = None
    body_fat_pct: float | None = None
    skeletal_muscle_kg: float | None = None
    visceral_fat_level: float | None = None
    bmr_kcal: float | None = None
    body_water_l: float | None = None
    segmental_lean: SegmentalLean | None = None

    image_path: str | None = None
    ocr_raw: str | None = None
    user_corrected: bool = False

    class Settings:
        name = "body_composition"
        indexes = [
            pymongo.IndexModel(
                [("user_id", pymongo.ASCENDING), ("date", pymongo.DESCENDING)]
            ),
        ]


# Zones on the front/back body diagram the user can tap.
BodyZone = Literal[
    "upper_arms",
    "forearms",
    "chest",
    "upper_back",
    "abdomen",
    "lower_belly",
    "waist",
    "hips",
    "saddle_bags",
    "glutes",
    "outer_thighs",
    "inner_thighs",
    "front_thighs",
    "hamstrings",
    "calves",
]

MapKind = Literal["fat", "focus"]


class ZoneMark(BaseModel):
    zone: BodyZone
    # 1 mild → 3 most. On a focus map this is priority instead of severity.
    intensity: int = Field(ge=1, le=3, default=2)


class BodyMap(Document):
    user_id: PydanticObjectId
    kind: MapKind
    date: date
    zones: list[ZoneMark] = Field(default_factory=list)

    class Settings:
        name = "body_maps"
        indexes = [
            pymongo.IndexModel(
                [
                    ("user_id", pymongo.ASCENDING),
                    ("kind", pymongo.ASCENDING),
                    ("date", pymongo.DESCENDING),
                ]
            ),
        ]
