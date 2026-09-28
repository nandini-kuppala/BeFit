import datetime as dt

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentProfile, CurrentUser
from app.models.supplement import (
    SUPPLEMENT_TIME_LABELS,
    SUPPLEMENT_TIME_ORDER,
    Supplement,
    SupplementLog,
    SupplementTime,
)

router = APIRouter(prefix="/supplements", tags=["supplements"])


# A starting list for a new profile, so the screen is never an empty box with
# an "Add" button. These are suggestions to edit, not prescriptions.
STARTER_SUPPLEMENTS: list[dict] = [
    {
        "name": "Vitamin D3",
        "dose": "60,000 IU weekly",
        "time_of_day": "breakfast",
        "days": [6],
        "note": "Fat-soluble — take it with a meal that has some fat in it.",
    },
    {
        "name": "Omega-3",
        "dose": "1 g",
        "time_of_day": "breakfast",
        "note": "Take with food. Splitting it across two meals reduces the aftertaste.",
    },
    {
        "name": "Iron",
        "dose": "As prescribed",
        "time_of_day": "evening",
        "note": "Vitamin C helps absorption. Keep 4 hours clear of levothyroxine.",
    },
]


class SupplementBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    dose: str = Field(default="", max_length=80)
    time_of_day: SupplementTime = "morning"
    days: list[int] = Field(default_factory=list)
    note: str | None = Field(default=None, max_length=300)
    is_active: bool = True

    def validated_days(self) -> list[int]:
        return sorted({day for day in self.days if 0 <= day <= 6})


class SupplementOut(BaseModel):
    id: str
    name: str
    dose: str
    time_of_day: str
    time_label: str
    days: list[int]
    note: str | None
    is_active: bool
    sort_order: int


class TodaySupplement(SupplementOut):
    taken: bool
    # Set when the supplement binds levothyroxine and she is on it.
    interaction_warning: str | None = None


class TodayResponse(BaseModel):
    date: dt.date
    items: list[TodaySupplement]
    taken_count: int
    due_count: int


def _out(supplement: Supplement) -> dict:
    return {
        "id": str(supplement.id),
        "name": supplement.name,
        "dose": supplement.dose,
        "time_of_day": supplement.time_of_day,
        "time_label": SUPPLEMENT_TIME_LABELS.get(supplement.time_of_day, ""),
        "days": supplement.days,
        "note": supplement.note,
        "is_active": supplement.is_active,
        "sort_order": supplement.sort_order,
    }


async def _owned(user_id: PydanticObjectId, supplement_id: PydanticObjectId) -> Supplement:
    supplement = await Supplement.get(supplement_id)
    if supplement is None or supplement.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Supplement not found."
        )
    return supplement


def _sorted(items: list[Supplement]) -> list[Supplement]:
    return sorted(
        items,
        key=lambda s: (
            s.sort_order,
            SUPPLEMENT_TIME_ORDER.index(s.time_of_day)
            if s.time_of_day in SUPPLEMENT_TIME_ORDER
            else 99,
            s.name.lower(),
        ),
    )


@router.get("", response_model=list[SupplementOut])
async def list_supplements(user: CurrentUser) -> list[dict]:
    items = await Supplement.find(Supplement.user_id == user.id).to_list()
    return [_out(item) for item in _sorted(items)]


@router.post("", response_model=SupplementOut, status_code=status.HTTP_201_CREATED)
async def create_supplement(user: CurrentUser, body: SupplementBody) -> dict:
    existing = await Supplement.find(Supplement.user_id == user.id).count()
    supplement = Supplement(
        user_id=user.id,
        name=body.name.strip(),
        dose=body.dose.strip(),
        time_of_day=body.time_of_day,
        days=body.validated_days(),
        note=body.note,
        is_active=body.is_active,
        sort_order=existing,
    )
    await supplement.insert()
    return _out(supplement)


@router.post("/starter", response_model=list[SupplementOut])
async def add_starter_set(user: CurrentUser) -> list[dict]:
    """Seeds the suggested list, skipping anything she already has by name."""
    existing = await Supplement.find(Supplement.user_id == user.id).to_list()
    have = {item.name.lower() for item in existing}
    order = len(existing)

    for entry in STARTER_SUPPLEMENTS:
        if entry["name"].lower() in have:
            continue
        await Supplement(
            user_id=user.id,
            name=entry["name"],
            dose=entry["dose"],
            time_of_day=entry["time_of_day"],
            days=entry.get("days", []),
            note=entry.get("note"),
            sort_order=order,
        ).insert()
        order += 1

    items = await Supplement.find(Supplement.user_id == user.id).to_list()
    return [_out(item) for item in _sorted(items)]


@router.patch("/{supplement_id}", response_model=SupplementOut)
async def update_supplement(
    user: CurrentUser, supplement_id: PydanticObjectId, body: SupplementBody
) -> dict:
    supplement = await _owned(user.id, supplement_id)
    supplement.name = body.name.strip()
    supplement.dose = body.dose.strip()
    supplement.time_of_day = body.time_of_day
    supplement.days = body.validated_days()
    supplement.note = body.note
    supplement.is_active = body.is_active
    await supplement.save()
    return _out(supplement)


@router.delete("/{supplement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplement(user: CurrentUser, supplement_id: PydanticObjectId) -> None:
    supplement = await _owned(user.id, supplement_id)
    await SupplementLog.find(
        SupplementLog.user_id == user.id,
        SupplementLog.supplement_id == supplement.id,
    ).delete()
    await supplement.delete()


@router.get("/today", response_model=TodayResponse)
async def today(
    user: CurrentUser,
    profile: CurrentProfile,
    on: dt.date = Query(default_factory=dt.date.today),
) -> TodayResponse:
    items = await Supplement.find(Supplement.user_id == user.id).to_list()
    due = [item for item in _sorted(items) if item.due_on(on)]

    logged = await SupplementLog.find(
        SupplementLog.user_id == user.id, SupplementLog.date == on
    ).to_list()
    taken_ids = {entry.supplement_id for entry in logged}

    # Only warn if she is actually on something that minerals interfere with.
    gap_medication = next(
        (med for med in profile.medications if med.mineral_gap_minutes > 0), None
    )

    out: list[TodaySupplement] = []
    for item in due:
        warning = None
        if gap_medication and item.binds_levothyroxine():
            hours = gap_medication.mineral_gap_minutes // 60
            warning = (
                f"Keep {hours} h clear of {gap_medication.name} "
                f"({gap_medication.time}) — it blocks absorption."
            )
        out.append(
            TodaySupplement(
                **_out(item), taken=item.id in taken_ids, interaction_warning=warning
            )
        )

    return TodayResponse(
        date=on,
        items=out,
        taken_count=sum(1 for item in out if item.taken),
        due_count=len(out),
    )


@router.put("/{supplement_id}/taken", status_code=status.HTTP_204_NO_CONTENT)
async def mark_taken(
    user: CurrentUser,
    supplement_id: PydanticObjectId,
    on: dt.date = Query(default_factory=dt.date.today),
) -> None:
    supplement = await _owned(user.id, supplement_id)
    existing = await SupplementLog.find_one(
        SupplementLog.user_id == user.id,
        SupplementLog.supplement_id == supplement.id,
        SupplementLog.date == on,
    )
    if existing is None:
        await SupplementLog(
            user_id=user.id, supplement_id=supplement.id, date=on
        ).insert()


@router.delete("/{supplement_id}/taken", status_code=status.HTTP_204_NO_CONTENT)
async def unmark_taken(
    user: CurrentUser,
    supplement_id: PydanticObjectId,
    on: dt.date = Query(default_factory=dt.date.today),
) -> None:
    supplement = await _owned(user.id, supplement_id)
    existing = await SupplementLog.find_one(
        SupplementLog.user_id == user.id,
        SupplementLog.supplement_id == supplement.id,
        SupplementLog.date == on,
    )
    if existing is not None:
        await existing.delete()
