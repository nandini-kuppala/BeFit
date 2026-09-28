"""The default weekly training plan.

Built for a returning beginner training six days a week on light weights, with
goals that pull in different directions: lose thigh and outer-hip fat, keep
glutes, build chest for lift, tone arms without bulking, and slim the waist.

Video links are verified but editable in-app — PATCH /workouts/day/{weekday}/video
persists a replacement, which is also what the weekly link-health check prompts
for when a video goes dead.
"""

DEFAULT_WEEK: list[dict] = [
    {
        "weekday": 0,
        "focus": "Glutes & Hamstrings",
        "summary": (
            "Hip thrusts are the highest glute-activation exercise there is. "
            "This is the day that keeps your glutes lifted while everything "
            "else leans out."
        ),
        "is_veg": True,
        "exercises": [
            {"name": "Hip thrust", "prescription": "3 × 12–15 · bodyweight → 5 kg"},
            {"name": "Seated leg curl", "prescription": "3 × 12–15"},
            {"name": "Glute kickback (cable)", "prescription": "3 × 12–15 each side"},
            {"name": "Hip abduction machine", "prescription": "3 × 15"},
        ],
        "video_url": "https://www.youtube.com/watch?v=23YRR70vYpk",
        "video_title": "30-Minute Glute Workout (No Equipment)",
        "video_channel": "Megan The Trainer · 29:13",
    },
    {
        "weekday": 1,
        "focus": "Back & Chest",
        "summary": (
            "Chest work builds the pec underneath the breast tissue — the only "
            "training lever that exists for lift. Back work fixes desk posture."
        ),
        "exercises": [
            {"name": "Lat pulldown", "prescription": "3 × 12–15 · light"},
            {"name": "Seated cable row", "prescription": "3 × 12–15"},
            {"name": "Chest press machine", "prescription": "3 × 12–15"},
            {"name": "Pec deck or 3 kg dumbbell press", "prescription": "3 × 15"},
        ],
        "video_url": "https://www.youtube.com/watch?v=CihZIXjoUQw",
        "video_title": "20 Min Chest Workout with Dumbbells at Home",
        "video_channel": "HASfit · 29:41",
    },
    {
        "weekday": 2,
        "focus": "Thighs — inner & outer",
        "summary": (
            "Your saddle bag day. The abduction machine is the most direct "
            "gym-equipment answer to this goal — most people use it wrong, so "
            "watch the form video."
        ),
        "exercises": [
            {"name": "Leg press", "prescription": "3 × 12–15 · feet high and wide"},
            {"name": "Hip abduction machine", "prescription": "3 × 15–20"},
            {"name": "Hip adduction machine", "prescription": "3 × 15"},
            {"name": "Leg extension", "prescription": "3 × 15 · light"},
        ],
        "video_url": "https://www.youtube.com/watch?v=7VVQFIn6g0A",
        "video_title": "30 Min Outer & Inner Thigh Workout at Home",
        "video_channel": "Caroline Girvan · 30:36",
    },
    {
        "weekday": 3,
        "focus": "Core, Abs & Arms",
        "summary": (
            "Light weight, high reps — the tone-don't-bulk stimulus. Core and "
            "lower back together build the deep stabilisers a slim waist needs."
        ),
        "exercises": [
            {"name": "Cable woodchop", "prescription": "3 × 12 each side"},
            {"name": "Tricep pushdown", "prescription": "3 × 15 · light"},
            {"name": "Bicep curl", "prescription": "3 × 15 · 3 kg"},
            {"name": "Cable face pull", "prescription": "3 × 15 · posture"},
        ],
        "video_url": "https://www.youtube.com/watch?v=xYoKWuCbHnw",
        "video_title": "30 Min Slow & Intense Abs — No Equipment",
        "video_channel": "MadFit · 32:32",
    },
    {
        "weekday": 4,
        "focus": "Full Body + Glutes",
        "summary": (
            "Compound movements — the most work in the least time. Then a "
            "low-impact video so you finish the week tired but not wrecked."
        ),
        "exercises": [
            {"name": "Goblet squat", "prescription": "3 × 12 · 5 kg"},
            {"name": "Romanian deadlift", "prescription": "3 × 12 · 5 kg"},
            {"name": "Walking lunges", "prescription": "3 × 10 each leg · bodyweight"},
            {"name": "Hip thrust", "prescription": "3 × 15"},
        ],
        "video_url": "https://www.youtube.com/watch?v=9K1dsiGC__A",
        "video_title": "30 Min Low Impact Full Body Cardio — No Jumping",
        "video_channel": "growwithjo · 31:42",
    },
    {
        "weekday": 5,
        "focus": "Active Recovery",
        "summary": (
            "Deliberately light. Six hard days in a row on a 450 kcal deficit "
            "is how people burn out in week five — this day keeps the habit "
            "without the recovery cost."
        ),
        "is_veg": True,
        "exercises": [
            {"name": "Elliptical", "prescription": "20 min · easy pace"},
            {"name": "Glute bridge", "prescription": "2 × 15"},
            {"name": "Bird-dog", "prescription": "2 × 10 each side"},
            {"name": "Wall sit", "prescription": "2 × 30 sec"},
        ],
        "video_url": "https://www.youtube.com/watch?v=WnSr8w4QEWo",
        "video_title": "30 Min Flexibility + Stretching Routine",
        "video_channel": "Eleni Fit · 30:26",
    },
    {
        "weekday": 6,
        "focus": "Rest",
        "summary": (
            "No gym. Rest is not lost progress — it is when your body adapts "
            "to the six days before it. Walk if you feel like it."
        ),
        "is_rest": True,
        "exercises": [],
        "video_url": None,
        "video_title": None,
        "video_channel": None,
    },
]

# Shown on every training day, so it lives outside the per-day data.
SESSION_BLOCKS: list[dict] = [
    {
        "minutes": 10,
        "title": "Warm-up",
        "note": "5 min easy walk or cycle, then dynamic stretches — leg swings, hip circles, arm circles.",
    },
    {
        "minutes": 25,
        "title": "Machines & weights",
        "note": "3 sets each. Stop 2 reps short of failure, rest 60–75 seconds. Add reps before you add weight.",
    },
    {"minutes": 30, "title": "Follow-along video", "note": None},
    {
        "minutes": 20,
        "title": "Incline treadmill walk",
        "note": "Incline 8–12%, speed 4.5–5.5 km/h. Don't hold the handrails — holding on cuts the work by about 20%.",
    },
    {
        "minutes": 8,
        "title": "Stretch",
        "note": "Hips, hamstrings, quads, chest. Hold each for 30 seconds.",
    },
]

# The swap for a low-energy day. Keeping the habit beats skipping entirely.
EASY_DAY_VIDEO = {
    "url": "https://www.youtube.com/watch?v=yV4jyj8Hr1g",
    "title": "Low Impact 30 Min Walking Workout",
    "channel": "growwithjo · 32:05",
}
