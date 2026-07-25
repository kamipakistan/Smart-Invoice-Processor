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
    
    # Provider Selection: ollama, openai, gemini, anthropic, groq, openrouter
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

    # Groq Model
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", os.getenv("groq_model", "qwen/qwen3.6-27b")).strip(",").strip('"').strip("'")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", os.getenv("groqapikey", "")).strip(",").strip('"').strip("'")

    # OpenRouter Model
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", os.getenv("openrouter_model", "google/gemma-4-31b-it:free")).strip(",").strip('"').strip("'")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", os.getenv("openrouter_api_key", "")).strip(",").strip('"').strip("'")

    # Application & Ingestion Settings
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
    MAX_BATCH_FILES: int = int(os.getenv("MAX_BATCH_FILES", "200"))
    BATCH_INGESTION_ROOT: str = os.getenv("BATCH_INGESTION_ROOT", "/data/ingestion")

    # Langfuse Telemetry & Observability
    LANGFUSE_PUBLIC_KEY: str = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    LANGFUSE_SECRET_KEY: str = os.getenv("LANGFUSE_SECRET_KEY", "")
    LANGFUSE_HOST: str = os.getenv("LANGFUSE_HOST", "http://localhost:4001")
    LANGFUSE_PUBLIC_HOST: str = os.getenv("LANGFUSE_PUBLIC_HOST", "http://localhost:4001")

    # Authentication & Security Settings
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "changeme-generate-a-real-32-byte-secret")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "true").lower() in ("true", "1", "yes")

    # Rate Limiting & Account Lockout Settings
    LOGIN_RATE_LIMIT: str = os.getenv("LOGIN_RATE_LIMIT", "10/minute").strip('"').strip("'")
    LOGIN_LOCKOUT_ATTEMPTS: int = int(os.getenv("LOGIN_LOCKOUT_ATTEMPTS", "5"))
    LOGIN_LOCKOUT_MINUTES: int = int(os.getenv("LOGIN_LOCKOUT_MINUTES", "15"))

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
