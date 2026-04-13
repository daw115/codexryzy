from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    app_name: str = "Work Assistant API"
    app_env: str = "development"
    app_log_level: str = "INFO"
    app_port: int = 8080
    app_api_key: str | None = Field(None, alias="APP_API_KEY")

    database_url: str = Field(..., alias="DATABASE_URL")
    database_min_pool_size: int = Field(1, alias="DATABASE_MIN_POOL_SIZE")
    database_max_pool_size: int = Field(10, alias="DATABASE_MAX_POOL_SIZE")
    vector_dimensions: int = Field(1536, alias="VECTOR_DIMENSIONS")

    anthropic_api_key: str | None = Field(None, alias="ANTHROPIC_API_KEY")
    anthropic_model: str | None = Field(None, alias="ANTHROPIC_MODEL")
    llm_api_url: str | None = Field(
        "https://api.quatarly.cloud/v0/chat/completions",
        validation_alias=AliasChoices(
            "LLM_API_URL",
            "QUATARLY_API_URL",
            "QUATERLY_API_URL",
            "ANTHROPIC_BASE_URL",
        ),
    )
    llm_api_key: str | None = Field(
        None,
        validation_alias=AliasChoices(
            "LLM_API_KEY",
            "QUATARLY_API_KEY",
            "QUATERLY_API_KEY",
            "ANTHROPIC_API_KEY",
        ),
    )
    llm_model: str | None = Field(
        "claude-sonnet-4-6-20250929",
        validation_alias=AliasChoices("LLM_MODEL", "QUATARLY_MODEL", "QUATERLY_MODEL"),
    )
    embedding_api_url: str | None = Field(None, alias="EMBEDDING_API_URL")
    embedding_api_key: str | None = Field(None, alias="EMBEDDING_API_KEY")
    embedding_provider: str | None = Field(None, alias="EMBEDDING_PROVIDER")
    embedding_model: str | None = Field(None, alias="EMBEDDING_MODEL")

    vikunja_url: str | None = Field(None, alias="VIKUNJA_URL")
    vikunja_api_token: str | None = Field(None, alias="VIKUNJA_API_TOKEN")
    vikunja_default_project_id: int | None = Field(None, alias="VIKUNJA_DEFAULT_PROJECT_ID")

    object_storage_bucket: str | None = Field(None, alias="OBJECT_STORAGE_BUCKET")
    object_storage_region: str | None = Field(None, alias="OBJECT_STORAGE_REGION")
    object_storage_endpoint: str | None = Field(None, alias="OBJECT_STORAGE_ENDPOINT")
    object_storage_access_key: str | None = Field(None, alias="OBJECT_STORAGE_ACCESS_KEY")
    object_storage_secret_key: str | None = Field(None, alias="OBJECT_STORAGE_SECRET_KEY")

    # Optional: set your Quatarly monthly token quota to see remaining tokens in /v1/coverage/status
    llm_monthly_token_quota: int | None = Field(None, alias="LLM_MONTHLY_TOKEN_QUOTA")

    # Quatarly credits API — defaults to derived from llm_api_url
    # e.g. https://api.quatarly.cloud/v0/user/credits/{api_key}
    quatarly_credits_base_url: str | None = Field(None, alias="QUATARLY_CREDITS_BASE_URL")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
