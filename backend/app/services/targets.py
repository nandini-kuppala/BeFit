"""Deriving calorie, macro and micronutrient targets from a profile.

Micronutrient values follow ICMR-NIN 2020 Indian RDAs rather than US values,
because they assume the lower bioavailability of Indian diets (iron 29 mg vs
18 mg, zinc 13 mg vs 8 mg).
"""

from datetime import date

from app.models.profile import Profile
from app.models.targets import MicroTarget, Targets

KCAL_PER_KG_FAT = 7700.0

# Floors. Below these, lean mass and hormonal health suffer regardless of how
# fast someone wants to lose weight.
MIN_KCAL_FEMALE = 1300.0
MIN_KCAL_MALE = 1600.0
MIN_FAT_G_PER_KG = 0.6

DEFICIT_FRACTION = 0.22
PROTEIN_G_PER_KG_GOAL = 2.2
FAT_G_PER_KG_GOAL = 0.9


def mifflin_st_jeor(sex: str, weight_kg: float, height_cm: float, age: int) -> float:
    base = 10.0 * weight_kg + 6.25 * height_cm - 5.0 * age
    return base + 5.0 if sex == "male" else base - 161.0


def _micro_targets(profile: Profile) -> list[MicroTarget]:
    female = profile.sex == "female"
    menstruating = female and profile.age < 50
    conditions = {c.name.lower() for c in profile.health_conditions}
    thyroid = any("thyroid" in c for c in conditions)

    targets = [
        # Highest priority first — these drive display order in the UI.
        MicroTarget(
            key="iron_mg",
            label="Iron",
            amount=29.0 if menstruating else 17.0,
            unit="mg",
            priority=1 if menstruating else 2,
        ),
        MicroTarget(key="calcium_mg", label="Calcium", amount=1000.0, unit="mg", priority=1),
        MicroTarget(key="vit_d_iu", label="Vitamin D", amount=600.0, unit="IU", priority=1),
        MicroTarget(key="vit_b12_ug", label="Vitamin B12", amount=2.2, unit="µg", priority=2),
        MicroTarget(
            key="selenium_ug",
            label="Selenium",
            amount=40.0,
            unit="µg",
            # Required for T4→T3 conversion, so it matters more with thyroid disease.
            priority=1 if thyroid else 3,
        ),
        MicroTarget(key="zinc_mg", label="Zinc", amount=13.0 if female else 17.0, unit="mg", priority=2),
        MicroTarget(key="magnesium_mg", label="Magnesium", amount=370.0 if female else 440.0, unit="mg", priority=2),
        MicroTarget(key="folate_ug", label="Folate", amount=220.0, unit="µg", priority=3),
        MicroTarget(key="vit_c_mg", label="Vitamin C", amount=65.0 if female else 80.0, unit="mg", priority=3),
        MicroTarget(key="vit_a_ug", label="Vitamin A", amount=840.0 if female else 1000.0, unit="µg", priority=3),
        MicroTarget(key="potassium_mg", label="Potassium", amount=3500.0, unit="mg", priority=3),
        MicroTarget(key="omega3_mg", label="Omega-3", amount=300.0, unit="mg", priority=3),
    ]

    # Ceilings, not goals. Exceeding one is a warning, never an achievement.
    targets.append(
        MicroTarget(
            key="iodine_ug",
            label="Iodine",
            amount=150.0,
            unit="µg",
            is_upper_limit=True,
            # In autoimmune thyroid disease, harm is documented from as little
            # as 250 µg/day of supplemental iodine.
            priority=1 if thyroid else 3,
        )
    )
    targets.append(
        MicroTarget(
            key="sodium_mg",
            label="Sodium",
            amount=2000.0,
            unit="mg",
            is_upper_limit=True,
            priority=3,
        )
    )
    return targets


def build_targets(profile: Profile, current_weight_kg: float | None = None) -> Targets:
    weight = current_weight_kg or profile.start_weight_kg
    goal = profile.goal_weight_kg

    bmr = mifflin_st_jeor(profile.sex, weight, profile.height_cm, profile.age)
    adjusted_bmr = bmr * profile.metabolic_adjustment
    tdee = adjusted_bmr * profile.activity_factor

    floor = MIN_KCAL_FEMALE if profile.sex == "female" else MIN_KCAL_MALE
    losing = goal < weight

    if losing:
        kcal = max(tdee * (1.0 - DEFICIT_FRACTION), floor)
    elif goal > weight:
        kcal = tdee * 1.10
    else:
        kcal = tdee

    # Protein and fat are set from goal weight, so the targets don't inflate
    # for fat mass she is trying to lose.
    protein_g = round(goal * PROTEIN_G_PER_KG_GOAL)
    fat_g = max(round(goal * FAT_G_PER_KG_GOAL), round(goal * MIN_FAT_G_PER_KG))
    carbs_g = max(round((kcal - protein_g * 4 - fat_g * 9) / 4), 50)
    fibre_g = max(25.0, round(kcal / 1000 * 17.5))

    weekly_deficit = (tdee - kcal) * 7
    rate = round(weekly_deficit / KCAL_PER_KG_FAT, 2)

    return Targets(
        user_id=profile.user_id,
        effective_from=date.today(),
        bmr_kcal=round(adjusted_bmr),
        tdee_kcal=round(tdee),
        kcal=round(kcal),
        protein_g=protein_g,
        fat_g=fat_g,
        carbs_g=carbs_g,
        fibre_g=fibre_g,
        rate_kg_per_week=rate,
        micros=_micro_targets(profile),
    )
