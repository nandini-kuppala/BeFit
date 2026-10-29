"""Open Food Facts — barcode lookup for packaged products.

No API key. Crowdsourced, so macros are usually present but micronutrients are
often missing; whatever is absent stays 0.0 rather than being guessed.
"""

import logging
import re

import httpx

from app.core import http
from app.core.config import get_settings
from app.models.nutrients import Nutrients

log = logging.getLogger(__name__)

PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"

# Open Food Facts key (per 100 g) → our field, with a multiplier where units
# differ. OFF reports most vitamins in grams.
FIELD_MAP: dict[str, tuple[str, float]] = {
    "energy-kcal_100g": ("kcal", 1.0),
    "proteins_100g": ("protein_g", 1.0),
    "fat_100g": ("fat_g", 1.0),
    "carbohydrates_100g": ("carbs_g", 1.0),
    "fiber_100g": ("fibre_g", 1.0),
    "sugars_100g": ("sugar_g", 1.0),
    "iron_100g": ("iron_mg", 1000.0),
    "calcium_100g": ("calcium_mg", 1000.0),
    "zinc_100g": ("zinc_mg", 1000.0),
    "magnesium_100g": ("magnesium_mg", 1000.0),
    "selenium_100g": ("selenium_ug", 1_000_000.0),
    "iodine_100g": ("iodine_ug", 1_000_000.0),
    "sodium_100g": ("sodium_mg", 1000.0),
    "potassium_100g": ("potassium_mg", 1000.0),
    "vitamin-a_100g": ("vit_a_ug", 1_000_000.0),
    "vitamin-c_100g": ("vit_c_mg", 1000.0),
    "vitamin-e_100g": ("vit_e_mg", 1000.0),
    "vitamin-b12_100g": ("vit_b12_ug", 1_000_000.0),
    "folates_100g": ("folate_ug", 1_000_000.0),
}


BARCODE = re.compile(r"^\d{6,14}$")


async def lookup_barcode(barcode: str) -> dict | None:
    if not BARCODE.match(barcode):
        return None
    settings = get_settings()
    headers = {"User-Agent": settings.openfoodfacts_user_agent}
    try:
        response = await http.client().get(
            PRODUCT_URL.format(barcode=barcode), headers=headers, timeout=10.0
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("Open Food Facts lookup failed for %s: %s", barcode, exc)
        return None

    if payload.get("status") != 1:
        return None

    product = payload.get("product", {})
    raw = product.get("nutriments", {})

    values: dict[str, float] = {}
    for key, (field, multiplier) in FIELD_MAP.items():
        amount = raw.get(key)
        if isinstance(amount, (int, float)):
            values[field] = float(amount) * multiplier

    name = product.get("product_name") or product.get("generic_name")
    if not name:
        return None

    serving = product.get("serving_quantity")
    try:
        serving_grams = float(serving) if serving else None
    except (TypeError, ValueError):
        serving_grams = None
    if serving_grams is not None and not 0 < serving_grams <= 3000:
        serving_grams = None
    serving_text = (product.get("serving_size") or "").strip()
    return {
        "name": name.strip()[:100],
        "nutrients": Nutrients(**values),
        "barcode": barcode,
        "serving_grams": serving_grams,
        "serving_label": f"1 serving ({serving_text})"[:40] if serving_text else None,
        "brand": product.get("brands"),
    }
