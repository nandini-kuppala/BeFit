"""Web search for nutrition facts, via Tavily.

The tier of last resort before guessing. When a food is in neither the local
database nor USDA — "pumpkin seeds" was exactly this case — searching the web
and extracting the numbers from what real sources publish beats asking a model
to recall them from memory.

The result still gets labelled `estimated`, because an LLM reading a web page is
not the same thing as a food-composition table, and the app's whole premise is
that the difference is visible.
"""

import logging

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)

SEARCH_URL = "https://api.tavily.com/search"

# Sites that publish per-100g composition rather than recipe blogs.
PREFERRED_DOMAINS = [
    "nutritionvalue.org",
    "fdc.nal.usda.gov",
    "nutritiondata.self.com",
    "myfooddata.com",
    "usda.gov",
    "healthline.com",
    "webmd.com",
    "nutritionix.com",
]


async def search_nutrition(food_name: str, max_results: int = 5) -> list[dict]:
    """Snippets likely to contain per-100g values for this food."""
    settings = get_settings()
    if not settings.tavily_api_key:
        return []

    payload = {
        "api_key": settings.tavily_api_key,
        "query": f"{food_name} nutrition facts per 100g calories protein fat carbohydrate",
        "search_depth": "basic",
        "max_results": max_results,
        "include_answer": True,
        "include_domains": PREFERRED_DOMAINS,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(SEARCH_URL, json=payload)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("Tavily search failed for %r: %s", food_name, exc)
        return []

    results = []
    answer = data.get("answer")
    if answer:
        results.append({"title": "summary", "url": "", "content": answer})

    for item in data.get("results", []):
        content = (item.get("content") or "").strip()
        if content:
            results.append(
                {
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "content": content[:1200],
                }
            )

    if not results:
        # Retry without the domain filter — an obscure food may not appear on
        # any of the preferred sites.
        payload.pop("include_domains", None)
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(SEARCH_URL, json=payload)
                response.raise_for_status()
                data = response.json()
            for item in data.get("results", [])[:max_results]:
                content = (item.get("content") or "").strip()
                if content:
                    results.append(
                        {
                            "title": item.get("title", ""),
                            "url": item.get("url", ""),
                            "content": content[:1200],
                        }
                    )
        except (httpx.HTTPError, ValueError):
            return []

    return results
