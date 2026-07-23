from sqlalchemy import Column, BigInteger, Integer, String, Float, DateTime, ForeignKey, Text
from app.database import Base
from app.config import get_pkt_now

class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), default=get_pkt_now, index=True)
    level = Column(String(16), default="INFO", index=True) # INFO, WARNING, ERROR, CRITICAL
    category = Column(String(32), default="SYSTEM", index=True) # AI_PROVIDER, CELERY_PIPELINE, MINIO_STORAGE, API, SYSTEM
    event = Column(String(255), nullable=False) # Short title/event name
    provider = Column(String(32), nullable=True, index=True) # gemini, openai, anthropic, ollama
    model_name = Column(String(128), nullable=True) # gemini-3.5-flash, gpt-4o, qwen3-vl:8b
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    latency_ms = Column(Float, nullable=True)
    invoice_id = Column(Integer, ForeignKey("invoice_headers.id", ondelete="SET NULL"), nullable=True, index=True)
    batch_id = Column(String(64), nullable=True, index=True)
    message = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
