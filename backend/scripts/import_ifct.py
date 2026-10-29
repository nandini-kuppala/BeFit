"""Convert IFCT 2017 (MIT release) into app/data/ifct2017.json.

Source: the npm package `@ifct2017/compositions@2.0.9` — MIT licensed. Later
releases of the ifct2017 packages moved to AGPL-3.0 (April 2025); do not
regenerate from a newer version without re-checking the licence.

    npm pack @ifct2017/compositions@2.0.9 && tar xzf ifct2017-compositions-2.0.9.tgz
    python scripts/import_ifct.py package/index.csv

The CSV stores everything in SI base units (g, kJ). Converted here to what the
app stores: kcal, mg, ug, IU.
"""

import csv
import json
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "data" / "ifct2017.json"

KJ_PER_KCAL = 4.184

# column -> (field, multiplier from the CSV's grams)
FIELDS = {
    "protcnt": ("protein_g", 1),
    "fatce": ("fat_g", 1),
    "choavldf": ("carbs_g", 1),
    "fibtg": ("fibre_g", 1),
    "fsugar": ("sugar_g", 1),
    "fe": ("iron_mg", 1e3),
    "ca": ("calcium_mg", 1e3),
    "zn": ("zinc_mg", 1e3),
    "mg": ("magnesium_mg", 1e3),
    "se": ("selenium_ug", 1e6),
    "na": ("sodium_mg", 1e3),
    "k": ("potassium_mg", 1e3),
    "vita": ("vit_a_ug", 1e6),
    "vitc": ("vit_c_mg", 1e3),
    "vite": ("vit_e_mg", 1e3),
    "folsum": ("folate_ug", 1e6),
    "facn3": ("omega3_mg", 1e3),
}

# Groups whose foods are almost never eaten raw: the name says so, so that
# "Rice, raw" is not mistaken for a katori of cooked rice.
RAW_GROUPS = {
    "Cereals and Millets",
    "Grain Legumes",
    "Animal Meat",
    "Poultry",
    "Marine Fish",
    "Fresh Water Fish and Shellfish",
    "Marine Shellfish",
    "Marine Mollusks",
}
NON_VEG_GROUPS = RAW_GROUPS - {"Cereals and Millets", "Grain Legumes"} | {"Egg and Egg Products"}

PLANT_GROUPS_NO_VIT_D = {
    "Cereals and Millets", "Grain Legumes", "Other Vegetables", "Fruits",
    "Green Leafy Vegetables", "Condiments and Spices", "Nuts and Oil Seeds",
    "Roots and Tubers", "Sugars", "Edible Oils and Fats", "Mushrooms",
}

_LANG_PREFIX = re.compile(r"^(?:[A-Z][a-z]{0,4}\.\s*,?\s*)+")


def _num(value: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _aliases(lang: str, name: str) -> list[str]:
    found: list[str] = []
    for part in (lang or "").split(";"):
        part = _LANG_PREFIX.sub("", part.strip()).strip(" .")
        for piece in re.split(r",|/", part):
            piece = piece.strip(" .")
            if 2 < len(piece) < 40 and piece.lower() != name.lower() and piece not in found:
                found.append(piece)
    return found[:14]


def main(csv_path: str) -> None:
    rows = list(csv.reader(open(csv_path, encoding="utf-8")))
    header = rows[0]
    col = {h.split("; ")[1]: i for i, h in enumerate(header)}
    foods = []
    for row in rows[1:]:
        get = lambda key: row[col[key]] if key in col else ""  # noqa: E731
        group = get("grup")
        name = get("name").strip()
        per_100g = {"kcal": round(_num(get("enerc")) / KJ_PER_KCAL, 1)}
        for key, (field, mult) in FIELDS.items():
            per_100g[field] = round(_num(get(key)) * mult, 3)
        # IFCT vitamin D is in g; the app stores IU (1 ug = 40 IU). Plant
        # entries carry ergocalciferol traces that are artefacts — zeroed,
        # matching the curated seed's rule.
        vit_d_ug = _num(get("vitd")) * 1e6
        per_100g["vit_d_iu"] = 0.0 if group in PLANT_GROUPS_NO_VIT_D else round(vit_d_ug * 40, 1)
        if per_100g["kcal"] <= 0 and per_100g["fat_g"] > 90:
            per_100g["kcal"] = round(per_100g["fat_g"] * 9, 1)

        display = f"{name} (raw)" if group in RAW_GROUPS and "raw" not in name.lower() else name
        foods.append(
            {
                "name": display,
                "aliases": _aliases(get("lang"), name),
                "category": group.lower().replace(" ", "_"),
                "is_veg": group not in NON_VEG_GROUPS,
                "source": "ifct",
                "external_id": f"ifct:{get('code')}",
                "per_100g": per_100g,
            }
        )

    OUT.write_text(
        json.dumps(
            {
                "source": "IFCT 2017 (NIN-ICMR) via @ifct2017/compositions@2.0.9, MIT licence",
                "foods": foods,
            },
            ensure_ascii=False,
            indent=0,
        )
    )
    print(f"wrote {len(foods)} foods to {OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
