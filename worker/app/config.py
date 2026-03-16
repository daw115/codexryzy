from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_chat_model: str = "gpt-4o-mini"
    openai_embed_model: str = "text-embedding-3-small"
    database_url: str = "postgresql+psycopg://postgres:postgres@postgres:5432/meeting_brain"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_refresh_token: str = ""
    google_drive_root_folder_id: str = ""
    worker_poll_interval_sec: int = 30
    whisper_model: str = "base"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
