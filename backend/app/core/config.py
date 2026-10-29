from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration loaded from .env.

    Fields without defaults are required: if one is missing the app refuses to
    start rather than failing later on the first API call.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mongodb_uri: str
    mongodb_db: str = "befit"

    jwt_secret_key: str = Field(min_length=32)
    access_token_minutes: int = 30
    refresh_token_days: int = 30

    gemini_api_key: str
    gemini_chat_model: str = "gemini-3.5-flash"
    gemini_utility_model: str = "gemini-3.5-flash-lite"

    usda_fdc_api_key: str

    sarvam_api_key: str | None = None
    sarvam_stt_model: str = "saarika:v2.5"
    google_vision_api_key: str | None = None
    tavily_api_key: str | None = None

    openfoodfacts_user_agent: str = "BeFit/1.0"

    # Every "today" the server computes is a day in this zone, not the host's.
    # Cloud hosts run in UTC, which put a 1 a.m. snack on yesterday's log and
    # guessed "breakfast" for a 1 p.m. lunch.
    app_timezone: str = "Asia/Kolkata"

    # Comma-separated. When set, only these addresses can register — without
    # it, anyone who finds the URL can sign up and spend the Gemini quota.
    allowed_emails: str = ""

    # Seconds. Gemini is the slowest dependency by far; a request that has not
    # answered by then is better abandoned than waited on.
    gemini_timeout_s: float = 20.0
    # Wall-clock budget for resolving one unknown food through every tier.
    resolve_budget_s: float = 25.0

    # Hide /docs and /openapi.json in production.
    expose_docs: bool = True

    @property
    def allowed_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.allowed_emails.split(",") if e.strip()}

    @property
    def voice_transcription_available(self) -> bool:
        return self.sarvam_api_key is not None


@lru_cache
def get_settings() -> Settings:
    return Settings()
