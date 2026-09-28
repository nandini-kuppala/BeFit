"""Fuzzy name matching for food lookup.

Mongo's `$text` index scores on term frequency, which is the wrong tool here:
"pumpkin seeds" and "sesame seeds" share a term, so a text search happily
returns every seed in the database and ranks them as though they were answers.
Worse, the resolution chain used to accept the top one, which is how a search
for pumpkin seeds ended up logging flaxseed.

Scoring here is deliberately token-first:

    score = 0.75 * token_coverage + 0.25 * whole_string_ratio

Token coverage asks "is every word I searched for actually present?", allowing
a fuzzy match per token so typos survive. Whole-string ratio is a small tiebreak
so that, among equally covered names, the closer one wins.

    "pumpkin sed"   vs "Pumpkin seeds"  -> 0.88   accepted, typo forgiven
    "pumpkin seeds" vs "Sesame seeds"   -> 0.53   rejected, only "seeds" matched
"""

import re
from difflib import SequenceMatcher

# Words that carry no distinguishing meaning in a food name. Dropping them stops
# "boiled egg" from matching every boiled thing on the strength of "boiled".
_FILLER = {
    "a", "an", "the", "of", "with", "and", "or", "some", "my", "fresh", "raw",
    "plain", "whole", "piece", "pieces", "serving", "servings", "cup", "cups",
}

_PUNCT = re.compile(r"[^\w\s]+")
_SPACE = re.compile(r"\s+")

# A token pair this close counts as the same word — enough for "sed"/"seeds"
# and "chiken"/"chicken", tight enough that "sesame"/"pumpkin" stays a miss.
TOKEN_MATCH = 0.70

# Show it in search results.
SEARCH_FLOOR = 0.55
# Trust it enough to log without asking anything else.
CONFIDENT = 0.80


def normalise(text: str) -> str:
    text = _PUNCT.sub(" ", (text or "").lower())
    return _SPACE.sub(" ", text).strip()


def tokens(text: str) -> list[str]:
    words = [w for w in normalise(text).split(" ") if w]
    meaningful = [w for w in words if w not in _FILLER]
    # If the query was nothing but filler, fall back to the raw words rather
    # than matching everything.
    return meaningful or words


def _ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _singular(word: str) -> str:
    """Crude depluralisation so "seeds" and "seed" are the same token."""
    if len(word) > 3 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("es") and not word.endswith("ses"):
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def token_coverage(query_tokens: list[str], name_tokens: list[str]) -> float:
    """Share of the query's words that appear in the name, fuzzily."""
    if not query_tokens:
        return 0.0
    if not name_tokens:
        return 0.0

    singular_names = [_singular(t) for t in name_tokens]
    total = 0.0
    for raw in query_tokens:
        q = _singular(raw)
        best = 0.0
        for n in singular_names:
            if q == n:
                best = 1.0
                break
            # A short query word inside a longer name word ("egg" in "eggplant")
            # is not a match; require real similarity instead.
            best = max(best, _ratio(q, n))
        total += best if best >= TOKEN_MATCH else 0.0
    return total / len(query_tokens)


def score(query: str, name: str, aliases: list[str] | None = None) -> float:
    """0.0-1.0, how well `name` (or one of its aliases) answers `query`."""
    q = normalise(query)
    if not q:
        return 0.0

    candidates = [name, *(aliases or [])]
    best = 0.0
    q_tokens = tokens(q)

    for candidate in candidates:
        c = normalise(candidate)
        if not c:
            continue
        if c == q:
            return 1.0

        coverage = token_coverage(q_tokens, tokens(c))
        whole = _ratio(q, c)
        combined = 0.75 * coverage + 0.25 * whole

        # A clean prefix is a strong signal: "chick" -> "Chickpea curry".
        if c.startswith(q) or q.startswith(c):
            combined = max(combined, 0.85 + 0.15 * whole)

        best = max(best, combined)

    return round(min(best, 1.0), 4)


def best_of(query: str, candidates: list[str]) -> tuple[str | None, float]:
    """Pick the closest of several names — used to sanity-check what an external
    API handed back before trusting it."""
    winner, top = None, 0.0
    for candidate in candidates:
        value = score(query, candidate)
        if value > top:
            winner, top = candidate, value
    return winner, top
