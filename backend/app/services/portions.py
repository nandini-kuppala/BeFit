"""Portions: how "2 katori", "3 pieces" or "1 tbsp" become grams.

The old converter matched the spoken unit as a substring of free-text labels
and multiplied by that label's weight. Labels like "5 pieces" (100 g) describe
several units at once, so "3 pieces" of Chicken 65 came out at 300 g instead of
60 g; an unknown unit silently fell back to the first label ("6 prawns" with
unit "piece" became six katoris). Every one of those is a 2-10x calorie error
logged with a straight face.

The rules here:

  1. A food's own labels are parsed into one-unit portions: "2 idli / 80 g"
     becomes "1 idli / 40 g". Counts inside labels are never multiplied again.
  2. Spoken units are canonicalised through a synonym table ("pcs", "nos",
     "pieces" -> piece; "bowl", "vati" -> katori).
  3. If the food has no portion for that unit, a standard household measure is
     used (tbsp = 15 ml, katori = 150 ml...), converted by the food's density.
  4. Only if nothing applies does it fall back to the food's default portion —
     and the result says so, so the UI can show what was actually assumed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.food import FoodItem

# ------------------------------------------------------------ vocabulary

# Canonical key -> spoken forms. Order matters only for display.
UNIT_SYNONYMS: dict[str, tuple[str, ...]] = {
    "g": ("g", "gm", "gms", "gram", "grams", "gr"),
    "kg": ("kg", "kgs", "kilo", "kilogram", "kilograms"),
    "ml": ("ml", "mls", "millilitre", "milliliter", "millilitres", "milliliters"),
    "l": ("l", "litre", "liter", "litres", "liters", "ltr"),
    "oz": ("oz", "ounce", "ounces"),
    "tsp": ("tsp", "teaspoon", "teaspoons", "chammach", "chamach", "spoon", "spoons"),
    "tbsp": ("tbsp", "tablespoon", "tablespoons", "tbs", "big spoon"),
    "cup": ("cup", "cups", "mug"),
    "glass": ("glass", "glasses", "tumbler"),
    "katori": ("katori", "katoris", "katori s", "bowl", "bowls", "vati", "wati", "kinnam", "small bowl"),
    "plate": ("plate", "plates", "thali"),
    "scoop": ("scoop", "scoops"),
    "slice": ("slice", "slices"),
    "handful": ("handful", "handfuls", "mutthi", "fistful"),
    "piece": ("piece", "pieces", "pc", "pcs", "no", "nos", "number", "unit", "units", "whole"),
    "serving": ("serving", "servings", "portion", "portions", "helping"),
    "small": ("small",),
    "medium": ("medium", "regular"),
    "large": ("large", "big"),
}

_SYNONYM_TO_KEY = {form: key for key, forms in UNIT_SYNONYMS.items() for form in forms}

# Standard household measures, in ml (volume) or g (mass). A katori is the
# medium steel bowl: ICMR-NIN's reference set runs 105-200 ml; 150 ml is the
# common working figure for a level serving of dal or sabzi.
VOLUME_ML: dict[str, float] = {
    "ml": 1.0,
    "l": 1000.0,
    "tsp": 5.0,
    "tbsp": 15.0,
    "cup": 200.0,  # Indian cup (ICMR-NIN uses 200 ml), not the US 240 ml
    "glass": 250.0,
    "katori": 150.0,
}
MASS_G: dict[str, float] = {"g": 1.0, "kg": 1000.0, "oz": 28.35}

# Units that are a count of the food itself. The food's own portion decides
# their weight; there's no universal "1 piece".
COUNT_KEYS = {"piece", "serving", "slice", "scoop", "plate", "handful", "small", "medium", "large"}

# Densities for foods commonly logged by spoon/cup. Anything not listed is
# treated as water-like (1.0), which is right for dal, milk, juice and curries
# to within a few percent. Dry, airy foods are the big exceptions.
_DENSITY_HINTS: tuple[tuple[str, float], ...] = (
    ("oil", 0.92),
    ("ghee", 0.91),
    ("butter", 0.91),
    ("honey", 1.42),
    ("jaggery", 0.85),
    ("sugar", 0.85),
    ("flour", 0.53),
    ("atta", 0.53),
    ("besan", 0.45),
    ("maida", 0.53),
    ("rava", 0.65),
    ("sooji", 0.65),
    ("oats", 0.41),
    ("poha", 0.30),
    ("cornflakes", 0.12),
    ("muesli", 0.45),
    ("rice", 0.80),  # cooked rice, heaped into a katori
    ("peanut butter", 1.07),
    ("chutney", 1.05),
    ("protein powder", 0.45),
    ("whey", 0.45),
    ("seeds", 0.60),
    ("nuts", 0.55),
    ("almond", 0.55),
)

_LEADING_NUMBER = re.compile(
    r"^\s*(?P<num>\d+(?:\.\d+)?|\d+\s*/\s*\d+|½|¼|¾|half|quarter)\s*(?:x\s*)?(?P<rest>.*)$",
    re.IGNORECASE,
)
_PAREN = re.compile(r"\(([^)]*)\)")
_FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "half": 0.5, "quarter": 0.25}


def canonical_unit(unit: str | None) -> str | None:
    """'Pieces' -> 'piece', 'bowl' -> 'katori'. None if unrecognised."""
    text = (unit or "").strip().lower().rstrip(".")
    if not text:
        return None
    if text in _SYNONYM_TO_KEY:
        return _SYNONYM_TO_KEY[text]
    # "katori dal", "big bowl" — look for any known word.
    for word in re.split(r"[\s\-_/,;]+", text):
        if word in _SYNONYM_TO_KEY:
            return _SYNONYM_TO_KEY[word]
    return None


_LIQUID_CATEGORIES = {"beverage", "dairy", "drink", "juice", "soup"}
_LIQUID_WORDS = ("milk", "juice", "lassi", "buttermilk", "tea", "coffee", "soup", "shake", "smoothie", "water", "rasam", "oil")


def is_liquid(food: FoodItem) -> bool:
    if (food.category or "").lower() in _LIQUID_CATEGORIES:
        return True
    if any(canonical_unit(_parse_count(u.label)[1]) in ("ml", "l", "glass") or "ml" in u.label.lower()
           for u in food.household_units):
        return True
    name = food.name.lower()
    return any(word in name for word in _LIQUID_WORDS)


def density(food: FoodItem) -> float:
    if food.density_g_per_ml:
        return food.density_g_per_ml
    name = food.name.lower()
    for hint, value in _DENSITY_HINTS:
        if hint in name:
            return value
    return 1.0


# ------------------------------------------------------------ portions


@dataclass(frozen=True)
class Portion:
    key: str  # canonical unit, or a slug of the food's own count noun ("idli")
    label: str  # what one of it is called: "1 idli", "1 katori", "1 g"
    grams: float  # weight of ONE of it
    is_default: bool = False

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "grams": round(self.grams, 2),
            "is_default": self.is_default,
        }


def _parse_count(text: str) -> tuple[float, str]:
    """'2 idli' -> (2, 'idli'); '1 cup (200 ml)' -> (1, 'cup'); 'medium' -> (1, 'medium')."""
    cleaned = _PAREN.sub("", text).strip()
    match = _LEADING_NUMBER.match(cleaned)
    if not match:
        return 1.0, cleaned.lower()
    raw = match.group("num").lower().replace(" ", "")
    if raw in _FRACTIONS:
        count = _FRACTIONS[raw]
    elif "/" in raw:
        top, bottom = raw.split("/")
        count = float(top) / float(bottom) if float(bottom) else 1.0
    else:
        count = float(raw)
    return (count if count > 0 else 1.0), match.group("rest").strip().lower()


_IRREGULAR = {"halves": "half", "leaves": "leaf", "loaves": "loaf", "knives": "knife"}


def _singular(noun: str) -> str:
    words = noun.split(" ")
    if words and words[-1] in _IRREGULAR:
        return " ".join([*words[:-1], _IRREGULAR[words[-1]]])
    if noun.endswith("ies") and len(noun) > 4:
        return noun[:-3] + "y"
    if noun.endswith("es") and len(noun) > 4 and noun[-3] in "sxz":
        return noun[:-2]
    if noun.endswith("s") and len(noun) > 3 and not noun.endswith("ss"):
        return noun[:-1]
    return noun


def _slug(noun: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", noun.lower()).strip("_") or "serving"


def portions_for(food: FoodItem) -> list[Portion]:
    """Every portion this food can be logged in, one unit each, default first.

    Built from the food's own labels, then topped up with the standard measures
    that make sense for it: g always; ml, tsp, tbsp, cup and katori whenever
    volume is plausible (always, for a food without its own count unit).
    """
    portions: dict[str, Portion] = {}
    default_key: str | None = None
    liquid = is_liquid(food)

    for unit in food.household_units:
        count, noun = _parse_count(unit.label)
        per_one = unit.grams / count
        key = unit.key or canonical_unit(noun)
        if key in MASS_G or key in ("ml", "l"):
            # "100 g" / "100 ml" are just the base unit, handled below. Any
            # other fixed weight ("40 g (half cup)", "50 g") is a serving size
            # someone chose on purpose — keep it as one.
            is_base = abs(unit.grams - 100.0) < 0.01 and count == 100
            if not is_base and "serving" not in portions:
                paren = _PAREN.search(unit.label)
                detail = paren.group(1).strip() if paren else f"{unit.grams:g} g"
                portions["serving"] = Portion(
                    key="serving", label=f"1 serving ({detail})", grams=unit.grams
                )
                default_key = default_key or "serving"
            elif default_key is None and not portions and key in ("ml", "l"):
                default_key = "ml"
            continue
        if key is None:
            noun = _singular(noun) if noun else "serving"
            key = _slug(noun)
            label = f"1 {noun}"
        elif key in COUNT_KEYS or key in VOLUME_ML:
            pretty = noun if noun and canonical_unit(noun) == key else key
            label = f"1 {_singular(pretty)}"
        else:
            label = f"1 {key}"
        if key not in portions:
            portions[key] = Portion(key=key, label=label, grams=per_one)
            if default_key is None:
                default_key = key

    rho = density(food)
    # A glass of walnuts is not a portion anyone means; volume units beyond
    # the spoon/katori/cup set are offered for drinks only.
    volume_keys = ("katori", "cup", "glass", "tbsp", "tsp") if liquid else ("katori", "cup", "tbsp", "tsp")
    for key in volume_keys:
        if key not in portions:
            portions[key] = Portion(key=key, label=f"1 {key}", grams=VOLUME_ML[key] * rho)
    portions["g"] = Portion(key="g", label="1 g", grams=1.0)
    if liquid:
        portions["ml"] = Portion(key="ml", label="1 ml", grams=rho)

    if default_key is None:
        default_key = "g"

    ordered = [portions.pop(default_key)]
    # Food's own count units next, then the household measures, then mass.
    own = [p for k, p in portions.items() if k not in VOLUME_ML and k not in MASS_G and k != "ml"]
    volumes = [portions[k] for k in ("katori", "cup", "glass", "tbsp", "tsp") if k in portions]
    rest = [portions[k] for k in ("g", "ml", "oz") if k in portions]
    result = [ordered[0], *own, *volumes, *rest]
    return [
        Portion(p.key, p.label, p.grams, is_default=(i == 0)) for i, p in enumerate(result)
    ]


def default_portion(food: FoodItem) -> Portion:
    return portions_for(food)[0]


@dataclass(frozen=True)
class Converted:
    grams: float
    portion: Portion
    # False when the requested unit was not recognised for this food and the
    # default portion was used instead. The UI shows the portion it chose.
    exact: bool


def to_grams(food: FoodItem, quantity: float, unit: str | None) -> Converted:
    """Convert '<quantity> <unit>' of this food into grams."""
    portions = portions_for(food)
    by_key = {p.key: p for p in portions}
    text = (unit or "").strip().lower()

    key = canonical_unit(text)
    if key in MASS_G:
        p = by_key.get(key) or Portion(key=key, label=f"1 {key}", grams=MASS_G[key])
        return Converted(quantity * p.grams, p, True)
    if key in by_key:
        return Converted(quantity * by_key[key].grams, by_key[key], True)
    if key in ("l",):
        grams = VOLUME_ML["l"] * density(food)
        return Converted(quantity * grams, Portion("l", "1 l", grams), True)

    # The food's own count noun: "idli", "idlis", "dosa", "roti".
    if text:
        slug = _slug(_singular(text))
        if slug in by_key:
            return Converted(quantity * by_key[slug].grams, by_key[slug], True)
        # The unit is the food's own name or alias ("2 roti" of Chapati,
        # "3 idly" of Idli): one of its own count unit.
        names = {_slug(_singular(n.lower())) for n in (food.name, *food.aliases)}
        names |= {_slug(_singular(w)) for n in (food.name, *food.aliases) for w in n.lower().split()}
        # A count word for a food whose only count portion has another name
        # ("2 pieces" of a food portioned as "1 idli"): one of its own unit.
        if key in COUNT_KEYS or slug in names:
            own = next(
                (p for p in portions if p.key not in VOLUME_ML and p.key not in MASS_G and p.key != "ml"),
                None,
            )
            if own is not None:
                return Converted(quantity * own.grams, own, True)

    default = portions[0]
    return Converted(quantity * default.grams, default, not text or key == "serving")
