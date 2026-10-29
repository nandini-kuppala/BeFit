"""One shared HTTP client for every outbound API.

Opening a new client per call meant a fresh DNS lookup and TLS handshake to
USDA, Open Food Facts, Tavily or Sarvam on every single request — easily a few
hundred milliseconds each from a cold container. A pooled client reuses them.
"""

import httpx

_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(12.0, connect=5.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            follow_redirects=True,
        )
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
