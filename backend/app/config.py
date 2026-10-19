from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    PORT: int = 8000
    HOST: str = "127.0.0.1"
    CORS_ORIGINS: str = "http://localhost:3000"

    # AI Keys (Optional during local dev / test runs)
    GROQ_API_KEY: str = ""
    TOGETHER_API_KEY: str = ""
    CEREBRAS_API_KEY: str = ""

    TEMP_STORAGE_DIR: str = "./temp_storage"
    MAX_AUDIO_UPLOAD_MB: int = 25
    MAX_VIDEO_UPLOAD_MB: int = 500
    CLEANUP_RETENTION_MINUTES: int = 60

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()

