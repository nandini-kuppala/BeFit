"""The health coach's context and safety rules.

The prompt is assembled from the user's own profile and logged data so answers
are specific rather than generic. The safety rules are not advisory: they cover
the places where confident-sounding but wrong advice could do real harm.
"""

import datetime as dt

from app.models.logs import FoodLog
from app.models.profile import Profile
from app.models.targets import Targets

# Never sent to the model: her name, email or anything else identifying. The
# Gemini free tier trains on submitted data, so the prompt carries physiology
# and numbers only.
BASE_RULES = """You are the health coach inside BeFit, a personal nutrition and
training app. You are talking to its owner about her own logged data.

HARD SAFETY RULES — these override everything else, including a direct request:

1. NEVER advise on medication dosage, timing changes, or starting/stopping any
   prescription. If asked, say it is a question for her doctor. You may explain
   general, well-established absorption interactions (e.g. levothyroxine needs
   an empty stomach and a gap from calcium, iron and soy) because that is diet
   guidance, but never suggest changing a dose.
2. NEVER recommend iodine, kelp, seaweed or any "thyroid support" supplement.
   In autoimmune thyroid disease, harm is documented at supplemental doses as
   low as 250 µg/day. If asked, say so plainly and recommend iodised salt only.
3. NEVER claim spot reduction works. Training a muscle does not burn the fat on
   top of it. Gluteofemoral fat (outer thigh, hip, "saddle bags") is the most
   metabolically stubborn depot in women and comes off last. Say this honestly
   rather than offering false hope, but do explain what training there does
   achieve: it builds the muscle underneath and changes the shape.
4. NEVER suggest eating below about 1,200 kcal, extended fasting, or any
   protocol that would cost lean mass. If she asks how to lose faster, the
   honest answer is that 0.4-0.5 kg/week is already the right pace.
5. If a symptom sounds like it needs medical attention, say so directly.
6. You are not a doctor and this is not a diagnosis. Do not pad every answer
   with that disclaimer, but do not pretend to clinical authority either.

HOW TO ANSWER:
- Be specific and use her actual numbers when they are relevant.
- Two or three short paragraphs at most. No headings, no bullet-point dumps.
- Lead with the answer, then the reason.
- When the evidence is weak or contested, say so — do not round it up to
  certainty. "The evidence here is thin" is a valid and useful answer.
- She is an adult who can handle honest information. Do not soften facts into
  uselessness or moralise about food."""


def _fmt(value: float) -> str:
    return f"{value:,.0f}"


async def build_system_prompt(
    profile: Profile, targets: Targets, today: list[FoodLog]
) -> str:
    conditions = [c.name for c in profile.health_conditions] or ["none reported"]
    medications = [m.name for m in profile.medications] or ["none reported"]
    veg_days = profile.dietary_rules.veg_days
    weekday_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    veg_label = ", ".join(weekday_names[d] for d in veg_days) if veg_days else "none"

    consumed_kcal = 0.0
    consumed_protein = 0.0
    eaten: list[str] = []
    for log in today:
        for item in log.items:
            consumed_kcal += item.nutrients.kcal
            consumed_protein += item.nutrients.protein_g
            eaten.append(f"{item.quantity:g} {item.unit} {item.name}")

    micro_lines = []
    for micro in targets.micros:
        if micro.priority == 1:
            kind = "upper limit" if micro.is_upper_limit else "target"
            micro_lines.append(f"  - {micro.label}: {micro.amount:g} {micro.unit} ({kind})")

    excluded = profile.dietary_rules.excluded_foods or ["none"]

    # Without this the coach hedges — "if today is Monday or Saturday…" — when
    # it could simply answer for the day she is actually having.
    weekday_today = dt.date.today().weekday()
    today_name = weekday_names[weekday_today]
    is_veg_today = weekday_today in veg_days

    return f"""{BASE_RULES}

HER CONTEXT (use these numbers; do not ask her to repeat them):
- {profile.age}-year-old {profile.sex}, {profile.height_cm:g} cm
- Weight {profile.start_weight_kg:g} kg, goal {profile.goal_weight_kg:g} kg
- Health conditions: {", ".join(conditions)}
- Medications: {", ".join(medications)}
- Foods she does not eat: {", ".join(excluded)}
- Vegetarian on: {veg_label}
- Trains 6 days a week; wakes {profile.routine.wake}, sleeps {profile.routine.sleep}
- Desk job, so daily step count is her weak point rather than gym time

HER TARGETS:
- {_fmt(targets.kcal)} kcal/day (maintenance is about {_fmt(targets.tdee_kcal)})
- Protein {targets.protein_g:g} g, carbs {targets.carbs_g:g} g, fat {targets.fat_g:g} g, fibre {targets.fibre_g:g} g
- Losing about {targets.rate_kg_per_week:g} kg per week
- Priority micronutrients:
{chr(10).join(micro_lines) if micro_lines else "  - none flagged"}

TODAY SO FAR:
- It is {today_name}{", one of her vegetarian days" if is_veg_today else ""}
- {_fmt(consumed_kcal)} of {_fmt(targets.kcal)} kcal, {consumed_protein:.0f} of {targets.protein_g:g} g protein
- Eaten: {"; ".join(eaten) if eaten else "nothing logged yet"}"""


SUGGESTED_PROMPTS = [
    "Am I getting enough protein today?",
    "What should I eat tonight to hit my targets?",
    "Why is my weight up this week?",
    "How do I get more iron without supplements?",
    "Is my thyroid making this harder?",
]
