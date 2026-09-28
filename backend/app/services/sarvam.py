"""Sarvam AI speech-to-text — optional, for Indian languages and code-mixed
speech.

The app's default is Android's on-device recogniser, which is free and keeps
audio on the phone. This path exists for when she wants to log in Tamil or
Hindi, where Sarvam is materially better.
"""

import logging

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)

STT_URL = "https://api.sarvam.ai/speech-to-text"


async def transcribe(
    audio: bytes, filename: str = "audio.wav", language_code: str = "unknown"
) -> str | None:
    settings = get_settings()
    if not settings.sarvam_api_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                STT_URL,
                headers={"api-subscription-key": settings.sarvam_api_key},
                files={"file": (filename, audio, "audio/wav")},
                data={
                    "model": settings.sarvam_stt_model,
                    "mode": "transcribe",
                    "language_code": language_code,
                },
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("Sarvam transcription failed: %s", exc)
        return None

    transcript = payload.get("transcript") or payload.get("text")
    return transcript.strip() if transcript else None
