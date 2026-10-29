"""Loads the shared food database into MongoDB.

Three layers, in trust order:

  1. app/data/indian_foods.py — curated Indian dishes as eaten (INDB / IFCT /
     USDA, with cooking-yield corrections). What she actually eats.
  2. Variants computed from (1) by plain arithmetic — "Chapati with ghee" is a
     chapati plus a teaspoon of ghee, nothing guessed.
  3. app/data/ifct2017.json — the 542 raw foods of IFCT 2017, with their names
     in Indian languages as search aliases ("sajje", "kambu" -> bajra).

Runs at startup but costs one read when nothing changed: the content hash of
all three is stored, and the full upsert only runs when the data does. The old
loader re-read every food on every boot and only ever refreshed aliases, so a
corrected nutrient value in the seed file never reached the database.
"""

import hashlib
import json
import logging
from pathlib import Path

from pymongo import UpdateOne

from app.models.food import CONFIDENCE_BY_SOURCE, FoodItem, normalise_name

log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SEED_VERSION = 3  # bump to force a reload after changing the loader itself

# Variation groups. Each member is its own food (own numbers); the family lets
# the app offer "Chapati / Chapati with ghee / Paratha / Poori" side by side.
FAMILIES: dict[str, list[str]] = {
    "idli": ["Idli", "Rava idli"],
    "dosa": ["Plain dosa", "Ghee dosa", "Masala dosa", "Pesarattu", "Uttapam"],
    "upma": ["Rava upma", "Vegetable upma"],
    "rice": [
        "Cooked white rice", "Cooked brown rice", "Plain pulao", "Vegetable pulao",
        "Vegetable fried rice", "Curd rice", "Ghee rice",
    ],
    "biryani": ["Vegetable biryani", "Mutton biryani"],
    "khichdi": ["Khichdi", "Vegetable khichdi", "Ven pongal"],
    "roti": ["Chapati", "Chapati with ghee", "Paratha", "Parota", "Poori"],
    "dal": [
        "Dal (plain cooked)", "Dal with ghee tadka", "Moong dal (cooked)",
        "Chana dal (cooked)", "Masoor dal (cooked)", "Dal makhani", "Sambar", "Rasam",
    ],
    "chana": ["Chana masala", "Boiled chana", "Roasted chana", "Rajma curry"],
    "egg": ["Boiled egg", "Egg omelette", "Egg curry", "Egg bhurji"],
    "milk": ["Milk (cow, whole)", "Milk (buffalo, whole)"],
    "chicken": [
        "Roasted chicken breast", "Chicken thigh (cooked)", "Chicken curry",
        "Tandoori chicken", "Chicken 65",
    ],
    "fish": ["Baked fish", "Fish curry", "Canned tuna (in water)", "Prawns (cooked)"],
    "mutton": ["Mutton (goat, cooked)", "Mutton korma"],
    "oats": ["Rolled oats (dry)", "Soaked oats", "Oats porridge with milk"],
    "soya": ["Soya chunks (dry)", "Soya chunks (cooked)", "Soyabean curry"],
    "poriyal": ["Beans poriyal", "Cabbage poriyal", "Carrot poriyal", "Bhindi fry", "Aloo sabzi"],
    "tea_coffee": ["Tea with milk", "Coffee with milk"],
    "cooking_fat": ["Ghee", "Coconut oil", "Groundnut oil", "Sunflower oil"],
    "curd_drinks": ["Curd", "Sweet lassi", "Buttermilk"],
    "potato": ["Boiled potato", "Boiled sweet potato"],
    "breakfast_cereal": ["Poha", "Besan chilla"],
}

# name -> (base food, base grams, [(added food, grams)], unit label, aliases)
# Values are computed from the seed's own numbers, so they are exactly as good
# as their ingredients. A teaspoon of ghee is 5 g.
COMPUTED_VARIANTS: list[tuple[str, str, float, list[tuple[str, float]], str, list[str]]] = [
    ("Chapati with ghee", "Chapati", 35.0, [("Ghee", 5.0)], "1 chapati",
     ["roti with ghee", "ghee roti", "phulka with ghee", "chapati ghee"]),
    ("Ghee dosa", "Plain dosa", 60.0, [("Ghee", 5.0)], "1 dosa",
     ["ghee roast", "ghee roast dosa", "neyyi dosa"]),
    ("Dal with ghee tadka", "Dal (plain cooked)", 150.0, [("Ghee", 5.0)], "1 katori",
     ["dal tadka", "tadka dal", "dal fry"]),
    ("Ghee rice", "Cooked white rice", 150.0, [("Ghee", 5.0)], "1 katori",
     ["neychoru", "rice with ghee"]),
    ("Oats porridge with milk", "Rolled oats (dry)", 40.0, [("Milk (cow, whole)", 200.0)], "1 bowl",
     ["oats with milk", "milk oats", "oatmeal with milk"]),
]


def _load_curated() -> list[dict]:
    try:
        from app.data.indian_foods import SEED_FOODS
    except ImportError:
        log.warning("No curated seed data found.")
        return []
    return [dict(entry) for entry in SEED_FOODS]


def _load_ifct() -> list[dict]:
    path = DATA_DIR / "ifct2017.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))["foods"]


def _computed(curated: list[dict]) -> list[dict]:
    by_name = {entry["name"]: entry for entry in curated}
    out = []
    for name, base, base_g, extras, unit, aliases in COMPUTED_VARIANTS:
        parts = [(base, base_g), *extras]
        if any(part not in by_name for part, _ in parts):
            log.warning("skipping computed variant %s: missing ingredient", name)
            continue
        total = sum(g for _, g in parts)
        keys = set().union(*(by_name[p]["per_100g"].keys() for p, _ in parts))
        per_100g = {
            key: round(
                sum(by_name[p]["per_100g"].get(key, 0.0) * g / 100.0 for p, g in parts)
                / total * 100.0,
                3,
            )
            for key in keys
        }
        base_entry = by_name[base]
        out.append(
            {
                "name": name,
                "aliases": aliases,
                "category": base_entry.get("category"),
                "is_veg": all(by_name[p].get("is_veg", True) for p, _ in parts),
                "source": base_entry.get("source", "indb"),
                "household_units": [
                    {"label": unit, "grams": total},
                    {"label": "100 g", "grams": 100.0},
                ],
                "per_100g": per_100g,
            }
        )
    return out


def _with_family(entry: dict, family_of: dict[str, str]) -> dict:
    family = family_of.get(entry["name"])
    if family:
        entry["family"] = family
        entry["variant"] = entry["name"]
    return entry


async def seed_foods() -> int:
    curated = _load_curated()
    entries = curated + _computed(curated) + _load_ifct()
    if not entries:
        return 0

    family_of = {name: fam for fam, names in FAMILIES.items() for name in names}
    entries = [_with_family(e, family_of) for e in entries]

    digest = hashlib.sha256(
        json.dumps([SEED_VERSION, entries], sort_keys=True, default=str).encode()
    ).hexdigest()
    meta = FoodItem.get_pymongo_collection().database["meta"]
    stamp = await meta.find_one({"_id": "seed"})
    if stamp and stamp.get("digest") == digest:
        return 0

    collection = FoodItem.get_pymongo_collection()
    ops = []
    seen: set[str] = set()
    for entry in entries:
        name_norm = normalise_name(entry["name"])
        if name_norm in seen:
            continue  # curated wins over a same-named IFCT row
        seen.add(name_norm)
        source = entry.get("source", "indb")
        doc = FoodItem(
            name=entry["name"],
            aliases=entry.get("aliases", []),
            category=entry.get("category"),
            family=entry.get("family"),
            variant=entry.get("variant"),
            per_100g=entry["per_100g"],
            household_units=entry.get("household_units")
            or [{"label": "100 g", "grams": 100.0}],
            source=source,
            confidence=CONFIDENCE_BY_SOURCE.get(source, "database"),
            is_veg=entry.get("is_veg", True),
            external_id=entry.get("external_id"),
            owner_id=None,
        )
        fields = doc.model_dump(exclude={"id", "revision_id", "created_at", "owner_id"})
        ops.append(
            UpdateOne(
                {"owner_id": None, "name_norm": name_norm},
                {"$set": fields, "$setOnInsert": {"created_at": doc.created_at, "owner_id": None}},
                upsert=True,
            )
        )

    result = await collection.bulk_write(ops, ordered=False)
    await meta.update_one({"_id": "seed"}, {"$set": {"digest": digest}}, upsert=True)
    log.info(
        "seeded foods: %d inserted, %d updated (of %d)",
        result.upserted_count,
        result.modified_count,
        len(ops),
    )
    return result.upserted_count
