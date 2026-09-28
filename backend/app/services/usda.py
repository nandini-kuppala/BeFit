"""USDA FoodData Central — tier 4 of the nutrition chain.

Free tier is 1,000 requests/hour. Foundation and SR Legacy entries carry full
micronutrient panels; Branded entries only carry label nutrients, so those
data types are requested in preference order.
"""

import logging

import httpx

from app.core.config import get_settings
from app.models.nutrients import Nutrients

log = logging.getLogger(__name__)

SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

# USDA nutrientNumber → our field. These numbers are stable across API
# versions, unlike the internal nutrient ids.
NUTRIENT_MAP: dict[str, str] = {
    "208": "kcal",
    "203": "protein_g",
    "204": "fat_g",
    "205": "carbs_g",
    "291": "fibre_g",
    "269": "sugar_g",
    "303": "iron_mg",
    "301": "calcium_mg",
    "309": "zinc_mg",
    "304": "magnesium_mg",
    "317": "selenium_ug",
    "314": "iodine_ug",
    "307": "sodium_mg",
    "306": "potassium_mg",
    "320": "vit_a_ug",
    "401": "vit_c_mg",
    "323": "vit_e_mg",
    "418": "vit_b12_ug",
    "417": "folate_ug",
}

# Reported in µg; the app stores IU.
VITAMIN_D_NUMBER = "328"
VITAMIN_D_IU_PER_UG = 40.0

# ALA, EPA, DPA, DHA — summed into one omega-3 figure, reported in grams.
OMEGA3_NUMBERS = {"851", "629", "631", "621"}


def _to_nutrients(food: dict) -> Nutrients:
    values: dict[str, float] = {}
    omega3_g = 0.0

    for nutrient in food.get("foodNutrients", []):
        number = str(nutrient.get("nutrientNumber", ""))
        amount = nutrient.get("value")
        if amount is None:
            continue
        if number in NUTRIENT_MAP:
            values[NUTRIENT_MAP[number]] = float(amount)
        elif number == VITAMIN_D_NUMBER:
            values["vit_d_iu"] = float(amount) * VITAMIN_D_IU_PER_UG
        elif number in OMEGA3_NUMBERS:
            omega3_g += float(amount)

    if omega3_g:
        values["omega3_mg"] = omega3_g * 1000.0
    return Nutrients(**values)


async def search(query: str, limit: int = 5) -> list[dict]:
    """Return candidate foods with per-100g nutrients, best match first."""
    settings = get_settings()
    params = {
        "query": query,
        "api_key": settings.usda_fdc_api_key,
        "pageSize": limit,
        "dataType": "Foundation,SR Legacy,Survey (FNDDS)",
    }
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(SEARCH_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("USDA lookup failed for %r: %s", query, exc)
        return []

    results = []
    for food in payload.get("foods", []):
        results.append(
            {
                "name": food.get("description", query).title(),
                "nutrients": _to_nutrients(food),
                "fdc_id": food.get("fdcId"),
            }
        )
    return results
