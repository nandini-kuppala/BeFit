import datetime as dt

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl

from app.api.deps import CurrentProfile, CurrentUser
from app.data.default_plan import EASY_DAY_VIDEO, SESSION_BLOCKS
from app.data.default_plan import DEFAULT_WEEK
from app.models.logs import WeightLog
from app.models.workout import (
    CompletedExercise,
    PlanDay,
    PlannedExercise,
    WorkoutPlan,
    WorkoutSession,
)
from app.services import workout_energy

router = APIRouter(prefix="/workouts", tags=["workouts"])

# Shown when there is no plan yet, so "add a plan" has something concrete
# behind it rather than an empty form.
EXAMPLE_DAY: dict = {
    "focus": "Lower body + glutes",
    "summary": "Machines first while you're fresh, then a follow-along video.",
    "exercises": [
        {"name": "Leg press", "prescription": "3 × 12–15 · moderate"},
        {"name": "Seated leg curl", "prescription": "3 × 12–15"},
        {"name": "Glute kickback (cable)", "prescription": "3 × 15 each side"},
        {"name": "Hip thrust", "prescription": "3 × 12 · 5 kg"},
    ],
}


class WeekResponse(BaseModel):
    has_plan: bool
    days: list[PlanDay]
    session_blocks: list[dict]
    easy_day_video: dict
    example_day: dict | None = None


async def _existing(user_id) -> WorkoutPlan | None:
    return await WorkoutPlan.find_one(WorkoutPlan.user_id == user_id)


async def _require(user_id) -> WorkoutPlan:
    plan = await _existing(user_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No training plan yet. Create one first.",
        )
    return plan


def _day_of(plan: WorkoutPlan, weekday: int) -> PlanDay:
    if not 0 <= weekday <= 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Weekday must be 0 (Monday) to 6 (Sunday).",
        )
    for day in plan.days:
        if day.weekday == weekday:
            return day
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Day not found.")


@router.get("/week", response_model=WeekResponse)
async def week(user: CurrentUser) -> WeekResponse:
    plan = await _existing(user.id)
    if plan is None:
        return WeekResponse(
            has_plan=False,
            days=[],
            session_blocks=SESSION_BLOCKS,
            easy_day_video=EASY_DAY_VIDEO,
            example_day=EXAMPLE_DAY,
        )
    return WeekResponse(
        has_plan=True,
        days=sorted(plan.days, key=lambda d: d.weekday),
        session_blocks=SESSION_BLOCKS,
        easy_day_video=EASY_DAY_VIDEO,
    )


class CreatePlanRequest(BaseModel):
    from_template: bool = True


@router.post("/plan", response_model=WeekResponse, status_code=status.HTTP_201_CREATED)
async def create_plan(user: CurrentUser, body: CreatePlanRequest) -> WeekResponse:
    if await _existing(user.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A training plan already exists."
        )

    if body.from_template:
        days = [
            PlanDay(
                weekday=day["weekday"],
                focus=day["focus"],
                summary=day.get("summary", ""),
                is_rest=day.get("is_rest", False),
                is_veg=day.get("is_veg", False),
                exercises=[
                    PlannedExercise(name=item["name"], prescription=item["prescription"])
                    for item in day.get("exercises", [])
                ],
                video_url=day.get("video_url"),
                video_title=day.get("video_title"),
                video_channel=day.get("video_channel"),
            )
            for day in DEFAULT_WEEK
        ]
    else:
        days = [
            PlanDay(weekday=weekday, focus="Training", summary="", is_rest=weekday == 6)
            for weekday in range(7)
        ]

    plan = WorkoutPlan(user_id=user.id, days=days)
    await plan.insert()
    return WeekResponse(
        has_plan=True,
        days=sorted(plan.days, key=lambda d: d.weekday),
        session_blocks=SESSION_BLOCKS,
        easy_day_video=EASY_DAY_VIDEO,
    )


class VideoUpdate(BaseModel):
    video_url: HttpUrl
    video_title: str | None = Field(default=None, max_length=200)
    video_channel: str | None = Field(default=None, max_length=120)


@router.patch("/day/{weekday}/video", response_model=PlanDay)
async def update_video(user: CurrentUser, weekday: int, body: VideoUpdate) -> PlanDay:
    """Replacing a day's video persists here — videos get deleted, and the plan
    should outlive that."""
    plan = await _require(user.id)
    day = _day_of(plan, weekday)
    day.video_url = str(body.video_url)
    if body.video_title is not None:
        day.video_title = body.video_title
    if body.video_channel is not None:
        day.video_channel = body.video_channel
    day.video_unavailable = False
    await plan.save()
    return day


class ExerciseInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    prescription: str = Field(default="", max_length=100)


class DayUpdate(BaseModel):
    focus: str = Field(min_length=1, max_length=80)
    summary: str = Field(default="", max_length=400)
    is_rest: bool = False
    exercises: list[ExerciseInput] = Field(default_factory=list)


@router.put("/day/{weekday}", response_model=PlanDay)
async def replace_day(user: CurrentUser, weekday: int, body: DayUpdate) -> PlanDay:
    plan = await _require(user.id)
    day = _day_of(plan, weekday)

    day.focus = body.focus.strip()
    day.summary = body.summary.strip()
    day.is_rest = body.is_rest
    day.exercises = [
        PlannedExercise(name=item.name.strip(), prescription=item.prescription.strip())
        for item in body.exercises
        if item.name.strip()
    ]
    await plan.save()
    return day


class CopyDayRequest(BaseModel):
    from_weekday: int = Field(ge=0, le=6)


@router.post("/day/{weekday}/copy", response_model=PlanDay)
async def copy_day(user: CurrentUser, weekday: int, body: CopyDayRequest) -> PlanDay:
    plan = await _require(user.id)
    source = _day_of(plan, body.from_weekday)
    target = _day_of(plan, weekday)

    target.focus = source.focus
    target.summary = source.summary
    target.is_rest = source.is_rest
    target.exercises = [item.model_copy() for item in source.exercises]
    await plan.save()
    return target


# --------------------------------------------------------------- sessions


async def _bodyweight(user_id, profile) -> float:
    """Latest logged weight, falling back to the onboarding figure."""
    latest = (
        await WeightLog.find(WeightLog.user_id == user_id)
        .sort(-WeightLog.date)
        .first_or_none()
    )
    return latest.kg if latest else profile.start_weight_kg


class CompletedInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    sets_done: int = Field(default=0, ge=0, le=20)
    reps: str | None = Field(default=None, max_length=20)
    weight_kg: float | None = Field(default=None, ge=0, le=300)


class SessionRequest(BaseModel):
    date: dt.date = Field(default_factory=dt.date.today)
    completed: list[CompletedInput] = Field(default_factory=list)
    video_done: bool = False
    cardio_minutes: int = Field(default=0, ge=0, le=300)
    duration_minutes: int | None = Field(default=None, ge=0, le=400)
    felt: int | None = Field(default=None, ge=1, le=5)
    note: str | None = Field(default=None, max_length=300)


@router.post("/session", response_model=WorkoutSession)
async def log_session(
    user: CurrentUser, profile: CurrentProfile, body: SessionRequest
) -> WorkoutSession:
    plan = await _existing(user.id)
    weekday = body.date.weekday()
    day = next((d for d in plan.days if d.weekday == weekday), None) if plan else None

    completed = [
        CompletedExercise(
            name=item.name,
            sets_done=item.sets_done,
            reps=item.reps,
            weight_kg=item.weight_kg,
        )
        for item in body.completed
    ]

    weight_kg = await _bodyweight(user.id, profile)
    strength_minutes = workout_energy.estimate_strength_minutes(
        len(completed), body.duration_minutes
    )
    kcal = workout_energy.session_kcal(
        weight_kg,
        strength_minutes=strength_minutes,
        # The follow-along block in her plan is 30 minutes.
        video_minutes=30.0 if body.video_done else 0.0,
        cardio_minutes=body.cardio_minutes,
    )

    session = await WorkoutSession.find_one(
        WorkoutSession.user_id == user.id, WorkoutSession.date == body.date
    )
    if session is None:
        session = WorkoutSession(
            user_id=user.id,
            date=body.date,
            weekday=weekday,
            focus=day.focus if day else "Training",
            completed=completed,
            video_done=body.video_done,
            cardio_minutes=body.cardio_minutes,
            duration_minutes=body.duration_minutes,
            felt=body.felt,
            note=body.note,
            kcal_burned=kcal,
        )
    else:
        session.completed = completed
        session.video_done = body.video_done
        session.cardio_minutes = body.cardio_minutes
        session.duration_minutes = body.duration_minutes
        session.felt = body.felt
        session.note = body.note
        session.kcal_burned = kcal
        if day:
            session.focus = day.focus
    await session.save()
    return session


@router.get("/session", response_model=WorkoutSession | None)
async def get_session(
    user: CurrentUser, on: dt.date = Query(default_factory=dt.date.today)
) -> WorkoutSession | None:
    """Lets the checkboxes restore when she reopens the screen mid-session."""
    return await WorkoutSession.find_one(
        WorkoutSession.user_id == user.id, WorkoutSession.date == on
    )


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    user: CurrentUser, on: dt.date = Query(default_factory=dt.date.today)
) -> None:
    session = await WorkoutSession.find_one(
        WorkoutSession.user_id == user.id, WorkoutSession.date == on
    )
    if session is not None:
        await session.delete()


@router.get("/sessions", response_model=list[WorkoutSession])
async def sessions(user: CurrentUser, days: int = Query(default=30, le=400)) -> list:
    since = dt.date.today() - dt.timedelta(days=days)
    return (
        await WorkoutSession.find(
            WorkoutSession.user_id == user.id, WorkoutSession.date >= since
        )
        .sort(-WorkoutSession.date)
        .to_list()
    )


# --------------------------------------------------------------- progress


class DayMark(BaseModel):
    date: dt.date
    done: bool
    is_rest: bool
    focus: str | None
    kcal: float
    exercises_done: int


class WeekBucket(BaseModel):
    week_start: dt.date
    sessions: int
    minutes: int
    kcal: float
    volume_kg: float


class PeriodStats(BaseModel):
    sessions: int
    planned: int
    minutes: int
    kcal: float
    volume_kg: float


class ProgressResponse(BaseModel):
    streak_days: int
    best_streak: int
    this_week: PeriodStats
    this_month: PeriodStats
    total_sessions: int
    calendar: list[DayMark]
    weekly: list[WeekBucket]
    # Bodyweight used for the calorie figures, so the UI can be honest about it.
    bodyweight_kg: float


def _stats(sessions: list[WorkoutSession], planned: int) -> PeriodStats:
    return PeriodStats(
        sessions=len(sessions),
        planned=planned,
        minutes=sum(s.duration_minutes or 0 for s in sessions)
        + sum(s.cardio_minutes for s in sessions),
        kcal=round(sum(s.kcal_burned for s in sessions), 1),
        volume_kg=round(sum(s.total_volume_kg() for s in sessions), 1),
    )


def _streaks(done_dates: set[dt.date], rest_days: set[int], today: dt.date) -> tuple[int, int]:
    """Current and best streak, in training days.

    A planned rest day neither extends nor breaks a streak — it is skipped.
    Counting rest as a miss would punish her for following the plan, and
    counting it as a hit would inflate every streak by one a week.

    Today is also skipped when nothing is logged yet, so the streak doesn't
    appear to collapse every morning before she has trained.
    """
    if not done_dates:
        return 0, 0
    # A plan where every day is a rest day would make the walk below run
    # forever, so there is nothing to count.
    if len(rest_days) >= 7:
        return 0, 0

    current = 0
    cursor = today
    if cursor not in done_dates:
        cursor -= dt.timedelta(days=1)
    earliest = min(done_dates)
    while cursor >= earliest:
        if cursor.weekday() in rest_days:
            cursor -= dt.timedelta(days=1)
            continue
        if cursor in done_dates:
            current += 1
            cursor -= dt.timedelta(days=1)
            continue
        break

    best = 0
    running = 0
    cursor = min(done_dates)
    while cursor <= today:
        if cursor.weekday() in rest_days:
            cursor += dt.timedelta(days=1)
            continue
        if cursor in done_dates:
            running += 1
            best = max(best, running)
        else:
            running = 0
        cursor += dt.timedelta(days=1)

    return current, max(best, current)


@router.get("/progress", response_model=ProgressResponse)
async def progress(
    user: CurrentUser,
    profile: CurrentProfile,
    days: int = Query(default=90, ge=7, le=365),
) -> ProgressResponse:
    today = dt.date.today()
    start = today - dt.timedelta(days=days - 1)

    all_sessions = (
        await WorkoutSession.find(WorkoutSession.user_id == user.id)
        .sort(-WorkoutSession.date)
        .to_list()
    )
    in_range = [s for s in all_sessions if start <= s.date <= today]
    by_date = {s.date: s for s in all_sessions}

    plan = await _existing(user.id)
    rest_days = {d.weekday for d in plan.days if d.is_rest} if plan else set()
    focus_by_weekday = {d.weekday: d.focus for d in plan.days} if plan else {}

    calendar = [
        DayMark(
            date=day,
            done=day in by_date,
            is_rest=day.weekday() in rest_days,
            focus=by_date[day].focus if day in by_date else focus_by_weekday.get(day.weekday()),
            kcal=round(by_date[day].kcal_burned, 1) if day in by_date else 0.0,
            exercises_done=len(by_date[day].completed) if day in by_date else 0,
        )
        for day in (start + dt.timedelta(days=offset) for offset in range(days))
    ]

    # Monday-anchored, matching the rest of the app.
    week_start = today - dt.timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    trainable_this_week = sum(
        1 for offset in range(today.weekday() + 1)
        if (week_start + dt.timedelta(days=offset)).weekday() not in rest_days
    )
    trainable_this_month = sum(
        1 for offset in range((today - month_start).days + 1)
        if (month_start + dt.timedelta(days=offset)).weekday() not in rest_days
    )

    weekly: list[WeekBucket] = []
    for index in range(7, -1, -1):
        bucket_start = week_start - dt.timedelta(weeks=index)
        bucket_end = bucket_start + dt.timedelta(days=6)
        bucket = [s for s in all_sessions if bucket_start <= s.date <= bucket_end]
        weekly.append(
            WeekBucket(
                week_start=bucket_start,
                sessions=len(bucket),
                minutes=sum(s.duration_minutes or 0 for s in bucket)
                + sum(s.cardio_minutes for s in bucket),
                kcal=round(sum(s.kcal_burned for s in bucket), 1),
                volume_kg=round(sum(s.total_volume_kg() for s in bucket), 1),
            )
        )

    current, best = _streaks(set(by_date), rest_days, today)

    return ProgressResponse(
        streak_days=current,
        best_streak=best,
        this_week=_stats([s for s in all_sessions if s.date >= week_start], trainable_this_week),
        this_month=_stats(
            [s for s in all_sessions if s.date >= month_start], trainable_this_month
        ),
        total_sessions=len(all_sessions),
        calendar=calendar,
        weekly=weekly,
        bodyweight_kg=await _bodyweight(user.id, profile),
    )
