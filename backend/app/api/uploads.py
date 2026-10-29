from fastapi import HTTPException, UploadFile, status

_CHUNK = 256 * 1024


async def read_limited(file: UploadFile, max_bytes: int, too_big: str) -> bytes:
    """Read an upload, refusing as soon as it passes `max_bytes`.

    Reading the whole body first and checking afterwards let a large upload
    fill a small host's memory before it was rejected.
    """
    if file.size is not None and file.size > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=too_big)
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_CHUNK):
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=too_big
            )
        chunks.append(chunk)
    return b"".join(chunks)


IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def image_mime(file: UploadFile) -> str:
    mime = (file.content_type or "").lower()
    if mime not in IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Send a JPEG, PNG, WebP or HEIC photo.",
        )
    return mime
