from datetime import UTC, date, datetime

import pymongo
from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field


class Exercise(Document):
    name: str
    muscle_group: str
    equipment: str | None = None
    prescription: str = ""  # "3 × 12–15 · light"
    cues: list[str] = Field(default_factory=list)
    form_video_url: str | None = None
    is_system: bool = True
    owner_id: PydanticObjectId | None = None

    class Settings:
        name = "exercises"
        indexes = [pymongo.IndexModel([("muscle_group", pymongo.ASCENDING)])]


class PlannedExercise(BaseModel):
    name: str
    prescription: str
    exercise_id: PydanticObjectId | None = None


class PlanDay(BaseModel):
    weekday: int = Field(ge=0, le=6)  # Monday = 0
    focus: str
    summary: str = ""
    is_rest: bool = False
    is_veg: bool = False
    exercises: list[PlannedExercise] = Field(default_factory=list)
    # Editable in-app; the edit persists here.
    video_url: str | None = None
    video_title: str | None = None
    video_channel: str | None = None
    # Set by the weekly link-health check when the video 404s.
    video_unavailable: bool = False


class WorkoutPlan(Document):
    user_id: PydanticObjectId
    name: str = "My Week"
    days: list[PlanDay] = Field(default_factory=list)
    is_active: bool = True
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "workout_plans"
        indexes = [pymongo.IndexModel([("user_id", pymongo.ASCENDING)])]


class CompletedExercise(BaseModel):
    name: str
    sets_done: int = 0
    reps: str | None = None
    weight_kg: float | None = None

    def volume_kg(self) -> float:
        """Sets × reps × load. The single number that best tracks whether she is
        actually progressing, rather than just showing up."""
        if not self.weight_kg or not self.reps:
            return 0.0
        digits = "".join(ch if ch.isdigit() else " " for ch in self.reps).split()
        if not digits:
            return 0.0
        # "12-15" → take the low end, so volume never flatters the session.
        return self.sets_done * int(digits[0]) * self.weight_kg


class WorkoutSession(Document):
    user_id: PydanticObjectId
    date: date
    weekday: int
    focus: str
    completed: list[CompletedExercise] = Field(default_factory=list)
    video_done: bool = False
    cardio_minutes: int = 0
    duration_minutes: int | None = None
    felt: int | None = Field(default=None, ge=1, le=5)
    note: str | None = None
    # Computed server-side from METs and bodyweight at log time. Displayed for
    # progress only — never added back to the day's calorie budget, because the
    # activity factor in her TDEE already accounts for training.
    kcal_burned: float = 0.0

    def total_volume_kg(self) -> float:
        return sum(item.volume_kg() for item in self.completed)

    class Settings:
        name = "workout_sessions"
        indexes = [
            pymongo.IndexModel(
                [("user_id", pymongo.ASCENDING), ("date", pymongo.DESCENDING)],
                unique=True,
            ),
        ]
