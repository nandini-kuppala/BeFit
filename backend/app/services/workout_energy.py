"""Workout energy expenditure from METs.

MET values come from the Compendium of Physical Activities (Ainsworth et al.),
the same reference every credible tracker uses. The arithmetic is the ACSM
form:

    kcal = MET × 3.5 × weight_kg / 200 × minutes

which is just MET × weight_kg × hours with the oxygen-cost constants spelled
out.

One deliberate omission: none of this is ever added back to the day's calorie
allowance. Her TDEE already multiplies BMR by an activity factor of 1.55 for
training six days a week, so crediting the session again would double-count it
and silently hand her an extra 300-400 kcal. The number here is for progress
tracking, and the UI says as much.
"""

# Compendium codes 02050 (resistance training, multiple exercises, 8-15 reps,
# vigorous) and 02054 (light/moderate effort).
MET_RESISTANCE_MODERATE = 3.5
MET_RESISTANCE_VIGOROUS = 6.0
# Code 03017 — general dance/aerobic follow-along video at moderate effort.
MET_FOLLOW_ALONG = 5.0
# Code 17190 — walking 4.5 km/h, firm surface.
MET_WALKING = 3.3

# Below this, "I did a couple of sets" shouldn't read as a full session.
_MIN_MINUTES = 5.0


def _kcal(met: float, weight_kg: float, minutes: float) -> float:
    if minutes <= 0 or weight_kg <= 0:
        return 0.0
    return met * 3.5 * weight_kg / 200.0 * minutes


def session_kcal(
    weight_kg: float,
    *,
    strength_minutes: float = 0.0,
    video_minutes: float = 0.0,
    cardio_minutes: float = 0.0,
    vigorous: bool = False,
) -> float:
    """Total burn for one session, split by the kind of work done.

    `vigorous` is off by default: she trains with 3 kg dumbbells after a
    four-month break, which is squarely light-to-moderate. Claiming 6 METs for
    that would overstate the burn by nearly double.
    """
    strength_met = MET_RESISTANCE_VIGOROUS if vigorous else MET_RESISTANCE_MODERATE
    total = (
        _kcal(strength_met, weight_kg, strength_minutes)
        + _kcal(MET_FOLLOW_ALONG, weight_kg, video_minutes)
        + _kcal(MET_WALKING, weight_kg, cardio_minutes)
    )
    return round(total, 1)


def estimate_strength_minutes(exercises_done: int, duration_minutes: int | None) -> float:
    """Minutes of resistance work, from a logged duration when there is one and
    from the count of completed exercises otherwise.

    Roughly 4 minutes per exercise covers the working sets plus the rest
    between them, which matches how her plan's 25-minute machine block is
    built (6-7 movements).
    """
    if duration_minutes and duration_minutes >= _MIN_MINUTES:
        return float(duration_minutes)
    return max(0.0, exercises_done * 4.0)
