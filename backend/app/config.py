import os
import zoneinfo
import datetime
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env file from root or current working directory if present
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)
else:
    load_dotenv(override=True)

PKT_TZ = zoneinfo.ZoneInfo("Asia/Karachi")

def get_pkt_now() -> datetime.datetime:
    """Returns current datetime in Pakistan Standard Time (PKT / Asia/Karachi)."""
    return datetime.datetime.now(PKT_TZ)

def get_pkt_today_iso() -> str:
    """Returns today's date in YYYY-MM-DD format according to Pakistan Standard Time."""
    return datetime.datetime.now(PKT_TZ).strftime("%Y-%m-%d")

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Invoice Processor (SIP)"
    API_V1_STR: str = "/api/v1"
    TIMEZONE: str = "Asia/Karachi"
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://admin:secretpassword@localhost:5434/fbr_sip_db")
    
    # Redis & Celery
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6380/0")
    
    # MinIO S3
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9010")
    MINIO_EXTERNAL_ENDPOINT: str = os.getenv("MINIO_EXTERNAL_ENDPOINT", "http://localhost:9010")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minioadminpassword")
    MINIO_BUCKET_RAW: str = os.getenv("MINIO_BUCKET_RAW", "raw-invoices")
    MINIO_BUCKET_PROCESSED: str = os.getenv("MINIO_BUCKET_PROCESSED", "processed-invoices")
    
    # Provider Selection: ollama, openai, gemini, anthropic
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "gemini")

    # Ollama Model
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen3-vl:8b")
    OLLAMA_HOST: str = os.getenv("OLLAMA_HOST", "http://localhost:11434")

    # OpenAI Model
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # Gemini Model
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # Anthropic Model
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

    # Application & Ingestion Settings
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
    MAX_BATCH_FILES: int = int(os.getenv("MAX_BATCH_FILES", "200"))
    BATCH_INGESTION_ROOT: str = os.getenv("BATCH_INGESTION_ROOT", "/data/ingestion")

    # Langfuse Telemetry & Observability
    LANGFUSE_PUBLIC_KEY: str = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    LANGFUSE_SECRET_KEY: str = os.getenv("LANGFUSE_SECRET_KEY", "")
    LANGFUSE_HOST: str = os.getenv("LANGFUSE_HOST", "http://localhost:4001")
    LANGFUSE_PUBLIC_HOST: str = os.getenv("LANGFUSE_PUBLIC_HOST", "http://localhost:4001")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
