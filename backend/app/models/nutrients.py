from __future__ import annotations

from pydantic import BaseModel, Field

# Every nutrient the app tracks. Values are per 100 g on a FoodItem, and
# absolute for a logged portion. Defaults are 0.0 so partial data from any
# source stays usable rather than failing validation.
NUTRIENT_FIELDS: tuple[str, ...] = (
    "kcal",
    "protein_g",
    "fat_g",
    "carbs_g",
    "fibre_g",
    "sugar_g",
    "iron_mg",
    "calcium_mg",
    "zinc_mg",
    "magnesium_mg",
    "selenium_ug",
    "iodine_ug",
    "sodium_mg",
    "potassium_mg",
    "vit_a_ug",
    "vit_c_mg",
    "vit_d_iu",
    "vit_e_mg",
    "vit_b12_ug",
    "folate_ug",
    "omega3_mg",
)


class Nutrients(BaseModel):
    kcal: float = 0.0
    protein_g: float = 0.0
    fat_g: float = 0.0
    carbs_g: float = 0.0
    fibre_g: float = 0.0
    sugar_g: float = 0.0

    iron_mg: float = 0.0
    calcium_mg: float = 0.0
    zinc_mg: float = 0.0
    magnesium_mg: float = 0.0
    selenium_ug: float = 0.0
    iodine_ug: float = 0.0
    sodium_mg: float = 0.0
    potassium_mg: float = 0.0

    vit_a_ug: float = 0.0
    vit_c_mg: float = 0.0
    vit_d_iu: float = 0.0
    vit_e_mg: float = 0.0
    vit_b12_ug: float = 0.0
    folate_ug: float = 0.0

    omega3_mg: float = 0.0

    def scaled(self, grams: float) -> Nutrients:
        """This food's nutrients for `grams`, given values stored per 100 g."""
        factor = grams / 100.0
        return Nutrients(
            **{field: getattr(self, field) * factor for field in NUTRIENT_FIELDS}
        )

    def __add__(self, other: Nutrients) -> Nutrients:
        return Nutrients(
            **{
                field: getattr(self, field) + getattr(other, field)
                for field in NUTRIENT_FIELDS
            }
        )

    def rounded(self, places: int = 2) -> Nutrients:
        return Nutrients(
            **{
                field: round(getattr(self, field), places)
                for field in NUTRIENT_FIELDS
            }
        )


class HouseholdUnit(BaseModel):
    """A portion people actually speak in: '1 idli', '1 katori', '1 medium'."""

    label: str
    grams: float = Field(gt=0)
