"""A small in-process rate limiter.

Every AI-backed route spends a free-tier quota that is shared by the whole
deployment: one runaway client — or one person hammering the voice button —
can exhaust Gemini for the day. Login needs a ceiling for the usual reason.

In-memory is deliberate. The API runs as one process on one instance; a shared
store (Redis) would be the next step only once it runs on several.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_hits: dict[str, deque[float]] = defaultdict(deque)


def check(key: str, limit: int, window_s: float) -> None:
    now = time.monotonic()
    bucket = _hits[key]
    while bucket and now - bucket[0] > window_s:
        bucket.popleft()
    if len(bucket) >= limit:
        retry = int(window_s - (now - bucket[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests — try again in {retry} s.",
            headers={"Retry-After": str(retry)},
        )
    bucket.append(now)
    # Keep the table from growing without bound under many distinct keys.
    if len(_hits) > 10_000:
        for stale in [k for k, v in _hits.items() if not v]:
            _hits.pop(stale, None)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
