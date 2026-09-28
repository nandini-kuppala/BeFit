"""Seed composition data for Indian home cooking, per 100 g as eaten.

Every entry carries all 21 nutrient keys the app tracks (see
``app.models.nutrients.NUTRIENT_FIELDS``); a nutrient that is genuinely absent, or
that the source database simply does not measure, is 0.0 rather than a guess.

Sources
-------
* **INDB** - Anuvaad Indian Nutrient Databank, release 2024.11
  (https://www.anuvaad.org.in/indian-nutrient-databank/). Composite Indian recipes.
* **IFCT** - Indian Food Composition Tables 2017, NIN/ICMR, via the machine-readable
  copy at https://github.com/ifct2017/compositions. Single foods; SI units converted
  here (kJ to kcal, g to mg/ug).
* **USDA** - FoodData Central SR Legacy (2018-04) for non-Indian items and for
  cooked foods INDB does not carry, plus Foundation Foods (2025-04-24) for iodine.

The INDB basis problem - the big one
------------------------------------
INDB states that it derives a recipe's nutrients by "summing individual ingredients".
It applies **no cooking-yield correction**, so its per-100 g column is per 100 g of
raw ingredients, not of the finished dish. For simmered dishes (dals, sambar, curries,
boiled rice) the cooking water is itself an ingredient, so that basis lands close to
as-eaten and INDB is used directly. For three groups it does not:

* deep-fried items, where INDB counts the entire pan of frying oil (its poori is
  738 kcal/100 g and one poori is 921 kcal);
* griddle breads and fermented batters, where water evaporates (its plain dosa is
  381 kcal/100 g);
* over-watered recipes (its plain khichdi is 57 kcal/100 g and one small bowl 574 g).

Every entry in those groups is instead **computed from IFCT ingredients** with IFCT's
own per-nutrient retention factors, and its comment gives the full recipe, the
finished weight and the cooking method, so you can check or change the assumption.
Comments beginning COMPUTED are built that way. For deep-fried items the absorbed-oil
figure (10-20% of finished weight) is the dominant uncertainty.

Even where INDB is used directly, a thick or thin gravy moves kcal/100 g by roughly
+/-25%; log by the katori, which is what these household units are calibrated for.

Known limits - read before trusting a number
--------------------------------------------
1. **Vitamin B12 and iodine are not measured by IFCT or INDB at all.** They are
   filled in only on single-food animal entries, from the matching USDA food, and
   the entry's comment names that food. On composite INDB dishes (egg curry, fish
   curry, chicken curry, mutton korma) both read 0.0 and therefore UNDER-count.
2. **Omega-3 is only present on IFCT and USDA entries** (IFCT ``facn3``; USDA
   ALA+EPA+DPA+DHA). INDB publishes total PUFA but not the n-3 split, so every
   INDB-sourced dish reads 0.0 omega-3 and under-counts slightly.
3. **Vitamin D is zeroed on plant foods.** IFCT and INDB report small
   ergocalciferol traces in things like almonds and idli, which are artefacts; the
   value is kept only on eggs, dairy, fish and meat.
4. Entries whose comment starts with COMPUTED, PROXY, DERIVED or ESTIMATED are not a
   direct database match - the comment says exactly what was substituted or assumed
   and which way the error is likely to run.
5. IFCT leaves the energy column blank for pure fats, so kcal for the oils and ghee
   is computed with Atwater factors (they come out at the expected 900 kcal/100 g).
6. ``household_units`` are standard Indian household measures (1 katori ~ 150 g of a
   wet dish, 1 chapati ~ 35 g, 1 idli ~ 40 g), not INDB's own serving column, whose
   weights are inconsistent (it calls one boiled egg 151 g).

Iron, zinc, calcium and magnesium are mg; selenium, iodine, B12, folate and vitamin A
are ug; vitamin D is IU; omega-3 is mg.

Compiled 2026-09-23.
"""

SEED_FOODS: list[dict] = [
    # INDB recipe 'Idli'
    {
        "name": "Idli",
        "aliases": ["idly", "idlee", "steamed rice cake"],
        "category": "south_indian_breakfast",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 idli", "grams": 40.0},
            {"label": "2 idli", "grams": 80.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 137.54, "protein_g": 4.64, "fat_g": 0.33, "carbs_g": 28.18,
            "fibre_g": 2.31, "sugar_g": 0.28,
            "iron_mg": 0.68, "calcium_mg": 8.0, "zinc_mg": 0.62, "magnesium_mg": 25.44,
            "selenium_ug": 2.75, "iodine_ug": 0.0, "sodium_mg": 100.83, "potassium_mg": 158.13,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.04,
            "vit_b12_ug": 0.0, "folate_ug": 11.77, "omega3_mg": 0.0,
        },
    },
    # INDB 'Semolina idli (Suji/Rava idli)'
    {
        "name": "Rava idli",
        "aliases": ["semolina idli", "suji idli"],
        "category": "south_indian_breakfast",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 idli", "grams": 45.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 206.39, "protein_g": 9.34, "fat_g": 3.47, "carbs_g": 33.67,
            "fibre_g": 5.85, "sugar_g": 3.42,
            "iron_mg": 2.34, "calcium_mg": 100.85, "zinc_mg": 1.57, "magnesium_mg": 53.71,
            "selenium_ug": 9.58, "iodine_ug": 0.0, "sodium_mg": 185.02, "potassium_mg": 413.85,
            "vit_a_ug": 8.86, "vit_c_mg": 5.43, "vit_d_iu": 0.0, "vit_e_mg": 0.51,
            "vit_b12_ug": 0.0, "folate_ug": 58.64, "omega3_mg": 0.0,
        },
    },
    # COMPUTED from IFCT: per 60 g dosa - rice 20 g (A015) + black gram dal 5 g (B003) + oil 2
    # g (T005), IFCT roasting retention factors. INDB's own 'Plain dosa' row is 381 kcal/100
    # g, which is its raw batter-solids basis, not a cooked dosa. Fermentation raises folate
    # somewhat above this figure.
    {
        "name": "Plain dosa",
        "aliases": ["dosai", "sada dosa", "dose"],
        "category": "south_indian_breakfast",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 dosa", "grams": 60.0},
            {"label": "2 dosa", "grams": 120.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 184.58, "protein_g": 4.34, "fat_g": 3.83, "carbs_g": 29.72,
            "fibre_g": 1.83, "sugar_g": 0.27,
            "iron_mg": 0.58, "calcium_mg": 6.78, "zinc_mg": 0.65, "magnesium_mg": 18.77,
            "selenium_ug": 1.99, "iodine_ug": 0.0, "sodium_mg": 1.88, "potassium_mg": 105.93,
            "vit_a_ug": 0.06, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.03,
            "vit_b12_ug": 0.0, "folate_ug": 7.88, "omega3_mg": 45.3,
        },
    },
    # INDB 'Masala dosa'
    {
        "name": "Masala dosa",
        "aliases": ["masal dosai", "potato dosa"],
        "category": "south_indian_breakfast",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 dosa", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 164.58, "protein_g": 3.29, "fat_g": 7.84, "carbs_g": 19.57,
            "fibre_g": 2.52, "sugar_g": 1.33,
            "iron_mg": 0.79, "calcium_mg": 15.58, "zinc_mg": 0.5, "magnesium_mg": 26.62,
            "selenium_ug": 2.34, "iodine_ug": 0.0, "sodium_mg": 191.28, "potassium_mg": 271.77,
            "vit_a_ug": 0.0, "vit_c_mg": 6.75, "vit_d_iu": 0.0, "vit_e_mg": 3.71,
            "vit_b12_ug": 0.0, "folate_ug": 17.05, "omega3_mg": 0.0,
        },
    },
    # COMPUTED from IFCT: per 70 g pesarattu - whole green gram 30 g (B011) + rice 5 g (A015)
    # + oil 3 g (T005), roasting retention. INDB's row reads 286 kcal/100 g on a batter-solids
    # basis.
    {
        "name": "Pesarattu",
        "aliases": ["moong dosa", "green gram dosa"],
        "category": "south_indian_breakfast",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 dosa", "grams": 70.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 199.41, "protein_g": 9.71, "fat_g": 5.05, "carbs_g": 24.85,
            "fibre_g": 7.13, "sugar_g": 0.25,
            "iron_mg": 2.04, "calcium_mg": 38.14, "zinc_mg": 1.23, "magnesium_mg": 77.61,
            "selenium_ug": 8.56, "iodine_ug": 0.0, "sodium_mg": 4.41, "potassium_mg": 409.71,
            "vit_a_ug": 3.91, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.15,
            "vit_b12_ug": 0.0, "folate_ug": 47.11, "omega3_mg": 70.04,
        },
    },
    # COMPUTED from IFCT: per 90 g uttapam - rice 25 g + black gram dal 7 g + onion 15 g +
    # tomato 10 g + oil 3 g, roasting retention.
    {
        "name": "Uttapam",
        "aliases": ["uthappam", "ooththappam"],
        "category": "south_indian_breakfast",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 uttapam", "grams": 90.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 172.51, "protein_g": 4.12, "fat_g": 3.86, "carbs_g": 27.1,
            "fibre_g": 2.18, "sugar_g": 1.3,
            "iron_mg": 0.61, "calcium_mg": 10.36, "zinc_mg": 0.64, "magnesium_mg": 20.82,
            "selenium_ug": 1.87, "iodine_ug": 0.0, "sodium_mg": 3.48, "potassium_mg": 133.64,
            "vit_a_ug": 11.27, "vit_c_mg": 1.96, "vit_d_iu": 0.0, "vit_e_mg": 0.06,
            "vit_b12_ug": 0.0, "folate_ug": 12.01, "omega3_mg": 44.46,
        },
    },
    # COMPUTED from IFCT: per 45 g vada - black gram dal 25 g (B003) + 7 g absorbed oil,
    # frying retention. Deep-fried absorption is taken at ~15% of finished weight, the usual
    # range being 10-20%, so fat here is good to about +/-30%. INDB's row counts the WHOLE
    # frying pan of oil and reads 745 kcal/100 g, which is unusable.
    {
        "name": "Medu vada",
        "aliases": ["vada", "ulundu vadai", "urad dal vada", "medhu vadai"],
        "category": "south_indian_breakfast",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 vada", "grams": 45.0},
            {"label": "2 vada", "grams": 90.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 320.05, "protein_g": 12.17, "fat_g": 16.49, "carbs_g": 26.92,
            "fibre_g": 6.3, "sugar_g": 0.42,
            "iron_mg": 2.59, "calcium_mg": 30.93, "zinc_mg": 1.58, "magnesium_mg": 96.11,
            "selenium_ug": 12.66, "iodine_ug": 0.0, "sodium_mg": 9.96, "potassium_mg": 578.5,
            "vit_a_ug": 0.42, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.08,
            "vit_b12_ug": 0.0, "folate_ug": 32.05, "omega3_mg": 235.83,
        },
    },
    # INDB 'Semolina upma (Suji/Rava upma)'
    {
        "name": "Rava upma",
        "aliases": ["upma", "uppuma", "suji upma", "semolina upma"],
        "category": "south_indian_breakfast",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 plate", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 147.89, "protein_g": 3.3, "fat_g": 7.49, "carbs_g": 16.31,
            "fibre_g": 3.24, "sugar_g": 1.31,
            "iron_mg": 1.1, "calcium_mg": 21.57, "zinc_mg": 0.59, "magnesium_mg": 21.34,
            "selenium_ug": 3.21, "iodine_ug": 0.0, "sodium_mg": 101.59, "potassium_mg": 158.35,
            "vit_a_ug": 0.0, "vit_c_mg": 4.37, "vit_d_iu": 0.0, "vit_e_mg": 3.57,
            "vit_b12_ug": 0.0, "folate_ug": 14.24, "omega3_mg": 0.0,
        },
    },
    # INDB 'Vegetable upma'
    {
        "name": "Vegetable upma",
        "aliases": ["veg upma", "mixed vegetable upma"],
        "category": "south_indian_breakfast",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 plate", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 146.47, "protein_g": 4.73, "fat_g": 6.63, "carbs_g": 16.46,
            "fibre_g": 4.19, "sugar_g": 1.39,
            "iron_mg": 1.35, "calcium_mg": 26.68, "zinc_mg": 0.78, "magnesium_mg": 33.55,
            "selenium_ug": 3.75, "iodine_ug": 0.0, "sodium_mg": 347.02, "potassium_mg": 208.3,
            "vit_a_ug": 0.0, "vit_c_mg": 6.12, "vit_d_iu": 0.0, "vit_e_mg": 2.39,
            "vit_b12_ug": 0.0, "folate_ug": 21.42, "omega3_mg": 0.0,
        },
    },
    # COMPUTED from IFCT: per 150 g katori - rice 30 g + green gram dal 15 g + ghee 8 g +
    # cashew 3 g, cooked to 150 g, boiling retention. INDB has no pongal at all.
    {
        "name": "Ven pongal",
        "aliases": ["pongal", "khara pongal", "ghee pongal"],
        "category": "south_indian_breakfast",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 155.33, "protein_g": 3.7, "fat_g": 5.18, "carbs_g": 20.35,
            "fibre_g": 1.5, "sugar_g": 0.27,
            "iron_mg": 0.58, "calcium_mg": 6.17, "zinc_mg": 0.54, "magnesium_mg": 22.95,
            "selenium_ug": 4.93, "iodine_ug": 0.0, "sodium_mg": 1.58, "potassium_mg": 112.77,
            "vit_a_ug": 0.92, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.05,
            "vit_b12_ug": 0.0, "folate_ug": 7.53, "omega3_mg": 38.43,
        },
    },
    # COMPUTED from IFCT: per 120 g katori - rice flakes 40 g + potato 20 g + onion 10 g +
    # groundnut 5 g + oil 5 g, frying retention. INDB's row reads 294 kcal/100 g on an
    # ingredient-sum basis.
    {
        "name": "Poha",
        "aliases": ["pohe", "flattened rice", "aval", "chivda"],
        "category": "north_indian_breakfast",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 katori", "grams": 120.0},
            {"label": "1 plate", "grams": 180.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 192.71, "protein_g": 3.65, "fat_g": 6.26, "carbs_g": 28.1,
            "fibre_g": 1.97, "sugar_g": 0.76,
            "iron_mg": 1.76, "calcium_mg": 8.65, "zinc_mg": 0.67, "magnesium_mg": 39.69,
            "selenium_ug": 0.28, "iodine_ug": 0.0, "sodium_mg": 2.39, "potassium_mg": 163.84,
            "vit_a_ug": 0.08, "vit_c_mg": 2.65, "vit_d_iu": 0.0, "vit_e_mg": 0.03,
            "vit_b12_ug": 0.0, "folate_ug": 7.54, "omega3_mg": 10.49,
        },
    },
    # INDB 'Gram flour chilla/cheela (Besan chilla/cheela)'
    {
        "name": "Besan chilla",
        "aliases": ["besan cheela", "gram flour pancake", "besan omelette", "chilla"],
        "category": "north_indian_breakfast",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 chilla", "grams": 60.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 135.93, "protein_g": 7.8, "fat_g": 2.85, "carbs_g": 21.03,
            "fibre_g": 4.25, "sugar_g": 1.87,
            "iron_mg": 2.19, "calcium_mg": 28.38, "zinc_mg": 0.65, "magnesium_mg": 27.71,
            "selenium_ug": 1.35, "iodine_ug": 0.0, "sodium_mg": 135.57, "potassium_mg": 168.7,
            "vit_a_ug": 0.0, "vit_c_mg": 3.32, "vit_d_iu": 0.0, "vit_e_mg": 1.33,
            "vit_b12_ug": 0.0, "folate_ug": 66.61, "omega3_mg": 0.0,
        },
    },
    # INDB 'Boiled rice (Uble chawal)' - cooked, as eaten
    {
        "name": "Cooked white rice",
        "aliases": ["rice", "boiled rice", "steamed rice", "plain rice", "sadam", "chawal"],
        "category": "rice_dish",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 cup", "grams": 150.0},
            {"label": "1 plate", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 117.19, "protein_g": 2.6, "fat_g": 0.18, "carbs_g": 25.72,
            "fibre_g": 1.25, "sugar_g": 0.22,
            "iron_mg": 0.24, "calcium_mg": 2.7, "zinc_mg": 0.36, "magnesium_mg": 8.91,
            "selenium_ug": 0.4, "iodine_ug": 0.0, "sodium_mg": 1.05, "potassium_mg": 47.33,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.03,
            "vit_b12_ug": 0.0, "folate_ug": 3.25, "omega3_mg": 0.0,
        },
    },
    # USDA SR Legacy 169704 'Rice, brown, long-grain, cooked'
    {
        "name": "Cooked brown rice",
        "aliases": ["brown rice"],
        "category": "rice_dish",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 123.0, "protein_g": 2.74, "fat_g": 0.97, "carbs_g": 25.58,
            "fibre_g": 1.6, "sugar_g": 0.24,
            "iron_mg": 0.56, "calcium_mg": 3.0, "zinc_mg": 0.71, "magnesium_mg": 39.0,
            "selenium_ug": 5.8, "iodine_ug": 0.0, "sodium_mg": 4.0, "potassium_mg": 86.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.17,
            "vit_b12_ug": 0.0, "folate_ug": 9.0, "omega3_mg": 11.0,
        },
    },
    # COMPUTED from IFCT: 30 g atta (A019) rolled and dry-griddled to a 35 g chapati, roasting
    # retention, no oil. INDB's 'Chapati/Roti' row reads 202 kcal/100 g because it counts the
    # dough water that then evaporates. Add ghee/oil separately if used.
    {
        "name": "Chapati",
        "aliases": ["roti", "phulka", "chapathi", "wheat roti"],
        "category": "indian_bread",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 chapati", "grams": 35.0},
            {"label": "2 chapati", "grams": 70.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 288.24, "protein_g": 8.61, "fat_g": 1.38, "carbs_g": 53.9,
            "fibre_g": 9.25, "sugar_g": 1.39,
            "iron_mg": 3.34, "calcium_mg": 25.19, "zinc_mg": 2.44, "magnesium_mg": 96.43,
            "selenium_ug": 38.7, "iodine_ug": 0.0, "sodium_mg": 1.4, "potassium_mg": 213.26,
            "vit_a_ug": 0.15, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.22,
            "vit_b12_ug": 0.0, "folate_ug": 18.78, "omega3_mg": 34.66,
        },
    },
    # INDB 'Plain parantha/paratha'
    {
        "name": "Paratha",
        "aliases": ["parantha", "plain paratha"],
        "category": "indian_bread",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 paratha", "grams": 60.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 298.3, "protein_g": 5.06, "fat_g": 16.86, "carbs_g": 30.69,
            "fibre_g": 5.43, "sugar_g": 0.86,
            "iron_mg": 1.98, "calcium_mg": 14.81, "zinc_mg": 1.36, "magnesium_mg": 59.91,
            "selenium_ug": 25.41, "iodine_ug": 0.0, "sodium_mg": 62.07, "potassium_mg": 148.89,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 8.07,
            "vit_b12_ug": 0.0, "folate_ug": 13.98, "omega3_mg": 0.0,
        },
    },
    # PROXY: INDB 'Plain parantha/paratha'. Malabar parotta is maida-based and more
    # layered/oily, so real kcal and fat are likely HIGHER than these atta-paratha values.
    {
        "name": "Parota",
        "aliases": ["malabar parotta", "kerala parotta", "barotta"],
        "category": "indian_bread",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 parota", "grams": 70.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 298.3, "protein_g": 5.06, "fat_g": 16.86, "carbs_g": 30.69,
            "fibre_g": 5.43, "sugar_g": 0.86,
            "iron_mg": 1.98, "calcium_mg": 14.81, "zinc_mg": 1.36, "magnesium_mg": 59.91,
            "selenium_ug": 25.41, "iodine_ug": 0.0, "sodium_mg": 62.07, "potassium_mg": 148.89,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 8.07,
            "vit_b12_ug": 0.0, "folate_ug": 13.98, "omega3_mg": 0.0,
        },
    },
    # COMPUTED from IFCT: per 30 g poori - atta 20 g + 5 g absorbed oil, frying retention.
    # INDB's row counts the whole frying pan of oil and reads 738 kcal/100 g (921 kcal for
    # 'one poori'), which is unusable.
    {
        "name": "Poori",
        "aliases": ["puri", "poori bhaji bread"],
        "category": "indian_bread",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 poori", "grams": 30.0},
            {"label": "2 poori", "grams": 60.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 363.51, "protein_g": 6.69, "fat_g": 17.69, "carbs_g": 40.64,
            "fibre_g": 7.19, "sugar_g": 1.08,
            "iron_mg": 2.73, "calcium_mg": 20.63, "zinc_mg": 1.8, "magnesium_mg": 83.33,
            "selenium_ug": 33.64, "iodine_ug": 0.0, "sodium_mg": 1.29, "potassium_mg": 186.6,
            "vit_a_ug": 0.13, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.14,
            "vit_b12_ug": 0.0, "folate_ug": 12.66, "omega3_mg": 22.47,
        },
    },
    # USDA SR Legacy 172688 'Bread, whole-wheat, commercially prepared'
    {
        "name": "Whole wheat bread",
        "aliases": ["brown bread", "wheat bread", "atta bread"],
        "category": "grain_staple",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 slice", "grams": 28.0},
            {"label": "2 slices", "grams": 56.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 252.0, "protein_g": 12.45, "fat_g": 3.5, "carbs_g": 42.71,
            "fibre_g": 6.0, "sugar_g": 4.34,
            "iron_mg": 2.47, "calcium_mg": 161.0, "zinc_mg": 1.77, "magnesium_mg": 75.0,
            "selenium_ug": 25.7, "iodine_ug": 0.0, "sodium_mg": 455.0, "potassium_mg": 254.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 2.66,
            "vit_b12_ug": 0.0, "folate_ug": 42.0, "omega3_mg": 137.0,
        },
    },
    # INDB 'Vegetable biryani/biriyani'
    {
        "name": "Vegetable biryani",
        "aliases": ["veg biryani", "biriyani"],
        "category": "rice_dish",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 plate", "grams": 250.0},
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 174.61, "protein_g": 3.16, "fat_g": 9.51, "carbs_g": 18.56,
            "fibre_g": 3.31, "sugar_g": 2.14,
            "iron_mg": 0.86, "calcium_mg": 33.52, "zinc_mg": 0.5, "magnesium_mg": 24.37,
            "selenium_ug": 0.65, "iodine_ug": 0.0, "sodium_mg": 183.79, "potassium_mg": 242.5,
            "vit_a_ug": 0.7, "vit_c_mg": 13.05, "vit_d_iu": 0.0, "vit_e_mg": 4.52,
            "vit_b12_ug": 0.0, "folate_ug": 25.71, "omega3_mg": 0.0,
        },
    },
    # INDB 'Mutton biryani/biriyani'
    {
        "name": "Mutton biryani",
        "aliases": ["lamb biryani", "goat biryani"],
        "category": "rice_dish",
        "is_veg": False,
        "source": "indb",
        "household_units": [
            {"label": "1 plate", "grams": 250.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 190.76, "protein_g": 7.38, "fat_g": 7.72, "carbs_g": 22.5,
            "fibre_g": 2.42, "sugar_g": 2.39,
            "iron_mg": 1.29, "calcium_mg": 68.58, "zinc_mg": 0.46, "magnesium_mg": 19.12,
            "selenium_ug": 0.59, "iodine_ug": 0.0, "sodium_mg": 262.64, "potassium_mg": 212.05,
            "vit_a_ug": 1.01, "vit_c_mg": 4.95, "vit_d_iu": 0.0, "vit_e_mg": 1.99,
            "vit_b12_ug": 0.0, "folate_ug": 14.47, "omega3_mg": 0.0,
        },
    },
    # INDB 'Chinese fried rice'
    {
        "name": "Vegetable fried rice",
        "aliases": ["fried rice", "chinese fried rice"],
        "category": "rice_dish",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 plate", "grams": 250.0},
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 120.58, "protein_g": 4.05, "fat_g": 5.43, "carbs_g": 13.4,
            "fibre_g": 2.31, "sugar_g": 1.47,
            "iron_mg": 0.99, "calcium_mg": 34.7, "zinc_mg": 0.51, "magnesium_mg": 18.99,
            "selenium_ug": 6.13, "iodine_ug": 0.0, "sodium_mg": 248.36, "potassium_mg": 210.87,
            "vit_a_ug": 28.18, "vit_c_mg": 19.18, "vit_d_iu": 0.0, "vit_e_mg": 2.18,
            "vit_b12_ug": 0.0, "folate_ug": 38.95, "omega3_mg": 0.0,
        },
    },
    # INDB 'Plain pulao'
    {
        "name": "Plain pulao",
        "aliases": ["pulav", "pilaf", "jeera rice"],
        "category": "rice_dish",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 plate", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 140.21, "protein_g": 2.34, "fat_g": 4.62, "carbs_g": 21.82,
            "fibre_g": 1.69, "sugar_g": 1.15,
            "iron_mg": 0.41, "calcium_mg": 12.76, "zinc_mg": 0.37, "magnesium_mg": 12.3,
            "selenium_ug": 0.4, "iodine_ug": 0.0, "sodium_mg": 193.76, "potassium_mg": 74.74,
            "vit_a_ug": 0.0, "vit_c_mg": 1.11, "vit_d_iu": 0.0, "vit_e_mg": 2.2,
            "vit_b12_ug": 0.0, "folate_ug": 7.35, "omega3_mg": 0.0,
        },
    },
    # INDB 'Mixed vegetable pulao'
    {
        "name": "Vegetable pulao",
        "aliases": ["veg pulao", "mixed vegetable pulao"],
        "category": "rice_dish",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 plate", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 113.05, "protein_g": 2.72, "fat_g": 3.33, "carbs_g": 17.49,
            "fibre_g": 2.67, "sugar_g": 1.35,
            "iron_mg": 0.6, "calcium_mg": 19.61, "zinc_mg": 0.43, "magnesium_mg": 17.6,
            "selenium_ug": 0.49, "iodine_ug": 0.0, "sodium_mg": 187.92, "potassium_mg": 133.82,
            "vit_a_ug": 0.0, "vit_c_mg": 5.96, "vit_d_iu": 0.0, "vit_e_mg": 1.6,
            "vit_b12_ug": 0.0, "folate_ug": 18.39, "omega3_mg": 0.0,
        },
    },
    # INDB 'Curd rice'
    {
        "name": "Curd rice",
        "aliases": ["thayir sadam", "dahi bhaat", "perugu annam", "daddojanam"],
        "category": "rice_dish",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 plate", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 195.74, "protein_g": 5.75, "fat_g": 4.32, "carbs_g": 32.93,
            "fibre_g": 2.13, "sugar_g": 3.91,
            "iron_mg": 0.59, "calcium_mg": 101.52, "zinc_mg": 0.74, "magnesium_mg": 24.28,
            "selenium_ug": 1.83, "iodine_ug": 0.0, "sodium_mg": 213.29, "potassium_mg": 211.78,
            "vit_a_ug": 7.93, "vit_c_mg": 2.36, "vit_d_iu": 0.0, "vit_e_mg": 1.06,
            "vit_b12_ug": 0.0, "folate_ug": 13.06, "omega3_mg": 0.0,
        },
    },
    # COMPUTED from IFCT: per 150 g katori - rice 30 g + green gram dal 15 g + ghee 5 g,
    # cooked to 150 g, boiling retention. INDB's 'Plain khitchdi' row reads 57 kcal/100 g
    # because its recipe is heavily watered (it calls one small bowl 574 g).
    {
        "name": "Khichdi",
        "aliases": ["khichri", "kichdi", "plain khichdi"],
        "category": "rice_dish",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 bowl", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 127.16, "protein_g": 3.38, "fat_g": 2.86, "carbs_g": 19.86,
            "fibre_g": 1.42, "sugar_g": 0.21,
            "iron_mg": 0.47, "calcium_mg": 5.52, "zinc_mg": 0.44, "magnesium_mg": 17.42,
            "selenium_ug": 4.69, "iodine_ug": 0.0, "sodium_mg": 1.41, "potassium_mg": 103.88,
            "vit_a_ug": 0.92, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.03,
            "vit_b12_ug": 0.0, "folate_ug": 7.2, "omega3_mg": 28.75,
        },
    },
    # INDB 'Vegetable khichdi/khichri'
    {
        "name": "Vegetable khichdi",
        "aliases": ["veg khichdi", "vegetable khichri"],
        "category": "rice_dish",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 bowl", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 143.17, "protein_g": 5.61, "fat_g": 4.53, "carbs_g": 19.57,
            "fibre_g": 2.45, "sugar_g": 3.71,
            "iron_mg": 1.09, "calcium_mg": 100.54, "zinc_mg": 0.74, "magnesium_mg": 41.88,
            "selenium_ug": 5.04, "iodine_ug": 0.0, "sodium_mg": 193.55, "potassium_mg": 384.87,
            "vit_a_ug": 45.68, "vit_c_mg": 7.1, "vit_d_iu": 0.0, "vit_e_mg": 0.39,
            "vit_b12_ug": 0.0, "folate_ug": 45.51, "omega3_mg": 0.0,
        },
    },
    # INDB 'Sambar'
    {
        "name": "Sambar",
        "aliases": ["sambhar", "sambar dal"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 cup", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 96.92, "protein_g": 3.35, "fat_g": 4.38, "carbs_g": 10.57,
            "fibre_g": 3.52, "sugar_g": 3.31,
            "iron_mg": 1.24, "calcium_mg": 30.24, "zinc_mg": 0.47, "magnesium_mg": 32.16,
            "selenium_ug": 2.36, "iodine_ug": 0.0, "sodium_mg": 159.54, "potassium_mg": 298.29,
            "vit_a_ug": 0.0, "vit_c_mg": 7.91, "vit_d_iu": 0.0, "vit_e_mg": 1.04,
            "vit_b12_ug": 0.0, "folate_ug": 26.51, "omega3_mg": 0.0,
        },
    },
    # INDB 'Rasam with tamarind'
    {
        "name": "Rasam",
        "aliases": ["saaru", "chaaru", "puli rasam", "tamarind rasam"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 cup", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 26.74, "protein_g": 1.13, "fat_g": 0.88, "carbs_g": 3.37,
            "fibre_g": 1.6, "sugar_g": 0.83,
            "iron_mg": 0.59, "calcium_mg": 16.56, "zinc_mg": 0.17, "magnesium_mg": 14.66,
            "selenium_ug": 0.97, "iodine_ug": 0.0, "sodium_mg": 104.11, "potassium_mg": 130.66,
            "vit_a_ug": 0.0, "vit_c_mg": 4.43, "vit_d_iu": 0.0, "vit_e_mg": 0.33,
            "vit_b12_ug": 0.0, "folate_ug": 7.36, "omega3_mg": 0.0,
        },
    },
    # INDB 'Mixed dal'. INDB has no plain toor/arhar dal recipe; this mixed cooked dal is the
    # closest as-eaten match and carries the common toor-dal aliases.
    {
        "name": "Dal (plain cooked)",
        "aliases": ["dal", "daal", "dal tadka", "toor dal", "arhar dal", "paruppu", "dal fry"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 cup", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 61.93, "protein_g": 2.51, "fat_g": 3.1, "carbs_g": 5.79,
            "fibre_g": 1.62, "sugar_g": 0.34,
            "iron_mg": 0.78, "calcium_mg": 11.0, "zinc_mg": 0.36, "magnesium_mg": 19.72,
            "selenium_ug": 4.24, "iodine_ug": 0.0, "sodium_mg": 141.36, "potassium_mg": 144.27,
            "vit_a_ug": 0.0, "vit_c_mg": 0.37, "vit_d_iu": 0.0, "vit_e_mg": 1.36,
            "vit_b12_ug": 0.0, "folate_ug": 13.55, "omega3_mg": 0.0,
        },
    },
    # INDB 'Washed moong dal'
    {
        "name": "Moong dal (cooked)",
        "aliases": ["dhuli moong dal", "yellow moong dal", "pesara pappu"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 50.0, "protein_g": 2.68, "fat_g": 1.68, "carbs_g": 5.91,
            "fibre_g": 1.17, "sugar_g": 0.12,
            "iron_mg": 0.64, "calcium_mg": 8.48, "zinc_mg": 0.3, "magnesium_mg": 19.19,
            "selenium_ug": 5.45, "iodine_ug": 0.0, "sodium_mg": 150.64, "potassium_mg": 151.48,
            "vit_a_ug": 0.0, "vit_c_mg": 0.02, "vit_d_iu": 0.0, "vit_e_mg": 0.74,
            "vit_b12_ug": 0.0, "folate_ug": 10.1, "omega3_mg": 0.0,
        },
    },
    # INDB 'Split bengal gram dal (Channa dal)'
    {
        "name": "Chana dal (cooked)",
        "aliases": ["split bengal gram", "kadalai paruppu"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 99.67, "protein_g": 4.15, "fat_g": 4.62, "carbs_g": 9.99,
            "fibre_g": 3.72, "sugar_g": 0.98,
            "iron_mg": 1.92, "calcium_mg": 21.99, "zinc_mg": 0.77, "magnesium_mg": 29.5,
            "selenium_ug": 8.83, "iodine_ug": 0.0, "sodium_mg": 46.4, "potassium_mg": 232.72,
            "vit_a_ug": 31.95, "vit_c_mg": 4.58, "vit_d_iu": 0.0, "vit_e_mg": 0.28,
            "vit_b12_ug": 0.0, "folate_ug": 35.41, "omega3_mg": 0.0,
        },
    },
    # INDB 'Whole masoor (Masoor ki dal)'
    {
        "name": "Masoor dal (cooked)",
        "aliases": ["whole masoor", "red lentil dal", "lentil dal"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 54.05, "protein_g": 2.28, "fat_g": 2.52, "carbs_g": 5.37,
            "fibre_g": 1.98, "sugar_g": 0.67,
            "iron_mg": 0.95, "calcium_mg": 12.2, "zinc_mg": 0.35, "magnesium_mg": 12.74,
            "selenium_ug": 4.97, "iodine_ug": 0.0, "sodium_mg": 123.72, "potassium_mg": 112.96,
            "vit_a_ug": 0.0, "vit_c_mg": 3.22, "vit_d_iu": 0.0, "vit_e_mg": 1.21,
            "vit_b12_ug": 0.0, "folate_ug": 14.07, "omega3_mg": 0.0,
        },
    },
    # INDB 'Dal makhani'
    {
        "name": "Dal makhani",
        "aliases": ["makhani dal", "black dal"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 74.04, "protein_g": 3.32, "fat_g": 3.06, "carbs_g": 7.96,
            "fibre_g": 2.27, "sugar_g": 0.8,
            "iron_mg": 1.23, "calcium_mg": 20.62, "zinc_mg": 0.48, "magnesium_mg": 27.39,
            "selenium_ug": 3.15, "iodine_ug": 0.0, "sodium_mg": 41.85, "potassium_mg": 199.4,
            "vit_a_ug": 30.85, "vit_c_mg": 2.6, "vit_d_iu": 0.0, "vit_e_mg": 0.11,
            "vit_b12_ug": 0.0, "folate_ug": 21.27, "omega3_mg": 0.0,
        },
    },
    # INDB 'Kidney bean curry (Rajmah curry)'
    {
        "name": "Rajma curry",
        "aliases": ["rajma", "kidney bean curry", "rajmah"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 143.73, "protein_g": 5.95, "fat_g": 5.77, "carbs_g": 16.38,
            "fibre_g": 5.83, "sugar_g": 2.49,
            "iron_mg": 2.27, "calcium_mg": 47.87, "zinc_mg": 0.87, "magnesium_mg": 58.61,
            "selenium_ug": 5.73, "iodine_ug": 0.0, "sodium_mg": 354.6, "potassium_mg": 485.9,
            "vit_a_ug": 0.0, "vit_c_mg": 13.62, "vit_d_iu": 0.0, "vit_e_mg": 2.65,
            "vit_b12_ug": 0.0, "folate_ug": 93.63, "omega3_mg": 0.0,
        },
    },
    # INDB 'Chickpeas curry'
    {
        "name": "Chana masala",
        "aliases": ["chole", "chickpea curry", "safed channa curry", "chana curry"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 163.43, "protein_g": 6.1, "fat_g": 6.84, "carbs_g": 19.98,
            "fibre_g": 4.73, "sugar_g": 4.78,
            "iron_mg": 1.82, "calcium_mg": 30.61, "zinc_mg": 0.88, "magnesium_mg": 35.09,
            "selenium_ug": 0.11, "iodine_ug": 0.0, "sodium_mg": 357.99, "potassium_mg": 334.3,
            "vit_a_ug": 0.0, "vit_c_mg": 13.62, "vit_d_iu": 0.0, "vit_e_mg": 2.8,
            "vit_b12_ug": 0.0, "folate_ug": 153.92, "omega3_mg": 0.0,
        },
    },
    # USDA SR Legacy 173757 'Chickpeas, mature seeds, cooked, boiled, without salt'
    {
        "name": "Boiled chana",
        "aliases": ["boiled chickpeas", "kabuli chana boiled", "sundal", "boiled channa"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1/2 katori", "grams": 75.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 164.0, "protein_g": 8.86, "fat_g": 2.59, "carbs_g": 27.42,
            "fibre_g": 7.6, "sugar_g": 4.8,
            "iron_mg": 2.89, "calcium_mg": 49.0, "zinc_mg": 1.53, "magnesium_mg": 48.0,
            "selenium_ug": 3.7, "iodine_ug": 0.0, "sodium_mg": 7.0, "potassium_mg": 291.0,
            "vit_a_ug": 1.0, "vit_c_mg": 1.3, "vit_d_iu": 0.0, "vit_e_mg": 0.35,
            "vit_b12_ug": 0.0, "folate_ug": 172.0, "omega3_mg": 0.0,
        },
    },
    # PROXY: IFCT B002 'Bengal gram, whole' (dry). Dry-roasting removes little besides
    # residual moisture, so composition is close, but this is not a measured roasted value.
    {
        "name": "Roasted chana",
        "aliases": ["bhuna chana", "roasted gram", "pottukadalai", "chana dal roasted"],
        "category": "snack",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 handful", "grams": 30.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 287.05, "protein_g": 18.77, "fat_g": 5.11, "carbs_g": 39.56,
            "fibre_g": 25.22, "sugar_g": 0.99,
            "iron_mg": 6.78, "calcium_mg": 150.0, "zinc_mg": 3.37, "magnesium_mg": 160.0,
            "selenium_ug": 41.23, "iodine_ug": 0.0, "sodium_mg": 26.56, "potassium_mg": 935.0,
            "vit_a_ug": 14.33, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 1.72,
            "vit_b12_ug": 0.0, "folate_ug": 233.0, "omega3_mg": 117.0,
        },
    },
    # IFCT B021 'Red gram, dal' - RAW/DRY weight, for logging before cooking
    {
        "name": "Toor dal (dry)",
        "aliases": ["arhar dal dry", "red gram dal raw", "tur dal uncooked"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 katori dry", "grams": 90.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 330.78, "protein_g": 21.7, "fat_g": 1.56, "carbs_g": 55.23,
            "fibre_g": 9.06, "sugar_g": 2.08,
            "iron_mg": 3.9, "calcium_mg": 71.73, "zinc_mg": 2.63, "magnesium_mg": 119.0,
            "selenium_ug": 14.36, "iodine_ug": 0.0, "sodium_mg": 18.01, "potassium_mg": 1395.0,
            "vit_a_ug": 10.58, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.19,
            "vit_b12_ug": 0.0, "folate_ug": 108.0, "omega3_mg": 51.44,
        },
    },
    # USDA SR Legacy 170420 'Peas, green, cooked, boiled, drained, without salt'. Peas chat
    # adds onion/tomato/lemon/chaat masala - negligible kcal, some extra sodium.
    {
        "name": "Green peas (boiled)",
        "aliases": ["green peas", "matar", "peas chat", "pattani", "green peas chaat"],
        "category": "vegetable",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 katori", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 84.0, "protein_g": 5.36, "fat_g": 0.22, "carbs_g": 15.63,
            "fibre_g": 5.5, "sugar_g": 5.93,
            "iron_mg": 1.54, "calcium_mg": 27.0, "zinc_mg": 1.19, "magnesium_mg": 39.0,
            "selenium_ug": 1.9, "iodine_ug": 0.0, "sodium_mg": 3.0, "potassium_mg": 271.0,
            "vit_a_ug": 40.0, "vit_c_mg": 14.2, "vit_d_iu": 0.0, "vit_e_mg": 0.14,
            "vit_b12_ug": 0.0, "folate_ug": 63.0, "omega3_mg": 0.0,
        },
    },
    # INDB 'Sprouted moong salad'
    {
        "name": "Sprouted moong salad",
        "aliases": ["sprouts salad", "moong sprouts", "sprouted green gram"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 37.81, "protein_g": 2.29, "fat_g": 0.74, "carbs_g": 5.48,
            "fibre_g": 0.95, "sugar_g": 2.13,
            "iron_mg": 1.45, "calcium_mg": 54.56, "zinc_mg": 0.39, "magnesium_mg": 22.92,
            "selenium_ug": 1.73, "iodine_ug": 0.0, "sodium_mg": 116.38, "potassium_mg": 254.18,
            "vit_a_ug": 4.12, "vit_c_mg": 13.67, "vit_d_iu": 0.0, "vit_e_mg": 0.05,
            "vit_b12_ug": 0.0, "folate_ug": 24.42, "omega3_mg": 0.0,
        },
    },
    # INDB 'Soyabean curry'
    {
        "name": "Soyabean curry",
        "aliases": ["soya curry", "soybean curry"],
        "category": "dal_legume",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 163.28, "protein_g": 10.43, "fat_g": 10.19, "carbs_g": 6.76,
            "fibre_g": 7.34, "sugar_g": 2.66,
            "iron_mg": 2.79, "calcium_mg": 65.13, "zinc_mg": 1.06, "magnesium_mg": 62.61,
            "selenium_ug": 4.33, "iodine_ug": 0.0, "sodium_mg": 352.69, "potassium_mg": 563.45,
            "vit_a_ug": 0.0, "vit_c_mg": 12.62, "vit_d_iu": 0.0, "vit_e_mg": 2.93,
            "vit_b12_ug": 0.0, "folate_ug": 86.63, "omega3_mg": 0.0,
        },
    },
    # INDB 'Beans with coconut (Beans thoran)'
    {
        "name": "Beans poriyal",
        "aliases": ["poriyal", "vegetable poriyal", "beans thoran", "beans usili", "french beans poriyal", "beans with coconut"],
        "category": "vegetable",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 131.63, "protein_g": 2.62, "fat_g": 11.39, "carbs_g": 4.39,
            "fibre_g": 5.59, "sugar_g": 2.06,
            "iron_mg": 1.34, "calcium_mg": 51.92, "zinc_mg": 0.44, "magnesium_mg": 40.93,
            "selenium_ug": 0.94, "iodine_ug": 0.0, "sodium_mg": 271.65, "potassium_mg": 336.81,
            "vit_a_ug": 0.0, "vit_c_mg": 4.03, "vit_d_iu": 0.0, "vit_e_mg": 3.13,
            "vit_b12_ug": 0.0, "folate_ug": 50.73, "omega3_mg": 0.0,
        },
    },
    # PROXY: INDB 'Carrot and cabbage with coconut'. INDB has no cabbage-only poriyal; this
    # cabbage+carrot coconut stir-fry is the nearest match (so vit A is carrot-lifted).
    {
        "name": "Cabbage poriyal",
        "aliases": ["cabbage thoran", "muttaikose poriyal", "patta gobhi sabzi"],
        "category": "vegetable",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 106.61, "protein_g": 1.82, "fat_g": 8.62, "carbs_g": 4.99,
            "fibre_g": 4.52, "sugar_g": 2.36,
            "iron_mg": 0.84, "calcium_mg": 48.63, "zinc_mg": 0.29, "magnesium_mg": 26.35,
            "selenium_ug": 1.3, "iodine_ug": 0.0, "sodium_mg": 219.6, "potassium_mg": 278.73,
            "vit_a_ug": 0.0, "vit_c_mg": 20.55, "vit_d_iu": 0.0, "vit_e_mg": 2.38,
            "vit_b12_ug": 0.0, "folate_ug": 36.22, "omega3_mg": 0.0,
        },
    },
    # PROXY: same INDB 'Carrot and cabbage with coconut' row as cabbage poriyal.
    {
        "name": "Carrot poriyal",
        "aliases": ["carrot thoran", "gajar sabzi", "carrot stir fry"],
        "category": "vegetable",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 106.61, "protein_g": 1.82, "fat_g": 8.62, "carbs_g": 4.99,
            "fibre_g": 4.52, "sugar_g": 2.36,
            "iron_mg": 0.84, "calcium_mg": 48.63, "zinc_mg": 0.29, "magnesium_mg": 26.35,
            "selenium_ug": 1.3, "iodine_ug": 0.0, "sodium_mg": 219.6, "potassium_mg": 278.73,
            "vit_a_ug": 0.0, "vit_c_mg": 20.55, "vit_d_iu": 0.0, "vit_e_mg": 2.38,
            "vit_b12_ug": 0.0, "folate_ug": 36.22, "omega3_mg": 0.0,
        },
    },
    # INDB 'Potato curry (Aloo ki sabzi)'
    {
        "name": "Aloo sabzi",
        "aliases": ["potato curry", "aloo curry", "potato sabzi"],
        "category": "vegetable",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 89.56, "protein_g": 1.52, "fat_g": 4.47, "carbs_g": 10.42,
            "fibre_g": 2.42, "sugar_g": 1.58,
            "iron_mg": 0.97, "calcium_mg": 23.74, "zinc_mg": 0.31, "magnesium_mg": 25.3,
            "selenium_ug": 0.51, "iodine_ug": 0.0, "sodium_mg": 78.4, "potassium_mg": 383.45,
            "vit_a_ug": 0.0, "vit_c_mg": 20.92, "vit_d_iu": 0.0, "vit_e_mg": 2.08,
            "vit_b12_ug": 0.0, "folate_ug": 17.65, "omega3_mg": 0.0,
        },
    },
    # INDB "Okra/Lady's fingers fry"
    {
        "name": "Bhindi fry",
        "aliases": ["okra fry", "ladies finger fry", "vendakkai poriyal", "bhindi sabzi"],
        "category": "vegetable",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 110.81, "protein_g": 1.83, "fat_g": 9.27, "carbs_g": 4.5,
            "fibre_g": 3.57, "sugar_g": 1.42,
            "iron_mg": 0.88, "calcium_mg": 67.88, "zinc_mg": 0.41, "magnesium_mg": 52.6,
            "selenium_ug": 0.81, "iodine_ug": 0.0, "sodium_mg": 92.78, "potassium_mg": 233.03,
            "vit_a_ug": 0.0, "vit_c_mg": 17.48, "vit_d_iu": 0.0, "vit_e_mg": 4.82,
            "vit_b12_ug": 0.0, "folate_ug": 51.27, "omega3_mg": 0.0,
        },
    },
    # INDB 'Spinach paneer (Palak paneer)'
    {
        "name": "Palak paneer",
        "aliases": ["spinach paneer", "saag paneer"],
        "category": "vegetable",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 77.68, "protein_g": 4.03, "fat_g": 4.76, "carbs_g": 4.43,
            "fibre_g": 1.91, "sugar_g": 2.55,
            "iron_mg": 1.85, "calcium_mg": 113.25, "zinc_mg": 0.68, "magnesium_mg": 54.13,
            "selenium_ug": 4.23, "iodine_ug": 0.0, "sodium_mg": 166.87, "potassium_mg": 386.63,
            "vit_a_ug": 0.0, "vit_c_mg": 20.38, "vit_d_iu": 0.0, "vit_e_mg": 1.83,
            "vit_b12_ug": 0.0, "folate_ug": 90.37, "omega3_mg": 0.0,
        },
    },
    # IFCT C033 'Spinach' - RAW. Sauteed palak without added fat is close to this per raw
    # gram; weigh raw for best accuracy.
    {
        "name": "Spinach (palak), raw",
        "aliases": ["palak", "spinach", "pasalai keerai"],
        "category": "vegetable",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 cup chopped", "grams": 30.0},
            {"label": "1 bunch", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 24.38, "protein_g": 2.14, "fat_g": 0.64, "carbs_g": 2.05,
            "fibre_g": 2.38, "sugar_g": 0.24,
            "iron_mg": 2.95, "calcium_mg": 82.29, "zinc_mg": 0.46, "magnesium_mg": 86.97,
            "selenium_ug": 2.09, "iodine_ug": 0.0, "sodium_mg": 42.55, "potassium_mg": 625.0,
            "vit_a_ug": 217.08, "vit_c_mg": 30.28, "vit_d_iu": 0.0, "vit_e_mg": 1.29,
            "vit_b12_ug": 0.0, "folate_ug": 142.0, "omega3_mg": 220.0,
        },
    },
    # IFCT C002 'Amaranth leaves, green' - RAW. Log the raw weight of the greens used.
    {
        "name": "Amaranth leaves, raw",
        "aliases": ["amaranth leaves", "thandu keerai", "chaulai", "mulai keerai", "red amaranth"],
        "category": "vegetable",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 cup chopped", "grams": 40.0},
            {"label": "1 bunch", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 30.59, "protein_g": 3.29, "fat_g": 0.65, "carbs_g": 2.28,
            "fibre_g": 4.41, "sugar_g": 0.32,
            "iron_mg": 4.64, "calcium_mg": 330.0, "zinc_mg": 0.86, "magnesium_mg": 194.0,
            "selenium_ug": 20.97, "iodine_ug": 0.0, "sodium_mg": 16.08, "potassium_mg": 572.0,
            "vit_a_ug": 712.75, "vit_c_mg": 83.54, "vit_d_iu": 0.0, "vit_e_mg": 0.44,
            "vit_b12_ug": 0.0, "folate_ug": 70.33, "omega3_mg": 247.0,
        },
    },
    # IFCT C019 'Drumstick leaves' - RAW. Very high in beta-carotene, calcium and iron.
    {
        "name": "Drumstick leaves, raw",
        "aliases": ["moringa leaves", "murungai keerai", "sahjan patta", "moringa"],
        "category": "vegetable",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 cup", "grams": 25.0},
            {"label": "1 katori cooked (from 100 g raw)", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 67.4, "protein_g": 6.41, "fat_g": 1.64, "carbs_g": 5.62,
            "fibre_g": 8.21, "sugar_g": 0.02,
            "iron_mg": 4.56, "calcium_mg": 314.0, "zinc_mg": 0.72, "magnesium_mg": 97.09,
            "selenium_ug": 5.95, "iodine_ug": 0.0, "sodium_mg": 9.34, "potassium_mg": 397.0,
            "vit_a_ug": 1461.83, "vit_c_mg": 108.0, "vit_d_iu": 0.0, "vit_e_mg": 0.31,
            "vit_b12_ug": 0.0, "folate_ug": 42.89, "omega3_mg": 446.0,
        },
    },
    # IFCT D046 'Drumstick'
    {
        "name": "Drumstick (pods)",
        "aliases": ["moringa pod", "murungakkai", "sahjan"],
        "category": "vegetable",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 drumstick", "grams": 50.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 29.4, "protein_g": 2.62, "fat_g": 0.12, "carbs_g": 3.76,
            "fibre_g": 6.83, "sugar_g": 1.47,
            "iron_mg": 0.73, "calcium_mg": 33.3, "zinc_mg": 0.31, "magnesium_mg": 38.1,
            "selenium_ug": 3.12, "iodine_ug": 0.0, "sodium_mg": 22.38, "potassium_mg": 419.0,
            "vit_a_ug": 1.44, "vit_c_mg": 71.86, "vit_d_iu": 0.0, "vit_e_mg": 0.31,
            "vit_b12_ug": 0.0, "folate_ug": 62.75, "omega3_mg": 8.07,
        },
    },
    # USDA SR Legacy 168484 'Sweet potato, cooked, boiled, without skin'
    {
        "name": "Boiled sweet potato",
        "aliases": ["sweet potato", "shakarkandi", "sarkarai valli kizhangu"],
        "category": "vegetable",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 medium", "grams": 130.0},
            {"label": "1 katori cubes", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 76.0, "protein_g": 1.37, "fat_g": 0.14, "carbs_g": 17.72,
            "fibre_g": 2.5, "sugar_g": 5.74,
            "iron_mg": 0.72, "calcium_mg": 27.0, "zinc_mg": 0.2, "magnesium_mg": 18.0,
            "selenium_ug": 0.2, "iodine_ug": 0.0, "sodium_mg": 27.0, "potassium_mg": 230.0,
            "vit_a_ug": 787.0, "vit_c_mg": 12.8, "vit_d_iu": 0.0, "vit_e_mg": 0.94,
            "vit_b12_ug": 0.0, "folate_ug": 6.0, "omega3_mg": 0.0,
        },
    },
    # IFCT M004 'Egg, poultry, whole, boiled'. B12 from USDA SR 173424 (egg, hard-boiled);
    # iodine from USDA Foundation Foods 'Eggs, Grade A, Large, egg whole' - neither IFCT nor
    # INDB measures B12 or iodine.
    {
        "name": "Boiled egg",
        "aliases": ["egg", "hard boiled egg", "ubla anda", "muttai"],
        "category": "egg",
        "is_veg": False,
        "source": "ifct",
        "household_units": [
            {"label": "1 medium egg", "grams": 50.0},
            {"label": "2 eggs", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 147.71, "protein_g": 13.43, "fat_g": 10.54, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 1.87, "calcium_mg": 55.12, "zinc_mg": 1.31, "magnesium_mg": 13.76,
            "selenium_ug": 46.12, "iodine_ug": 49.1, "sodium_mg": 121.0, "potassium_mg": 127.0,
            "vit_a_ug": 181.1, "vit_c_mg": 0.0, "vit_d_iu": 29.6, "vit_e_mg": 1.34,
            "vit_b12_ug": 1.11, "folate_ug": 48.25, "omega3_mg": 94.66,
        },
    },
    # IFCT M007 'Egg, poultry, omlet'. B12 from USDA SR 172185 'Egg, whole, cooked, omelet'.
    # Iodine left 0.0 (no measured value for a cooked omelette).
    {
        "name": "Egg omelette",
        "aliases": ["omelette", "omelet", "anda omelette", "muttai omelette"],
        "category": "egg",
        "is_veg": False,
        "source": "ifct",
        "household_units": [
            {"label": "1 egg omelette", "grams": 60.0},
            {"label": "2 egg omelette", "grams": 120.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 169.69, "protein_g": 16.53, "fat_g": 11.6, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 2.16, "calcium_mg": 53.26, "zinc_mg": 1.31, "magnesium_mg": 14.84,
            "selenium_ug": 42.18, "iodine_ug": 0.0, "sodium_mg": 169.0, "potassium_mg": 163.0,
            "vit_a_ug": 181.95, "vit_c_mg": 0.0, "vit_d_iu": 119.2, "vit_e_mg": 1.88,
            "vit_b12_ug": 1.06, "folate_ug": 37.66, "omega3_mg": 81.12,
        },
    },
    # INDB 'Egg curry (Anda curry)'. B12/iodine/omega-3 read 0.0 - INDB does not measure them
    # and they cannot be split out of a composite recipe. Real B12 is roughly 0.5-0.9 ug per
    # katori from the egg.
    {
        "name": "Egg curry",
        "aliases": ["anda curry", "muttai kulambu", "egg masala"],
        "category": "egg",
        "is_veg": False,
        "source": "indb",
        "household_units": [
            {"label": "1 katori (1 egg)", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 117.52, "protein_g": 5.38, "fat_g": 8.81, "carbs_g": 4.03,
            "fibre_g": 2.09, "sugar_g": 1.9,
            "iron_mg": 1.52, "calcium_mg": 41.59, "zinc_mg": 0.63, "magnesium_mg": 21.72,
            "selenium_ug": 13.53, "iodine_ug": 0.0, "sodium_mg": 142.12, "potassium_mg": 198.53,
            "vit_a_ug": 65.32, "vit_c_mg": 12.55, "vit_d_iu": 0.0, "vit_e_mg": 3.22,
            "vit_b12_ug": 0.0, "folate_ug": 29.51, "omega3_mg": 0.0,
        },
    },
    # INDB 'Scrambled egg (Ande ki bhurji)'
    {
        "name": "Egg bhurji",
        "aliases": ["scrambled egg", "anda bhurji", "muttai poriyal"],
        "category": "egg",
        "is_veg": False,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 155.97, "protein_g": 10.29, "fat_g": 12.21, "carbs_g": 1.35,
            "fibre_g": 0.24, "sugar_g": 1.08,
            "iron_mg": 1.42, "calcium_mg": 64.59, "zinc_mg": 0.96, "magnesium_mg": 12.41,
            "selenium_ug": 29.18, "iodine_ug": 0.0, "sodium_mg": 374.66, "potassium_mg": 136.01,
            "vit_a_ug": 196.17, "vit_c_mg": 0.43, "vit_d_iu": 0.0, "vit_e_mg": 1.24,
            "vit_b12_ug": 0.0, "folate_ug": 36.89, "omega3_mg": 0.0,
        },
    },
    # IFCT L002 'Milk, whole, Cow'. B12 from USDA SR 171265 and iodine from USDA Foundation
    # Foods 'Milk, whole, 3.25% milkfat'. Dairy iodine tracks local feed and udder-sanitiser
    # practice, so the US iodine figure is indicative only.
    {
        "name": "Milk (cow, whole)",
        "aliases": ["milk", "paal", "doodh", "cow milk"],
        "category": "dairy",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 cup (200 ml)", "grams": 200.0},
            {"label": "1 glass", "grams": 250.0},
            {"label": "100 ml", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 72.9, "protein_g": 3.26, "fat_g": 4.48, "carbs_g": 4.94,
            "fibre_g": 0.0, "sugar_g": 4.89,
            "iron_mg": 0.15, "calcium_mg": 118.0, "zinc_mg": 0.33, "magnesium_mg": 8.28,
            "selenium_ug": 0.95, "iodine_ug": 37.9, "sodium_mg": 25.46, "potassium_mg": 115.0,
            "vit_a_ug": 1.14, "vit_c_mg": 2.01, "vit_d_iu": 48.8, "vit_e_mg": 0.22,
            "vit_b12_ug": 0.45, "folate_ug": 7.03, "omega3_mg": 20.52,
        },
    },
    # IFCT L001 'Milk, whole, Buffalo'. B12 from USDA SR 171280 'Milk, indian buffalo'.
    {
        "name": "Milk (buffalo, whole)",
        "aliases": ["buffalo milk", "bhains ka doodh"],
        "category": "dairy",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 cup (200 ml)", "grams": 200.0},
            {"label": "100 ml", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 107.31, "protein_g": 3.68, "fat_g": 6.58, "carbs_g": 8.39,
            "fibre_g": 0.0, "sugar_g": 5.34,
            "iron_mg": 0.16, "calcium_mg": 121.0, "zinc_mg": 0.3, "magnesium_mg": 10.05,
            "selenium_ug": 1.45, "iodine_ug": 0.0, "sodium_mg": 30.1, "potassium_mg": 109.0,
            "vit_a_ug": 0.7, "vit_c_mg": 2.37, "vit_d_iu": 65.2, "vit_e_mg": 0.19,
            "vit_b12_ug": 0.36, "folate_ug": 8.57, "omega3_mg": 34.76,
        },
    },
    # USDA SR Legacy 171284 'Yogurt, plain, whole milk'; iodine from USDA Foundation Foods
    # 'Yogurt, plain, whole milk'. IFCT 2017 has no curd entry.
    {
        "name": "Curd",
        "aliases": ["dahi", "yogurt", "thayir", "plain curd"],
        "category": "dairy",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "1 cup", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 61.0, "protein_g": 3.47, "fat_g": 3.25, "carbs_g": 4.66,
            "fibre_g": 0.0, "sugar_g": 4.66,
            "iron_mg": 0.05, "calcium_mg": 121.0, "zinc_mg": 0.59, "magnesium_mg": 12.0,
            "selenium_ug": 2.2, "iodine_ug": 32.33, "sodium_mg": 46.0, "potassium_mg": 155.0,
            "vit_a_ug": 27.0, "vit_c_mg": 0.5, "vit_d_iu": 2.0, "vit_e_mg": 0.06,
            "vit_b12_ug": 0.37, "folate_ug": 7.0, "omega3_mg": 0.0,
        },
    },
    # IFCT L003 'Paneer'. B12 from USDA SR 170851 'Cheese, ricotta, whole milk' and iodine
    # from USDA Foundation Foods 'Cottage cheese, full fat' - both are fresh whole-milk
    # cheeses, but neither is paneer, so treat these two as approximate.
    {
        "name": "Paneer",
        "aliases": ["cottage cheese", "indian cottage cheese"],
        "category": "dairy",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "50 g", "grams": 50.0},
            {"label": "1 katori cubes", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 257.89, "protein_g": 18.86, "fat_g": 14.78, "carbs_g": 12.41,
            "fibre_g": 0.0, "sugar_g": 11.57,
            "iron_mg": 0.9, "calcium_mg": 476.0, "zinc_mg": 2.74, "magnesium_mg": 26.62,
            "selenium_ug": 23.14, "iodine_ug": 45.69, "sodium_mg": 18.04, "potassium_mg": 63.53,
            "vit_a_ug": 0.37, "vit_c_mg": 0.0, "vit_d_iu": 5.2, "vit_e_mg": 0.02,
            "vit_b12_ug": 0.34, "folate_ug": 93.31, "omega3_mg": 233.0,
        },
    },
    # IFCT T013 'Ghee'
    {
        "name": "Ghee",
        "aliases": ["clarified butter", "nei", "desi ghee"],
        "category": "fat_oil",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 tsp", "grams": 5.0},
            {"label": "1 tbsp", "grams": 15.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 900.0, "protein_g": 0.0, "fat_g": 100.0, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 0.0, "calcium_mg": 0.0, "zinc_mg": 0.0, "magnesium_mg": 0.0,
            "selenium_ug": 0.0, "iodine_ug": 0.0, "sodium_mg": 0.0, "potassium_mg": 0.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.0,
            "vit_b12_ug": 0.0, "folate_ug": 0.0, "omega3_mg": 550.0,
        },
    },
    # COMPUTED: one 150 ml cup - cow milk 50 ml (IFCT L002) + sugar 5 g (USDA 169655) + water.
    # Tea leaves add no measurable macro. B12 and iodine are the milk's share of the USDA
    # figures used on the milk entry. INDB's 'Hot tea' row is much weaker (16 kcal/100 g).
    # Adjust if she takes it stronger or without sugar.
    {
        "name": "Tea with milk",
        "aliases": ["chai", "milk tea", "garam chai"],
        "category": "beverage",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 cup", "grams": 150.0},
            {"label": "1 tumbler", "grams": 200.0},
            {"label": "100 ml", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 35.34, "protein_g": 0.92, "fat_g": 1.19, "carbs_g": 4.73,
            "fibre_g": 0.0, "sugar_g": 4.46,
            "iron_mg": 0.05, "calcium_mg": 37.4, "zinc_mg": 0.1, "magnesium_mg": 2.48,
            "selenium_ug": 0.3, "iodine_ug": 12.6, "sodium_mg": 8.09, "potassium_mg": 26.88,
            "vit_a_ug": 0.34, "vit_c_mg": 0.4, "vit_d_iu": 16.27, "vit_e_mg": 0.07,
            "vit_b12_ug": 0.15, "folate_ug": 1.52, "omega3_mg": 5.47,
        },
    },
    # COMPUTED: one 150 ml South Indian filter coffee - cow milk 60 ml + sugar 6 g +
    # decoction. B12/iodine are the milk's share, as for tea.
    {
        "name": "Coffee with milk",
        "aliases": ["coffee", "filter coffee", "kaapi", "milk coffee"],
        "category": "beverage",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 cup", "grams": 150.0},
            {"label": "1 tumbler", "grams": 200.0},
            {"label": "100 ml", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 42.41, "protein_g": 1.11, "fat_g": 1.43, "carbs_g": 5.68,
            "fibre_g": 0.0, "sugar_g": 5.35,
            "iron_mg": 0.06, "calcium_mg": 44.88, "zinc_mg": 0.12, "magnesium_mg": 2.98,
            "selenium_ug": 0.36, "iodine_ug": 15.2, "sodium_mg": 9.71, "potassium_mg": 32.26,
            "vit_a_ug": 0.41, "vit_c_mg": 0.48, "vit_d_iu": 19.52, "vit_e_mg": 0.08,
            "vit_b12_ug": 0.18, "folate_ug": 1.83, "omega3_mg": 6.57,
        },
    },
    # COMPUTED: curd 120 g (USDA 171284) + sugar 12 g + water 60 ml, blended to 192 g. Iodine
    # is the curd's share of the USDA Foundation Foods yogurt figure.
    {
        "name": "Sweet lassi",
        "aliases": ["meethi lassi", "lassi"],
        "category": "beverage",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 glass", "grams": 200.0},
            {"label": "100 ml", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 62.31, "protein_g": 2.17, "fat_g": 2.03, "carbs_g": 9.16,
            "fibre_g": 0.0, "sugar_g": 9.15,
            "iron_mg": 0.03, "calcium_mg": 75.69, "zinc_mg": 0.37, "magnesium_mg": 7.5,
            "selenium_ug": 1.41, "iodine_ug": 20.2, "sodium_mg": 28.81, "potassium_mg": 97.0,
            "vit_a_ug": 16.88, "vit_c_mg": 0.31, "vit_d_iu": 1.25, "vit_e_mg": 0.04,
            "vit_b12_ug": 0.23, "folate_ug": 4.38, "omega3_mg": 0.0,
        },
    },
    # COMPUTED: curd 100 g (USDA 171284) whisked with 100 ml water, which is what Indian
    # chaas/neer mor actually is. Note this is NOT the same food as USDA's cultured
    # 'buttermilk' (62 kcal/100 g), which would roughly double these numbers.
    {
        "name": "Buttermilk",
        "aliases": ["chaas", "moru", "neer mor", "majjige", "salted lassi", "namkeen lassi"],
        "category": "beverage",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 glass", "grams": 200.0},
            {"label": "1 cup", "grams": 150.0},
            {"label": "100 ml", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 30.5, "protein_g": 1.74, "fat_g": 1.62, "carbs_g": 2.33,
            "fibre_g": 0.0, "sugar_g": 2.33,
            "iron_mg": 0.03, "calcium_mg": 60.5, "zinc_mg": 0.29, "magnesium_mg": 6.0,
            "selenium_ug": 1.1, "iodine_ug": 16.2, "sodium_mg": 23.0, "potassium_mg": 77.5,
            "vit_a_ug": 13.5, "vit_c_mg": 0.25, "vit_d_iu": 1.0, "vit_e_mg": 0.03,
            "vit_b12_ug": 0.18, "folate_ug": 3.5, "omega3_mg": 0.0,
        },
    },
    # USDA SR Legacy 171477 'Chicken, broilers or fryers, breast, meat only, cooked, roasted'
    # - cooked weight
    {
        "name": "Roasted chicken breast",
        "aliases": ["chicken", "chicken breast", "oven roasted chicken", "grilled chicken", "chicken breast cooked"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "usda",
        "household_units": [
            {"label": "1 piece (100 g)", "grams": 100.0},
            {"label": "1 small piece", "grams": 60.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 165.0, "protein_g": 31.02, "fat_g": 3.57, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 1.04, "calcium_mg": 15.0, "zinc_mg": 1.0, "magnesium_mg": 29.0,
            "selenium_ug": 27.6, "iodine_ug": 0.0, "sodium_mg": 74.0, "potassium_mg": 256.0,
            "vit_a_ug": 6.0, "vit_c_mg": 0.0, "vit_d_iu": 5.0, "vit_e_mg": 0.27,
            "vit_b12_ug": 0.34, "folate_ug": 4.0, "omega3_mg": 40.0,
        },
    },
    # USDA SR Legacy 172388 'Chicken, thigh, meat only, cooked, roasted'
    {
        "name": "Chicken thigh (cooked)",
        "aliases": ["chicken thigh", "chicken leg meat"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "usda",
        "household_units": [
            {"label": "1 thigh", "grams": 80.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 179.0, "protein_g": 24.76, "fat_g": 8.15, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 1.13, "calcium_mg": 9.0, "zinc_mg": 1.92, "magnesium_mg": 24.0,
            "selenium_ug": 27.1, "iodine_ug": 0.0, "sodium_mg": 106.0, "potassium_mg": 269.0,
            "vit_a_ug": 8.0, "vit_c_mg": 0.0, "vit_d_iu": 7.0, "vit_e_mg": 0.18,
            "vit_b12_ug": 0.42, "folate_ug": 5.0, "omega3_mg": 79.0,
        },
    },
    # INDB 'Chicken curry'
    {
        "name": "Chicken curry",
        "aliases": ["chicken masala", "chicken gravy", "kozhi kulambu"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 129.22, "protein_g": 11.79, "fat_g": 7.57, "carbs_g": 3.38,
            "fibre_g": 1.41, "sugar_g": 1.79,
            "iron_mg": 0.87, "calcium_mg": 27.29, "zinc_mg": 0.56, "magnesium_mg": 21.89,
            "selenium_ug": 9.56, "iodine_ug": 0.0, "sodium_mg": 108.0, "potassium_mg": 253.49,
            "vit_a_ug": 4.07, "vit_c_mg": 6.77, "vit_d_iu": 0.0, "vit_e_mg": 1.56,
            "vit_b12_ug": 0.0, "folate_ug": 15.61, "omega3_mg": 0.0,
        },
    },
    # INDB 'Tandoori chicken'
    {
        "name": "Tandoori chicken",
        "aliases": ["tandoori murgh", "grilled tandoori chicken"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "indb",
        "household_units": [
            {"label": "1 piece", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 145.2, "protein_g": 16.26, "fat_g": 7.93, "carbs_g": 2.34,
            "fibre_g": 0.5, "sugar_g": 1.58,
            "iron_mg": 0.9, "calcium_mg": 44.33, "zinc_mg": 0.71, "magnesium_mg": 22.02,
            "selenium_ug": 13.24, "iodine_ug": 0.0, "sodium_mg": 158.0, "potassium_mg": 287.21,
            "vit_a_ug": 8.72, "vit_c_mg": 2.74, "vit_d_iu": 0.0, "vit_e_mg": 0.77,
            "vit_b12_ug": 0.0, "folate_ug": 12.68, "omega3_mg": 0.0,
        },
    },
    # COMPUTED: per 105 g - chicken breast 100 g (IFCT N003) + refined flour 15 g + 12 g
    # absorbed oil + curd 10 g (USDA 171284), frying retention. INDB has no Chicken 65 and its
    # 'Chicken pakora' row reads 590 kcal/100 g (whole frying pan of oil). Absorbed-oil
    # assumption dominates the fat figure here.
    {
        "name": "Chicken 65",
        "aliases": ["chicken sixty five", "chicken fry", "chicken pakora"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "ifct",
        "household_units": [
            {"label": "5 pieces", "grams": 100.0},
            {"label": "1 plate", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 319.17, "protein_g": 21.45, "fat_g": 20.42, "carbs_g": 10.5,
            "fibre_g": 0.37, "sugar_g": 0.63,
            "iron_mg": 1.05, "calcium_mg": 26.73, "zinc_mg": 0.88, "magnesium_mg": 24.77,
            "selenium_ug": 16.99, "iodine_ug": 0.0, "sodium_mg": 37.58, "potassium_mg": 285.17,
            "vit_a_ug": 8.3, "vit_c_mg": 0.03, "vit_d_iu": 91.22, "vit_e_mg": 0.23,
            "vit_b12_ug": 0.04, "folate_ug": 8.41, "omega3_mg": 10.89,
        },
    },
    # USDA SR Legacy 171956 'Fish, cod, Atlantic, cooked, dry heat' as a generic lean white
    # fish; iodine from USDA Foundation Foods 'Fish, cod, Atlantic, wild caught'. Iodine in
    # fish varies enormously by species - cod is at the high end.
    {
        "name": "Baked fish",
        "aliases": ["grilled fish", "fish fry baked", "oven baked fish", "cooked fish"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "usda",
        "household_units": [
            {"label": "1 fillet", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 105.0, "protein_g": 22.83, "fat_g": 0.86, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 0.49, "calcium_mg": 14.0, "zinc_mg": 0.58, "magnesium_mg": 42.0,
            "selenium_ug": 37.6, "iodine_ug": 113.7, "sodium_mg": 78.0, "potassium_mg": 244.0,
            "vit_a_ug": 14.0, "vit_c_mg": 1.0, "vit_d_iu": 46.0, "vit_e_mg": 0.81,
            "vit_b12_ug": 1.05, "folate_ug": 8.0, "omega3_mg": 171.0,
        },
    },
    # INDB 'Fish curry (Machli curry)'
    {
        "name": "Fish curry",
        "aliases": ["meen kulambu", "machli curry", "fish gravy"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 111.13, "protein_g": 8.76, "fat_g": 6.69, "carbs_g": 3.77,
            "fibre_g": 1.89, "sugar_g": 2.02,
            "iron_mg": 1.09, "calcium_mg": 52.06, "zinc_mg": 0.53, "magnesium_mg": 24.11,
            "selenium_ug": 20.64, "iodine_ug": 0.0, "sodium_mg": 184.71, "potassium_mg": 241.98,
            "vit_a_ug": 2.63, "vit_c_mg": 8.85, "vit_d_iu": 0.0, "vit_e_mg": 3.64,
            "vit_b12_ug": 0.0, "folate_ug": 15.93, "omega3_mg": 0.0,
        },
    },
    # USDA SR Legacy 175180 'Crustaceans, shrimp, cooked'; iodine from USDA Foundation Foods
    # 'Crustaceans, shrimp, farm raised, raw'
    {
        "name": "Prawns (cooked)",
        "aliases": ["prawn", "shrimp", "eral", "jhinga"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "usda",
        "household_units": [
            {"label": "1 katori", "grams": 100.0},
            {"label": "6 prawns", "grams": 60.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 99.0, "protein_g": 23.98, "fat_g": 0.28, "carbs_g": 0.2,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 0.51, "calcium_mg": 70.0, "zinc_mg": 1.64, "magnesium_mg": 39.0,
            "selenium_ug": 0.0, "iodine_ug": 13.64, "sodium_mg": 111.0, "potassium_mg": 259.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.0,
            "vit_b12_ug": 0.0, "folate_ug": 0.0, "omega3_mg": 32.0,
        },
    },
    # USDA SR Legacy 171986 'Fish, tuna, light, canned in water, without salt, drained'
    {
        "name": "Canned tuna (in water)",
        "aliases": ["tuna", "tinned tuna", "tuna in water"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "usda",
        "household_units": [
            {"label": "1 tin drained", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 116.0, "protein_g": 25.51, "fat_g": 0.82, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 1.53, "calcium_mg": 11.0, "zinc_mg": 0.77, "magnesium_mg": 27.0,
            "selenium_ug": 80.4, "iodine_ug": 0.0, "sodium_mg": 50.0, "potassium_mg": 237.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.0,
            "vit_b12_ug": 2.99, "folate_ug": 4.0, "omega3_mg": 279.0,
        },
    },
    # USDA SR Legacy 175304 'Game meat, goat, cooked, roasted'. Indian mutton is goat, which
    # this matches; trimmed lean cut.
    {
        "name": "Mutton (goat, cooked)",
        "aliases": ["mutton", "goat meat", "aatu kari"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "usda",
        "household_units": [
            {"label": "1 katori", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 143.0, "protein_g": 27.1, "fat_g": 3.03, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 3.73, "calcium_mg": 17.0, "zinc_mg": 5.27, "magnesium_mg": 0.0,
            "selenium_ug": 11.8, "iodine_ug": 0.0, "sodium_mg": 86.0, "potassium_mg": 405.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.34,
            "vit_b12_ug": 1.19, "folate_ug": 5.0, "omega3_mg": 0.0,
        },
    },
    # INDB 'Mutton korma'
    {
        "name": "Mutton korma",
        "aliases": ["mutton curry", "goat curry", "mutton masala"],
        "category": "meat_fish",
        "is_veg": False,
        "source": "indb",
        "household_units": [
            {"label": "1 katori", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 115.64, "protein_g": 7.09, "fat_g": 8.54, "carbs_g": 2.53,
            "fibre_g": 0.78, "sugar_g": 1.64,
            "iron_mg": 1.09, "calcium_mg": 79.07, "zinc_mg": 0.16, "magnesium_mg": 8.63,
            "selenium_ug": 0.25, "iodine_ug": 0.0, "sodium_mg": 56.94, "potassium_mg": 165.87,
            "vit_a_ug": 18.17, "vit_c_mg": 1.51, "vit_d_iu": 0.0, "vit_e_mg": 1.4,
            "vit_b12_ug": 0.0, "folate_ug": 8.68, "omega3_mg": 0.0,
        },
    },
    # IFCT H001 'Almond'
    {
        "name": "Almonds",
        "aliases": ["badam", "almond", "vadam"],
        "category": "nuts_seeds",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "10 almonds", "grams": 12.0},
            {"label": "1 handful", "grams": 25.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 609.23, "protein_g": 18.41, "fat_g": 58.49, "carbs_g": 3.04,
            "fibre_g": 13.06, "sugar_g": 2.23,
            "iron_mg": 4.59, "calcium_mg": 228.0, "zinc_mg": 3.5, "magnesium_mg": 318.0,
            "selenium_ug": 3.61, "iodine_ug": 0.0, "sodium_mg": 1.5, "potassium_mg": 699.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.74, "vit_d_iu": 0.0, "vit_e_mg": 25.86,
            "vit_b12_ug": 0.0, "folate_ug": 36.46, "omega3_mg": 32.04,
        },
    },
    # IFCT H021 'Walnut'
    {
        "name": "Walnuts",
        "aliases": ["akhrot", "walnut", "wallnut"],
        "category": "nuts_seeds",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "4 halves", "grams": 10.0},
            {"label": "1 handful", "grams": 25.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 671.37, "protein_g": 14.92, "fat_g": 64.27, "carbs_g": 10.14,
            "fibre_g": 5.39, "sugar_g": 3.22,
            "iron_mg": 3.21, "calcium_mg": 105.0, "zinc_mg": 2.94, "magnesium_mg": 180.0,
            "selenium_ug": 6.53, "iodine_ug": 0.0, "sodium_mg": 1.33, "potassium_mg": 457.0,
            "vit_a_ug": 0.79, "vit_c_mg": 0.88, "vit_d_iu": 0.0, "vit_e_mg": 4.12,
            "vit_b12_ug": 0.0, "folate_ug": 57.95, "omega3_mg": 8710.0,
        },
    },
    # IFCT H005 'Cashew nut'
    {
        "name": "Cashews",
        "aliases": ["kaju", "cashew", "mundhiri"],
        "category": "nuts_seeds",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "10 cashews", "grams": 15.0},
            {"label": "1 handful", "grams": 25.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 582.7, "protein_g": 18.78, "fat_g": 45.2, "carbs_g": 25.46,
            "fibre_g": 3.86, "sugar_g": 3.11,
            "iron_mg": 5.95, "calcium_mg": 34.0, "zinc_mg": 5.34, "magnesium_mg": 307.0,
            "selenium_ug": 13.08, "iodine_ug": 0.0, "sodium_mg": 9.0, "potassium_mg": 635.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 1.05,
            "vit_b12_ug": 0.0, "folate_ug": 25.2, "omega3_mg": 55.04,
        },
    },
    # IFCT H012 'Ground nut'
    {
        "name": "Peanuts",
        "aliases": ["groundnut", "moongphali", "verkadalai", "peanut"],
        "category": "nuts_seeds",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 handful", "grams": 30.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 520.08, "protein_g": 23.65, "fat_g": 39.63, "carbs_g": 17.27,
            "fibre_g": 10.38, "sugar_g": 4.42,
            "iron_mg": 3.44, "calcium_mg": 54.0, "zinc_mg": 3.18, "magnesium_mg": 197.0,
            "selenium_ug": 3.41, "iodine_ug": 0.0, "sodium_mg": 12.21, "potassium_mg": 679.0,
            "vit_a_ug": 1.9, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.28,
            "vit_b12_ug": 0.0, "folate_ug": 90.87, "omega3_mg": 0.0,
        },
    },
    # USDA SR Legacy 170554 'Seeds, chia seeds, dried'. Not in IFCT 2017.
    {
        "name": "Chia seeds",
        "aliases": ["chia", "sabja substitute"],
        "category": "nuts_seeds",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 tbsp", "grams": 12.0},
            {"label": "1 tsp", "grams": 4.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 486.0, "protein_g": 16.54, "fat_g": 30.74, "carbs_g": 42.12,
            "fibre_g": 34.4, "sugar_g": 0.0,
            "iron_mg": 7.72, "calcium_mg": 631.0, "zinc_mg": 4.58, "magnesium_mg": 335.0,
            "selenium_ug": 55.2, "iodine_ug": 0.0, "sodium_mg": 16.0, "potassium_mg": 407.0,
            "vit_a_ug": 0.0, "vit_c_mg": 1.6, "vit_d_iu": 0.0, "vit_e_mg": 0.5,
            "vit_b12_ug": 0.0, "folate_ug": 49.0, "omega3_mg": 17830.0,
        },
    },
    # IFCT H014 'Linseeds'
    {
        "name": "Flaxseed",
        "aliases": ["alsi", "linseed", "flax seeds", "ali vidai"],
        "category": "nuts_seeds",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 tbsp", "grams": 10.0},
            {"label": "1 tsp", "grams": 3.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 443.83, "protein_g": 18.55, "fat_g": 35.67, "carbs_g": 10.99,
            "fibre_g": 26.17, "sugar_g": 0.6,
            "iron_mg": 5.44, "calcium_mg": 257.0, "zinc_mg": 4.86, "magnesium_mg": 349.0,
            "selenium_ug": 46.87, "iodine_ug": 0.0, "sodium_mg": 32.93, "potassium_mg": 655.0,
            "vit_a_ug": 0.09, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 8.28,
            "vit_b12_ug": 0.0, "folate_ug": 86.5, "omega3_mg": 12956.0,
        },
    },
    # IFCT H011 'Gingelly seeds, white'
    {
        "name": "Sesame seeds",
        "aliases": ["til", "ellu", "gingelly seeds", "sesame"],
        "category": "nuts_seeds",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 tbsp", "grams": 9.0},
            {"label": "1 tsp", "grams": 3.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 519.6, "protein_g": 21.7, "fat_g": 43.05, "carbs_g": 10.83,
            "fibre_g": 16.99, "sugar_g": 0.67,
            "iron_mg": 15.04, "calcium_mg": 1283.0, "zinc_mg": 7.77, "magnesium_mg": 372.0,
            "selenium_ug": 26.74, "iodine_ug": 0.0, "sodium_mg": 15.43, "potassium_mg": 460.0,
            "vit_a_ug": 1.08, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 1.26,
            "vit_b12_ug": 0.0, "folate_ug": 131.0, "omega3_mg": 120.0,
        },
    },
    # IFCT H020 'Sunflower seeds'
    {
        "name": "Sunflower seeds",
        "aliases": ["surajmukhi seeds"],
        "category": "nuts_seeds",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 tbsp", "grams": 10.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 586.28, "protein_g": 23.53, "fat_g": 51.85, "carbs_g": 6.85,
            "fibre_g": 10.8, "sugar_g": 2.81,
            "iron_mg": 5.85, "calcium_mg": 176.0, "zinc_mg": 7.07, "magnesium_mg": 413.0,
            "selenium_ug": 0.0, "iodine_ug": 0.0, "sodium_mg": 1.9, "potassium_mg": 559.0,
            "vit_a_ug": 0.68, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 12.93,
            "vit_b12_ug": 0.0, "folate_ug": 81.79, "omega3_mg": 35.6,
        },
    },
    # USDA SR Legacy 172470 'Peanut butter, smooth style, without salt'
    {
        "name": "Peanut butter",
        "aliases": ["groundnut butter"],
        "category": "nuts_seeds",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 tbsp", "grams": 16.0},
            {"label": "2 tbsp", "grams": 32.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 598.0, "protein_g": 22.21, "fat_g": 51.36, "carbs_g": 22.31,
            "fibre_g": 5.0, "sugar_g": 10.49,
            "iron_mg": 1.74, "calcium_mg": 49.0, "zinc_mg": 2.51, "magnesium_mg": 168.0,
            "selenium_ug": 4.1, "iodine_ug": 0.0, "sodium_mg": 17.0, "potassium_mg": 558.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 9.1,
            "vit_b12_ug": 0.0, "folate_ug": 87.0, "omega3_mg": 27.0,
        },
    },
    # IFCT H007 'Coconut, kernel, fresh'
    {
        "name": "Fresh coconut",
        "aliases": ["nariyal", "thengai", "grated coconut", "coconut"],
        "category": "nuts_seeds",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 tbsp grated", "grams": 10.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 408.94, "protein_g": 3.84, "fat_g": 41.38, "carbs_g": 6.3,
            "fibre_g": 10.42, "sugar_g": 6.2,
            "iron_mg": 1.3, "calcium_mg": 8.0, "zinc_mg": 0.58, "magnesium_mg": 35.0,
            "selenium_ug": 0.0, "iodine_ug": 0.0, "sodium_mg": 8.12, "potassium_mg": 246.0,
            "vit_a_ug": 0.22, "vit_c_mg": 0.8, "vit_d_iu": 0.0, "vit_e_mg": 2.72,
            "vit_b12_ug": 0.0, "folate_ug": 25.41, "omega3_mg": 0.0,
        },
    },
    # IFCT E028 'Guava, white flesh'
    {
        "name": "Guava",
        "aliases": ["amrood", "koyya", "peru"],
        "category": "fruit",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 medium", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 32.27, "protein_g": 1.44, "fat_g": 0.32, "carbs_g": 5.13,
            "fibre_g": 8.59, "sugar_g": 4.1,
            "iron_mg": 0.32, "calcium_mg": 18.52, "zinc_mg": 0.23, "magnesium_mg": 15.26,
            "selenium_ug": 1.84, "iodine_ug": 0.0, "sodium_mg": 2.87, "potassium_mg": 283.0,
            "vit_a_ug": 24.83, "vit_c_mg": 214.0, "vit_d_iu": 0.0, "vit_e_mg": 0.09,
            "vit_b12_ug": 0.0, "folate_ug": 29.76, "omega3_mg": 11.08,
        },
    },
    # IFCT E001 'Apple, big'
    {
        "name": "Apple",
        "aliases": ["seb", "apple fruit"],
        "category": "fruit",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 medium", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 62.38, "protein_g": 0.29, "fat_g": 0.64, "carbs_g": 13.11,
            "fibre_g": 2.59, "sugar_g": 9.53,
            "iron_mg": 0.26, "calcium_mg": 13.68, "zinc_mg": 0.09, "magnesium_mg": 8.09,
            "selenium_ug": 0.47, "iodine_ug": 0.0, "sodium_mg": 1.43, "potassium_mg": 116.0,
            "vit_a_ug": 0.2, "vit_c_mg": 3.57, "vit_d_iu": 0.0, "vit_e_mg": 0.15,
            "vit_b12_ug": 0.0, "folate_ug": 3.04, "omega3_mg": 32.63,
        },
    },
    # IFCT E049 'Papaya, ripe'
    {
        "name": "Papaya",
        "aliases": ["papita", "pappali", "ripe papaya"],
        "category": "fruit",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 katori cubes", "grams": 140.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 23.9, "protein_g": 0.42, "fat_g": 0.16, "carbs_g": 4.61,
            "fibre_g": 2.83, "sugar_g": 4.09,
            "iron_mg": 0.23, "calcium_mg": 15.02, "zinc_mg": 0.08, "magnesium_mg": 10.97,
            "selenium_ug": 12.78, "iodine_ug": 0.0, "sodium_mg": 6.68, "potassium_mg": 173.0,
            "vit_a_ug": 57.83, "vit_c_mg": 43.09, "vit_d_iu": 0.0, "vit_e_mg": 0.04,
            "vit_b12_ug": 0.0, "folate_ug": 60.9, "omega3_mg": 37.91,
        },
    },
    # IFCT E055 'Pomegranate, maroon seeds'
    {
        "name": "Pomegranate",
        "aliases": ["anar", "mathulai", "pomegranate arils"],
        "category": "fruit",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 katori arils", "grams": 90.0},
            {"label": "1 medium fruit", "grams": 150.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 54.73, "protein_g": 1.33, "fat_g": 0.15, "carbs_g": 11.58,
            "fibre_g": 2.83, "sugar_g": 10.87,
            "iron_mg": 0.31, "calcium_mg": 10.65, "zinc_mg": 0.18, "magnesium_mg": 11.07,
            "selenium_ug": 0.55, "iodine_ug": 0.0, "sodium_mg": 2.13, "potassium_mg": 206.0,
            "vit_a_ug": 0.17, "vit_c_mg": 12.69, "vit_d_iu": 0.0, "vit_e_mg": 0.03,
            "vit_b12_ug": 0.0, "folate_ug": 38.64, "omega3_mg": 1.82,
        },
    },
    # IFCT E012 'Banana, ripe, robusta'
    {
        "name": "Banana",
        "aliases": ["kela", "vazhaipazham", "robusta banana"],
        "category": "fruit",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 medium", "grams": 100.0},
            {"label": "1 small", "grams": 60.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 105.16, "protein_g": 1.23, "fat_g": 0.33, "carbs_g": 23.63,
            "fibre_g": 1.94, "sugar_g": 13.65,
            "iron_mg": 0.28, "calcium_mg": 5.07, "zinc_mg": 0.14, "magnesium_mg": 34.98,
            "selenium_ug": 0.0, "iodine_ug": 0.0, "sodium_mg": 0.85, "potassium_mg": 306.0,
            "vit_a_ug": 4.73, "vit_c_mg": 4.76, "vit_d_iu": 0.0, "vit_e_mg": 0.09,
            "vit_b12_ug": 0.0, "folate_ug": 16.81, "omega3_mg": 73.44,
        },
    },
    # IFCT E017 'Dates, dry, pale brown'
    {
        "name": "Dates",
        "aliases": ["khajur", "pericham pazham", "dry dates", "khajoor"],
        "category": "fruit",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "2 dates", "grams": 20.0},
            {"label": "1 date", "grams": 10.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 320.27, "protein_g": 2.45, "fat_g": 0.35, "carbs_g": 74.91,
            "fibre_g": 8.95, "sugar_g": 66.63,
            "iron_mg": 3.2, "calcium_mg": 71.2, "zinc_mg": 0.7, "magnesium_mg": 73.79,
            "selenium_ug": 0.78, "iodine_ug": 0.0, "sodium_mg": 3.27, "potassium_mg": 804.0,
            "vit_a_ug": 225.0, "vit_c_mg": 4.42, "vit_d_iu": 0.0, "vit_e_mg": 0.03,
            "vit_b12_ug": 0.0, "folate_ug": 18.65, "omega3_mg": 19.49,
        },
    },
    # IFCT E047 'Orange, pulp'
    {
        "name": "Orange",
        "aliases": ["santra", "kamala", "orange fruit"],
        "category": "fruit",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 medium", "grams": 120.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 37.28, "protein_g": 0.7, "fat_g": 0.13, "carbs_g": 7.92,
            "fibre_g": 1.29, "sugar_g": 6.86,
            "iron_mg": 0.81, "calcium_mg": 19.52, "zinc_mg": 0.04, "magnesium_mg": 11.05,
            "selenium_ug": 0.19, "iodine_ug": 0.0, "sodium_mg": 1.47, "potassium_mg": 164.0,
            "vit_a_ug": 2.66, "vit_c_mg": 42.72, "vit_d_iu": 0.0, "vit_e_mg": 0.04,
            "vit_b12_ug": 0.0, "folate_ug": 19.46, "omega3_mg": 11.11,
        },
    },
    # IFCT E034 'Lime, sweet, pulp'
    {
        "name": "Sweet lime",
        "aliases": ["mosambi", "musambi", "sathukudi"],
        "category": "fruit",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 medium", "grams": 130.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 27.25, "protein_g": 0.76, "fat_g": 0.2, "carbs_g": 5.18,
            "fibre_g": 2.07, "sugar_g": 3.42,
            "iron_mg": 0.11, "calcium_mg": 25.79, "zinc_mg": 0.05, "magnesium_mg": 15.4,
            "selenium_ug": 0.72, "iodine_ug": 0.0, "sodium_mg": 1.17, "potassium_mg": 182.0,
            "vit_a_ug": 0.21, "vit_c_mg": 46.96, "vit_d_iu": 0.0, "vit_e_mg": 0.07,
            "vit_b12_ug": 0.0, "folate_ug": 15.38, "omega3_mg": 16.6,
        },
    },
    # IFCT E036 'Mango, ripe, banganapalli'
    {
        "name": "Mango",
        "aliases": ["aam", "mangai", "ripe mango"],
        "category": "fruit",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 katori cubes", "grams": 150.0},
            {"label": "1 medium", "grams": 200.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 41.83, "protein_g": 0.54, "fat_g": 0.55, "carbs_g": 8.18,
            "fibre_g": 1.88, "sugar_g": 7.77,
            "iron_mg": 0.51, "calcium_mg": 15.77, "zinc_mg": 0.12, "magnesium_mg": 13.35,
            "selenium_ug": 1.91, "iodine_ug": 0.0, "sodium_mg": 1.34, "potassium_mg": 144.0,
            "vit_a_ug": 97.33, "vit_c_mg": 32.97, "vit_d_iu": 0.0, "vit_e_mg": 0.28,
            "vit_b12_ug": 0.0, "folate_ug": 82.05, "omega3_mg": 101.0,
        },
    },
    # IFCT D075 'Tomato, ripe, hybrid' - raw
    {
        "name": "Tomato",
        "aliases": ["tamatar", "thakkali", "tomato raw"],
        "category": "vegetable",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 medium", "grams": 70.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 18.88, "protein_g": 0.76, "fat_g": 0.25, "carbs_g": 3.2,
            "fibre_g": 1.58, "sugar_g": 1.82,
            "iron_mg": 0.22, "calcium_mg": 8.9, "zinc_mg": 0.11, "magnesium_mg": 11.86,
            "selenium_ug": 0.0, "iodine_ug": 0.0, "sodium_mg": 11.86, "potassium_mg": 167.0,
            "vit_a_ug": 126.08, "vit_c_mg": 25.27, "vit_d_iu": 0.0, "vit_e_mg": 0.22,
            "vit_b12_ug": 0.0, "folate_ug": 15.41, "omega3_mg": 14.7,
        },
    },
    # IFCT G017 'Onion, big' - raw
    {
        "name": "Onion",
        "aliases": ["pyaz", "vengayam", "onion raw"],
        "category": "vegetable",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 medium", "grams": 80.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 48.04, "protein_g": 1.5, "fat_g": 0.24, "carbs_g": 9.56,
            "fibre_g": 2.45, "sugar_g": 5.88,
            "iron_mg": 0.43, "calcium_mg": 21.03, "zinc_mg": 0.35, "magnesium_mg": 17.96,
            "selenium_ug": 0.35, "iodine_ug": 0.0, "sodium_mg": 5.5, "potassium_mg": 171.0,
            "vit_a_ug": 0.09, "vit_c_mg": 6.69, "vit_d_iu": 0.0, "vit_e_mg": 0.05,
            "vit_b12_ug": 0.0, "folate_ug": 28.88, "omega3_mg": 6.63,
        },
    },
    # IFCT F002 'Carrot, orange' - raw
    {
        "name": "Carrot",
        "aliases": ["gajar", "carrot raw"],
        "category": "vegetable",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 medium", "grams": 60.0},
            {"label": "1 katori grated", "grams": 90.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 33.22, "protein_g": 0.95, "fat_g": 0.47, "carbs_g": 5.55,
            "fibre_g": 4.18, "sugar_g": 3.23,
            "iron_mg": 0.6, "calcium_mg": 35.09, "zinc_mg": 0.25, "magnesium_mg": 16.73,
            "selenium_ug": 0.22, "iodine_ug": 0.0, "sodium_mg": 52.33, "potassium_mg": 273.0,
            "vit_a_ug": 451.92, "vit_c_mg": 6.22, "vit_d_iu": 0.0, "vit_e_mg": 0.21,
            "vit_b12_ug": 0.0, "folate_ug": 24.04, "omega3_mg": 24.38,
        },
    },
    # USDA SR Legacy 170438 'Potatoes, boiled, cooked in skin, flesh, without salt'
    {
        "name": "Boiled potato",
        "aliases": ["potato boiled", "aloo boiled", "urulaikizhangu"],
        "category": "vegetable",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 medium", "grams": 130.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 87.0, "protein_g": 1.87, "fat_g": 0.1, "carbs_g": 20.13,
            "fibre_g": 1.8, "sugar_g": 0.91,
            "iron_mg": 0.31, "calcium_mg": 5.0, "zinc_mg": 0.3, "magnesium_mg": 22.0,
            "selenium_ug": 0.3, "iodine_ug": 0.0, "sodium_mg": 4.0, "potassium_mg": 379.0,
            "vit_a_ug": 0.0, "vit_c_mg": 13.0, "vit_d_iu": 0.0, "vit_e_mg": 0.01,
            "vit_b12_ug": 0.0, "folate_ug": 10.0, "omega3_mg": 0.0,
        },
    },
    # IFCT T001 'Coconut oil'
    {
        "name": "Coconut oil",
        "aliases": ["thengai ennai", "nariyal tel"],
        "category": "fat_oil",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 tsp", "grams": 5.0},
            {"label": "1 tbsp", "grams": 14.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 900.0, "protein_g": 0.0, "fat_g": 100.0, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 0.0, "calcium_mg": 0.0, "zinc_mg": 0.0, "magnesium_mg": 0.0,
            "selenium_ug": 0.0, "iodine_ug": 0.0, "sodium_mg": 0.0, "potassium_mg": 0.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.0,
            "vit_b12_ug": 0.0, "folate_ug": 0.0, "omega3_mg": 0.0,
        },
    },
    # IFCT A010 'Ragi' - dry flour. Ragi malt/koozh is mostly this flour plus water, so log
    # the dry flour weight.
    {
        "name": "Ragi flour",
        "aliases": ["ragi", "finger millet", "kezhvaragu", "nachni"],
        "category": "grain_staple",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "30 g (1 ragi porridge)", "grams": 30.0},
            {"label": "1 tbsp", "grams": 10.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 320.75, "protein_g": 7.16, "fat_g": 1.92, "carbs_g": 66.82,
            "fibre_g": 11.18, "sugar_g": 0.34,
            "iron_mg": 4.62, "calcium_mg": 364.0, "zinc_mg": 2.53, "magnesium_mg": 146.0,
            "selenium_ug": 15.3, "iodine_ug": 0.0, "sodium_mg": 4.75, "potassium_mg": 443.0,
            "vit_a_ug": 0.13, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.16,
            "vit_b12_ug": 0.0, "folate_ug": 34.66, "omega3_mg": 68.58,
        },
    },
    # IFCT A019 'Wheat flour, atta' - dry
    {
        "name": "Wheat flour (atta)",
        "aliases": ["atta", "gehun ka atta", "godhumai maavu", "whole wheat flour"],
        "category": "grain_staple",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "30 g (1 chapati)", "grams": 30.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 320.27, "protein_g": 10.57, "fat_g": 1.53, "carbs_g": 64.17,
            "fibre_g": 11.36, "sugar_g": 1.8,
            "iron_mg": 4.1, "calcium_mg": 30.94, "zinc_mg": 2.85, "magnesium_mg": 125.0,
            "selenium_ug": 53.12, "iodine_ug": 0.0, "sodium_mg": 2.04, "potassium_mg": 311.0,
            "vit_a_ug": 0.22, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.26,
            "vit_b12_ug": 0.0, "folate_ug": 29.22, "omega3_mg": 44.93,
        },
    },
    # IFCT A022 'Wheat, semolina' - dry
    {
        "name": "Rava (semolina)",
        "aliases": ["sooji", "suji", "semolina", "rawa"],
        "category": "grain_staple",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "30 g", "grams": 30.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 333.65, "protein_g": 11.38, "fat_g": 0.74, "carbs_g": 68.43,
            "fibre_g": 9.72, "sugar_g": 1.65,
            "iron_mg": 2.98, "calcium_mg": 29.38, "zinc_mg": 2.13, "magnesium_mg": 37.89,
            "selenium_ug": 10.93, "iodine_ug": 0.0, "sodium_mg": 2.31, "potassium_mg": 284.0,
            "vit_a_ug": 0.13, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.2,
            "vit_b12_ug": 0.0, "folate_ug": 25.68, "omega3_mg": 19.21,
        },
    },
    # USDA SR Legacy 173904 'Cereals, oats, regular and quick, not fortified, dry'. Use this
    # when weighing oats before soaking.
    {
        "name": "Rolled oats (dry)",
        "aliases": ["oats", "oats dry", "rolled oats", "quaker oats"],
        "category": "grain_staple",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "40 g (half cup)", "grams": 40.0},
            {"label": "30 g", "grams": 30.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 379.0, "protein_g": 13.15, "fat_g": 6.52, "carbs_g": 67.7,
            "fibre_g": 10.1, "sugar_g": 0.99,
            "iron_mg": 4.25, "calcium_mg": 52.0, "zinc_mg": 3.64, "magnesium_mg": 138.0,
            "selenium_ug": 28.9, "iodine_ug": 0.0, "sodium_mg": 6.0, "potassium_mg": 362.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.42,
            "vit_b12_ug": 0.0, "folate_ug": 32.0, "omega3_mg": 0.0,
        },
    },
    # USDA SR Legacy 173905 'Cereals, oats, cooked with water, without salt'. Soaking hydrates
    # oats much like cooking does; if soaked in milk instead of water, log the milk
    # separately.
    {
        "name": "Soaked oats",
        "aliases": ["overnight oats", "oats porridge", "cooked oats", "oats in water"],
        "category": "grain_staple",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 katori", "grams": 200.0},
            {"label": "1 bowl", "grams": 250.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 71.0, "protein_g": 2.54, "fat_g": 1.52, "carbs_g": 12.0,
            "fibre_g": 1.7, "sugar_g": 0.27,
            "iron_mg": 0.9, "calcium_mg": 9.0, "zinc_mg": 1.0, "magnesium_mg": 27.0,
            "selenium_ug": 5.4, "iodine_ug": 0.0, "sodium_mg": 4.0, "potassium_mg": 70.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.08,
            "vit_b12_ug": 0.0, "folate_ug": 6.0, "omega3_mg": 18.0,
        },
    },
    # PROXY: USDA SR Legacy 174275 'Soy flour, defatted' - soya chunks are extruded defatted
    # soy, so composition is close, but this is not a measured chunk value.
    {
        "name": "Soya chunks (dry)",
        "aliases": ["soya chunks", "soy nuggets", "nutrela", "meal maker", "textured soy"],
        "category": "supplement",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "30 g dry", "grams": 30.0},
            {"label": "1 katori dry", "grams": 40.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 327.0, "protein_g": 51.46, "fat_g": 1.22, "carbs_g": 33.92,
            "fibre_g": 17.5, "sugar_g": 16.42,
            "iron_mg": 9.24, "calcium_mg": 241.0, "zinc_mg": 2.46, "magnesium_mg": 290.0,
            "selenium_ug": 1.7, "iodine_ug": 0.0, "sodium_mg": 20.0, "potassium_mg": 2384.0,
            "vit_a_ug": 2.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.12,
            "vit_b12_ug": 0.0, "folate_ug": 305.0, "omega3_mg": 0.0,
        },
    },
    # DERIVED: the dry proxy above divided by 2.8 for water uptake on boiling. Rehydration
    # ratio varies 2.5-3x, so treat this within about +/-15%. Any oil used to pan-fry is NOT
    # included - log the oil separately.
    {
        "name": "Soya chunks (cooked)",
        "aliases": ["soya chunks boiled", "meal maker cooked", "soya chunks fry"],
        "category": "supplement",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 katori", "grams": 100.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 116.79, "protein_g": 18.38, "fat_g": 0.44, "carbs_g": 12.11,
            "fibre_g": 6.25, "sugar_g": 5.86,
            "iron_mg": 3.3, "calcium_mg": 86.07, "zinc_mg": 0.88, "magnesium_mg": 103.57,
            "selenium_ug": 0.61, "iodine_ug": 0.0, "sodium_mg": 7.14, "potassium_mg": 851.43,
            "vit_a_ug": 0.71, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.04,
            "vit_b12_ug": 0.0, "folate_ug": 108.93, "omega3_mg": 0.0,
        },
    },
    # USDA SR Legacy 173177 'Beverages, Whey protein powder isolate'
    {
        "name": "Whey protein isolate",
        "aliases": ["whey protein", "whey isolate", "protein powder"],
        "category": "supplement",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 scoop", "grams": 30.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 359.0, "protein_g": 58.14, "fat_g": 1.16, "carbs_g": 29.07,
            "fibre_g": 0.0, "sugar_g": 1.16,
            "iron_mg": 1.26, "calcium_mg": 698.0, "zinc_mg": 8.72, "magnesium_mg": 233.0,
            "selenium_ug": 40.7, "iodine_ug": 0.0, "sodium_mg": 372.0, "potassium_mg": 872.0,
            "vit_a_ug": 872.0, "vit_c_mg": 34.9, "vit_d_iu": 0.0, "vit_e_mg": 7.85,
            "vit_b12_ug": 3.49, "folate_ug": 233.0, "omega3_mg": 0.0,
        },
    },
    # ESTIMATED - marked source 'ai' so the app badges it 'estimated'. Macros are the
    # published B-Protin label (386 kcal, 40 g protein, 2 g fat, 52 g carb per 100 g). The
    # product is fortified with ~28 vitamins and minerals but the per-100 g amounts are not
    # published, so every micronutrient here is 0.0 and will UNDER-count. Replace with the
    # jar's own label panel.
    {
        "name": "B-Protein powder",
        "aliases": ["b protin", "bprotein", "malted protein supplement", "protein supplement powder"],
        "category": "supplement",
        "is_veg": True,
        "source": "ai",
        "household_units": [
            {"label": "1 scoop", "grams": 25.0},
            {"label": "2 scoops", "grams": 50.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 386.0, "protein_g": 40.0, "fat_g": 2.0, "carbs_g": 52.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 0.0, "calcium_mg": 0.0, "zinc_mg": 0.0, "magnesium_mg": 0.0,
            "selenium_ug": 0.0, "iodine_ug": 0.0, "sodium_mg": 0.0, "potassium_mg": 0.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.0,
            "vit_b12_ug": 0.0, "folate_ug": 0.0, "omega3_mg": 0.0,
        },
    },
    # COMPUTED from IFCT: per 60 g samosa - refined flour 20 g + boiled potato 30 g + peas 5 g
    # + 11 g oil (3 g in the dough, 8 g absorbed), frying retention. INDB's row counts the
    # whole frying pan and reads 577 kcal/100 g.
    {
        "name": "Samosa",
        "aliases": ["aloo samosa", "potato samosa", "singara"],
        "category": "snack",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 samosa", "grams": 60.0},
            {"label": "2 samosa", "grams": 120.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 323.94, "protein_g": 4.59, "fat_g": 18.71, "carbs_g": 31.53,
            "fibre_g": 2.19, "sugar_g": 0.75,
            "iron_mg": 1.01, "calcium_mg": 13.91, "zinc_mg": 0.5, "magnesium_mg": 25.61,
            "selenium_ug": 0.49, "iodine_ug": 0.0, "sodium_mg": 2.73, "potassium_mg": 306.52,
            "vit_a_ug": 0.81, "vit_c_mg": 8.87, "vit_d_iu": 0.0, "vit_e_mg": 0.05,
            "vit_b12_ug": 0.0, "folate_ug": 11.53, "omega3_mg": 16.9,
        },
    },
    # INDB 'Coconut chutney'
    {
        "name": "Coconut chutney",
        "aliases": ["thengai chutney", "nariyal chutney", "dosa chutney", "chutney"],
        "category": "condiment",
        "is_veg": True,
        "source": "indb",
        "household_units": [
            {"label": "2 tbsp", "grams": 30.0},
            {"label": "1 tbsp", "grams": 15.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 265.92, "protein_g": 3.59, "fat_g": 25.0, "carbs_g": 8.29,
            "fibre_g": 6.73, "sugar_g": 3.79,
            "iron_mg": 1.25, "calcium_mg": 15.7, "zinc_mg": 0.41, "magnesium_mg": 25.07,
            "selenium_ug": 1.33, "iodine_ug": 0.0, "sodium_mg": 428.28, "potassium_mg": 230.88,
            "vit_a_ug": 0.0, "vit_c_mg": 16.32, "vit_d_iu": 0.0, "vit_e_mg": 3.3,
            "vit_b12_ug": 0.0, "folate_ug": 18.7, "omega3_mg": 0.0,
        },
    },
    # IFCT T005 'Groundnut oil'
    {
        "name": "Groundnut oil",
        "aliases": ["peanut oil", "kadalai ennai", "cooking oil"],
        "category": "fat_oil",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 tsp", "grams": 5.0},
            {"label": "1 tbsp", "grams": 14.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 900.0, "protein_g": 0.0, "fat_g": 100.0, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 0.0, "calcium_mg": 0.0, "zinc_mg": 0.0, "magnesium_mg": 0.0,
            "selenium_ug": 0.0, "iodine_ug": 0.0, "sodium_mg": 0.0, "potassium_mg": 0.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.0,
            "vit_b12_ug": 0.0, "folate_ug": 0.0, "omega3_mg": 0.0,
        },
    },
    # IFCT T012 'Sunflower oil'
    {
        "name": "Sunflower oil",
        "aliases": ["refined oil", "sunflower cooking oil"],
        "category": "fat_oil",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 tsp", "grams": 5.0},
            {"label": "1 tbsp", "grams": 14.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 900.0, "protein_g": 0.0, "fat_g": 100.0, "carbs_g": 0.0,
            "fibre_g": 0.0, "sugar_g": 0.0,
            "iron_mg": 0.0, "calcium_mg": 0.0, "zinc_mg": 0.0, "magnesium_mg": 0.0,
            "selenium_ug": 0.0, "iodine_ug": 0.0, "sodium_mg": 0.0, "potassium_mg": 0.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.0,
            "vit_b12_ug": 0.0, "folate_ug": 0.0, "omega3_mg": 0.0,
        },
    },
    # USDA SR Legacy 169655 'Sugars, granulated'
    {
        "name": "Sugar",
        "aliases": ["chini", "white sugar", "sakkarai", "table sugar"],
        "category": "sweetener",
        "is_veg": True,
        "source": "usda",
        "household_units": [
            {"label": "1 tsp", "grams": 5.0},
            {"label": "1 tbsp", "grams": 12.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 387.0, "protein_g": 0.0, "fat_g": 0.0, "carbs_g": 99.98,
            "fibre_g": 0.0, "sugar_g": 99.8,
            "iron_mg": 0.05, "calcium_mg": 1.0, "zinc_mg": 0.01, "magnesium_mg": 0.0,
            "selenium_ug": 0.6, "iodine_ug": 0.0, "sodium_mg": 1.0, "potassium_mg": 2.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.0,
            "vit_b12_ug": 0.0, "folate_ug": 0.0, "omega3_mg": 0.0,
        },
    },
    # IFCT I001 'Jaggery, cane'
    {
        "name": "Jaggery",
        "aliases": ["gud", "vellam", "bella", "gur"],
        "category": "sweetener",
        "is_veg": True,
        "source": "ifct",
        "household_units": [
            {"label": "1 tsp", "grams": 8.0},
            {"label": "1 piece", "grams": 20.0},
            {"label": "100 g", "grams": 100.0},
        ],
        "per_100g": {
            "kcal": 353.73, "protein_g": 1.85, "fat_g": 0.16, "carbs_g": 84.87,
            "fibre_g": 0.0, "sugar_g": 84.32,
            "iron_mg": 4.63, "calcium_mg": 107.0, "zinc_mg": 0.45, "magnesium_mg": 115.0,
            "selenium_ug": 0.0, "iodine_ug": 0.0, "sodium_mg": 25.38, "potassium_mg": 488.0,
            "vit_a_ug": 0.0, "vit_c_mg": 0.0, "vit_d_iu": 0.0, "vit_e_mg": 0.04,
            "vit_b12_ug": 0.0, "folate_ug": 14.4, "omega3_mg": 0.0,
        },
    },
]
