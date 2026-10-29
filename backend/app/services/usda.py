"""USDA FoodData Central — tier 4 of the nutrition chain.

Free tier is 1,000 requests/hour. Foundation and SR Legacy entries carry full
micronutrient panels; Branded entries only carry label nutrients, so those
data types are requested in preference order.
"""

import logging

import httpx

from app.core import http
from app.core.config import get_settings
from app.models.nutrients import HouseholdUnit, Nutrients

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
    body = {
        "query": query,
        "pageSize": limit,
        # POST, not GET: as a GET parameter "Survey (FNDDS)" is rejected with a
        # bare nginx 400, which silently disabled this whole tier — every
        # unknown food skipped USDA and fell through to web search or a guess.
        # FNDDS is also where USDA's household measures (cup, piece) live.
        "dataType": ["Survey (FNDDS)", "Foundation", "SR Legacy"],
    }
    try:
        # Key in a header, not the query string: httpx error messages include
        # the full URL, which put the API key into the logs on every failure.
        response = await http.client().post(
            SEARCH_URL,
            json=body,
            headers={"X-Api-Key": settings.usda_fdc_api_key},
            timeout=10.0,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("USDA lookup failed for %r: %s", query, type(exc).__name__)
        return []

    results = []
    for food in payload.get("foods", []):
        results.append(
            {
                "name": food.get("description", query).title(),
                "nutrients": _to_nutrients(food),
                "fdc_id": food.get("fdcId"),
                "portions": _portions(food),
            }
        )
    return results


def _portions(food: dict) -> list[HouseholdUnit]:
    """USDA's own household measures ("1 cup", "1 medium") with gram weights.

    FNDDS entries carry these in search results as foodMeasures; they are the
    best portion data any open source has for generic foods.
    """
    units: list[HouseholdUnit] = []
    for measure in food.get("foodMeasures") or []:
        label = (measure.get("disseminationText") or "").replace(", NFS", "").strip()
        grams = measure.get("gramWeight")
        if not label or not grams or label.lower().startswith(("quantity not specified", "guideline")):
            continue
        if not 0 < float(grams) <= 3000:
            continue
        units.append(HouseholdUnit(label=label[:40], grams=float(grams)))
        if len(units) >= 6:
            break
    if units:
        units.append(HouseholdUnit(label="100 g", grams=100.0))
    return units
