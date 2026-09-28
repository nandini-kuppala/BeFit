"""Gemini — natural-language food parsing, nutrition estimation, body-scan OCR
and coach chat.

Two models are used deliberately: a cheap fast one for the high-frequency
parsing and estimation calls, and the better one only for coach chat. Free-tier
request ceilings are unpublished and low, so every estimate this module
produces is cached back into MongoDB by the caller.
"""

import logging
from functools import lru_cache

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.models.nutrients import Nutrients

log = logging.getLogger(__name__)


@lru_cache
def _client() -> genai.Client:
    return genai.Client(api_key=get_settings().gemini_api_key)


# ---------------------------------------------------------------- schemas


class ParsedFood(BaseModel):
    food: str = Field(description="The food name alone, no quantity words")
    quantity: float = Field(default=1.0, description="How many units")
    unit: str = Field(
        default="serving",
        description="piece, katori, cup, plate, glass, scoop, g, ml, serving",
    )
    meal: str | None = Field(
        default=None,
        description="breakfast, mid_morning, lunch, snack or dinner if stated",
    )


class ParsedFoodList(BaseModel):
    items: list[ParsedFood]


class EstimatedFood(BaseModel):
    name: str
    is_veg: bool
    typical_portion_label: str = Field(description="e.g. '1 katori', '1 dosa'")
    typical_portion_grams: float
    kcal: float
    protein_g: float
    fat_g: float
    carbs_g: float
    fibre_g: float
    iron_mg: float = 0.0
    calcium_mg: float = 0.0
    zinc_mg: float = 0.0
    magnesium_mg: float = 0.0
    sodium_mg: float = 0.0
    potassium_mg: float = 0.0
    vit_c_mg: float = 0.0
    folate_ug: float = 0.0


class BodyScan(BaseModel):
    weight_kg: float | None = None
    body_fat_pct: float | None = None
    skeletal_muscle_kg: float | None = None
    visceral_fat_level: float | None = None
    bmr_kcal: float | None = None
    body_water_l: float | None = None
    left_arm_kg: float | None = None
    right_arm_kg: float | None = None
    trunk_kg: float | None = None
    left_leg_kg: float | None = None
    right_leg_kg: float | None = None


# ---------------------------------------------------------------- calls


async def _generate(model: str, contents, schema=None, system: str | None = None):
    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=0.1 if schema else 0.7,
    )
    if schema is not None:
        config.response_mime_type = "application/json"
        config.response_schema = schema
    return await _client().aio.models.generate_content(
        model=model, contents=contents, config=config
    )


PARSE_SYSTEM = """You convert spoken meal descriptions into structured food items.
The speaker is Indian and will use Indian food names and household measures
(katori, plate, piece, glass, scoop). Split compound descriptions into separate
items. Resolve spoken numbers to digits: "two idlis" is quantity 2.
If no quantity is stated, use 1. Never invent foods that were not mentioned."""


async def parse_food_text(text: str) -> list[ParsedFood]:
    settings = get_settings()
    try:
        response = await _generate(
            settings.gemini_utility_model,
            f"Transcript: {text}",
            schema=ParsedFoodList,
            system=PARSE_SYSTEM,
        )
        parsed: ParsedFoodList = response.parsed
        return parsed.items if parsed else []
    except Exception as exc:
        log.warning("Gemini food parse failed for %r: %s", text, exc)
        return []


ESTIMATE_SYSTEM = """You are a nutrition database. Give per-100g values for the
food named, as it is normally eaten (cooked, if it is normally cooked).
Prefer Indian composition data (IFCT/INDB) for Indian foods. Be accurate rather
than round: these numbers are used for real calorie tracking. If you are unsure
of a micronutrient, return 0.0 rather than guessing."""


async def estimate_nutrition(food_name: str) -> tuple[Nutrients, EstimatedFood] | None:
    """Last resort in the chain. Callers must mark the result as estimated."""
    settings = get_settings()
    try:
        response = await _generate(
            settings.gemini_utility_model,
            f"Food: {food_name}. Give per-100g nutrition.",
            schema=EstimatedFood,
            system=ESTIMATE_SYSTEM,
        )
        result: EstimatedFood = response.parsed
        if result is None:
            return None
    except Exception as exc:
        log.warning("Gemini nutrition estimate failed for %r: %s", food_name, exc)
        return None

    nutrients = Nutrients(
        kcal=result.kcal,
        protein_g=result.protein_g,
        fat_g=result.fat_g,
        carbs_g=result.carbs_g,
        fibre_g=result.fibre_g,
        iron_mg=result.iron_mg,
        calcium_mg=result.calcium_mg,
        zinc_mg=result.zinc_mg,
        magnesium_mg=result.magnesium_mg,
        sodium_mg=result.sodium_mg,
        potassium_mg=result.potassium_mg,
        vit_c_mg=result.vit_c_mg,
        folate_ug=result.folate_ug,
    )
    return nutrients, result


OCR_SYSTEM = """You read body composition report printouts (InBody, Tanita and
similar). Extract only values actually printed on the page. Return null for
anything not present — never infer or calculate a missing value."""


async def extract_body_scan(image_bytes: bytes, mime_type: str) -> BodyScan | None:
    settings = get_settings()
    try:
        response = await _generate(
            settings.gemini_utility_model,
            [
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                types.Part.from_text(
                    text="Extract the body composition values from this report."
                ),
            ],
            schema=BodyScan,
            system=OCR_SYSTEM,
        )
        return response.parsed
    except Exception as exc:
        log.warning("Gemini body scan OCR failed: %s", exc)
        return None


async def chat(system_prompt: str, history: list[dict], message: str) -> str:
    settings = get_settings()
    contents = [
        types.Content(
            role="model" if turn["role"] == "assistant" else "user",
            parts=[types.Part.from_text(text=turn["content"])],
        )
        for turn in history[-12:]
    ]
    contents.append(
        types.Content(role="user", parts=[types.Part.from_text(text=message)])
    )
    try:
        response = await _generate(
            settings.gemini_chat_model, contents, system=system_prompt
        )
        return (response.text or "").strip()
    except Exception as exc:
        log.warning("Gemini chat failed: %s", exc)
        return (
            "I couldn't reach the coach service just now. "
            "Your data is safe — try again in a moment."
        )
