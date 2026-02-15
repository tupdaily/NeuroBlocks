"""Configuration management for AIPlayground backend."""

from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    runpod_api_key: str = ""
    runpod_enabled: bool = False
    backend_url: str = "http://localhost:8000"
    runpod_callback_enabled: bool = False
    openai_api_key: str = ""

    # Supabase configuration
    supabase_url: str = ""
    supabase_key: str = ""  # Fallback for backward compatibility
    supabase_anon_key: str = ""  # Anon key for frontend operations
    supabase_service_role_key: str = ""  # Service role key for backend operations

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Set RunPod API key globally for Flash
if settings.runpod_api_key:
    os.environ["RUNPOD_API_KEY"] = settings.runpod_api_key
