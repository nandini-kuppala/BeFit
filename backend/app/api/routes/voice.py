import datetime as dt

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.models.logs import Meal
from app.models.nutrients import Nutrients
from app.services import gemini, nutrition, sarvam

router = APIRouter(prefix="/voice", tags=["voice"])

MAX_AUDIO_BYTES = 12 * 1024 * 1024


class DraftItem(BaseModel):
    """One parsed food, resolved but NOT yet saved.

    Everything here goes to a review sheet first. Silently trusting a
    transcription plus a lookup is how a tracker quietly drifts 300 kcal a day.
    """

    food_id: str | None
    name: str
    quantity: float
    unit: str
    grams: float
    nutrients: Nutrients
    source: str
    confidence: str
    resolved: bool


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    meal: Meal | None = None
    date: dt.date = Field(default_factory=dt.date.today)


class ParseResponse(BaseModel):
    transcript: str
    meal: Meal | None
    items: list[DraftItem]


def _guess_meal(hour: int) -> Meal:
    if hour < 10:
        return "breakfast"
    if hour < 12:
        return "mid_morning"
    if hour < 16:
        return "lunch"
    if hour < 19:
        return "snack"
    return "dinner"


@router.post("/parse", response_model=ParseResponse)
async def parse(user: CurrentUser, body: ParseRequest) -> ParseResponse:
    parsed = await gemini.parse_food_text(body.text)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="I couldn't pick out any food from that. Try naming the dish and how much.",
        )

    items: list[DraftItem] = []
    for entry in parsed:
        food = await nutrition.resolve(entry.food, user.id)
        if food is None:
            items.append(
                DraftItem(
                    food_id=None,
                    name=entry.food.title(),
                    quantity=entry.quantity,
                    unit=entry.unit,
                    grams=0.0,
                    nutrients=Nutrients(),
                    source="ai",
                    confidence="estimated",
                    resolved=False,
                )
            )
            continue

        grams = nutrition.to_grams(food, entry.quantity, entry.unit)
        items.append(
            DraftItem(
                food_id=str(food.id),
                name=food.name,
                quantity=entry.quantity,
                unit=entry.unit,
                grams=round(grams, 1),
                nutrients=food.per_100g.scaled(grams).rounded(1),
                source=food.source,
                confidence=food.confidence,
                resolved=True,
            )
        )

    meal = body.meal or next((p.meal for p in parsed if p.meal), None)
    if meal not in ("breakfast", "mid_morning", "lunch", "snack", "dinner"):
        meal = _guess_meal(dt.datetime.now().hour)

    return ParseResponse(transcript=body.text, meal=meal, items=items)


class TranscribeResponse(BaseModel):
    transcript: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    user: CurrentUser,
    file: UploadFile = File(...),
    language_code: str = "unknown",
) -> TranscribeResponse:
    """Server-side transcription for Indian languages.

    The app's default is Android's on-device recogniser — free, and the audio
    never leaves the phone. This path is the opt-in alternative.
    """
    if not get_settings().voice_transcription_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server transcription isn't configured. Use on-device voice input.",
        )

    audio = await file.read()
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Recording too long. Keep it under a minute.",
        )

    # Audio is transcribed and discarded — only the resulting text is stored.
    transcript = await sarvam.transcribe(audio, file.filename or "audio.wav", language_code)
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="I couldn't make that out. Try again somewhere quieter.",
        )
    return TranscribeResponse(transcript=transcript)
