from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, ai_quota
from app.api.uploads import read_limited
from app.core.clock import local_now
from app.core.config import get_settings
from app.models.logs import Meal
from app.services import drafts, gemini, sarvam

router = APIRouter(prefix="/voice", tags=["voice"])

MAX_AUDIO_BYTES = 8 * 1024 * 1024

# Re-exported: the mobile client and photo route share this shape.
DraftItem = drafts.DraftItem


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    meal: Meal | None = None


class ParseResponse(BaseModel):
    transcript: str
    meal: Meal | None
    items: list[DraftItem]


def guess_meal(hour: int) -> Meal:
    if hour < 10:
        return "breakfast"
    if hour < 12:
        return "mid_morning"
    if hour < 16:
        return "lunch"
    if hour < 19:
        return "snack"
    return "dinner"


@router.post("/parse", response_model=ParseResponse, dependencies=[ai_quota(20, 60)])
async def parse(user: CurrentUser, body: ParseRequest) -> ParseResponse:
    parsed = await gemini.parse_food_text(body.text)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="I couldn't pick out any food from that. Try naming the dish and how much.",
        )

    items = await drafts.build(parsed, user.id)

    meal = body.meal or next((p.meal for p in parsed if p.meal), None)
    if meal not in ("breakfast", "mid_morning", "lunch", "snack", "dinner"):
        # Her clock, not the server's: a UTC host called a 1 p.m. lunch breakfast.
        meal = guess_meal(local_now().hour)

    return ParseResponse(transcript=body.text, meal=meal, items=items)


class TranscribeResponse(BaseModel):
    transcript: str


@router.post(
    "/transcribe", response_model=TranscribeResponse, dependencies=[ai_quota(15, 60)]
)
async def transcribe(
    user: CurrentUser,
    file: UploadFile = File(...),
    language_code: str = "unknown",
) -> TranscribeResponse:
    """Server-side transcription for Indian languages.

    Audio is transcribed and discarded — only the resulting text is kept.
    """
    if not get_settings().voice_transcription_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server transcription isn't configured. Use on-device voice input.",
        )

    audio = await read_limited(file, MAX_AUDIO_BYTES, "Recording too long. Keep it under a minute.")
    transcript = await sarvam.transcribe(audio, file.filename or "audio.m4a", language_code[:10])
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="I couldn't make that out. Try again somewhere quieter.",
        )
    return TranscribeResponse(transcript=transcript)

