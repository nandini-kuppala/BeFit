"""The default weekly meal plan.

Built from foods she already eats and can actually prepare: no cooking in the
morning, PG canteen as a realistic fallback, vegetarian on Monday and Saturday.

Two deliberate choices encoded here:
  - The B-Protein scoop sits at 11:00, not breakfast. It is milk-protein based
    with added calcium and iron, which blocks levothyroxine absorption; the
    tablet needs a 4-hour gap from those.
  - Rice is 150 g, not 250 g. That single change is ~130 kcal/day while the
    plate gets bigger, because the poriyal doubles.
"""

MEAL_TIMES: dict[str, str] = {
    "breakfast": "09:20",
    "mid_morning": "11:00",
    "lunch": "13:30",
    "snack": "16:30",
    "dinner": "20:00",
}

DEFAULT_DIET_WEEK: list[dict] = [
    {
        "weekday": 0,
        "is_veg": True,
        "meals": {
            "breakfast": "Soaked oats 40 g + almonds + chia + apple, with boiled chana 80 g",
            "mid_morning": "B-Protein + milk",
            "lunch": "Rice 150 g + sambar + double poriyal + green peas curry",
            "snack": "Guava + 8 almonds",
            "dinner": "Besan omelette ×2 + sautéed cabbage and carrot",
        },
    },
    {
        "weekday": 1,
        "meals": {
            "breakfast": "3 boiled eggs (boiled last night) + chilli oil + 1 fruit",
            "mid_morning": "B-Protein + milk",
            "lunch": "Rice 150 g + curry + poriyal + baked chicken 100 g",
            "snack": "Papaya + roasted chana 20 g",
            "dinner": "Oven-roasted chicken 120 g + stir-fried beans and capsicum",
        },
    },
    {
        "weekday": 2,
        "meals": {
            "breakfast": "Soaked oats + nuts + 2 boiled eggs",
            "mid_morning": "B-Protein + milk",
            "lunch": "Rice 150 g + curry + poriyal + egg curry (2 eggs)",
            "snack": "Apple + 8 walnuts",
            "dinner": "Soya chunks 40 g dry, marinated, pan-fried in 10 ml oil + mixed veg",
        },
    },
    {
        "weekday": 3,
        "meals": {
            "breakfast": "3 boiled eggs + 1 fruit",
            "mid_morning": "B-Protein + milk",
            "lunch": "Rice 150 g + curry + poriyal + fish or chicken 100 g",
            "snack": "Pomegranate + 8 almonds",
            "dinner": "Besan omelette + big salad — cucumber, tomato, onion, lemon",
        },
    },
    {
        "weekday": 4,
        "meals": {
            "breakfast": "Soaked oats + nuts + 2 boiled eggs",
            "mid_morning": "B-Protein + milk",
            "lunch": "Rice 150 g + curry + poriyal + chicken 100 g",
            "snack": "Guava + roasted chana",
            "dinner": "Chicken 65 — oven-baked + sautéed greens · your weekly treat",
        },
    },
    {
        "weekday": 5,
        "is_veg": True,
        "meals": {
            "breakfast": "Soaked oats + nuts + boiled chana 80 g + fruit",
            "mid_morning": "B-Protein + milk",
            "lunch": "Rice 150 g + sambar + poriyal + paneer 60 g or rajma",
            "snack": "Papaya + 10 almonds",
            "dinner": "Green peas chat + boiled sweet potato 150 g + lemon",
        },
    },
    {
        "weekday": 6,
        "meals": {
            "breakfast": "3 boiled eggs + fruit",
            "mid_morning": "B-Protein + milk",
            "lunch": "Free-ish meal — eat normally, stay roughly at target",
            "snack": "Fruit",
            "dinner": "Oven-roasted chicken + veg, or lighter if lunch was big",
        },
        "note": "Tonight: soak the chana, boil a batch of eggs, portion the nuts.",
    },
]

# What to do when the PG canteen decides dinner. The rule is always the same:
# add a protein, halve the starch.
PG_SWAPS: list[dict] = [
    {"item": "Idli", "portion": "3 idlis + sambar", "add": "2 boiled eggs"},
    {"item": "Dosa", "portion": "1 plain dosa (not masala)", "add": "2 boiled eggs or omelette"},
    {"item": "Upma / khichdi", "portion": "1 cup, not two", "add": "2 boiled eggs"},
    {"item": "Chapati + curry", "portion": "2 chapatis, skim visible oil", "add": "100 g chicken or chana"},
    {"item": "Fried rice", "portion": "1 cup max, add salad", "add": "Egg or chicken on top"},
]
