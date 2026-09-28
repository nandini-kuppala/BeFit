from functools import lru_cache

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

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
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

    @property
    def voice_transcription_available(self) -> bool:
        return self.sarvam_api_key is not None


@lru_cache
def get_settings() -> Settings:
    return Settings()
