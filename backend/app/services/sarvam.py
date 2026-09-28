"""Sarvam AI speech-to-text.

This is how voice logging transcribes. Android's on-device recogniser is free
and keeps audio on the phone, but its generic language model mangles Indian
food names, and a wrong transcript becomes a wrong log two steps later. Sarvam
is trained on Indian and code-mixed speech, which is what actually gets spoken.

Two details that are easy to get wrong and produce silent failures:

  - The model must be `saarika:*`. `saaras:*` is the speech-to-TRANSLATE
    endpoint's model; pointing this endpoint at it returns lower-quality,
    differently-shaped output.
  - The upload is declared `application/octet-stream`, not by its real type.
    Android records AAC in an m4a container, which Sarvam decodes perfectly
    well but rejects at the door: its content-type allowlist covers wav, mp3
    and raw PCM but not m4a. Declaring the bytes as opaque gets them past the
    check and transcribed correctly.
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
                files={"file": (filename, audio, "application/octet-stream")},
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
