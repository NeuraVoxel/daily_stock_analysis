from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    flow_top_n: int = 10
    flow_top_m: int = 10
    cache_ttl_realtime_sec: int = 45
    cache_ttl_day_sec: int = 600
    cache_ttl_long_sec: int = 3600
    upstream_timeout_sec: int = 20
    cors_origins: str = (
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://127.0.0.1:8080,http://localhost:8080"
    )

    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


def get_settings() -> Settings:
    return Settings()
