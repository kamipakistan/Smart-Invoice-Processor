import json
import traceback
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import SyncSessionLocal, AsyncSessionLocal
from app.models.system_log import SystemLog
from app.config import get_pkt_now

class LoggerService:
    @staticmethod
    def log_sync(
        event: str,
        level: str = "INFO",
        category: str = "SYSTEM",
        message: Optional[str] = None,
        provider: Optional[str] = None,
        model_name: Optional[str] = None,
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
        total_tokens: Optional[int] = None,
        latency_ms: Optional[float] = None,
        invoice_id: Optional[int] = None,
        batch_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        db_session: Optional[Session] = None
    ) -> None:
        """
        Synchronously persists a system log entry to PostgreSQL.
        Used by Celery workers, AI providers, and synchronous services.
        """
        should_close = False
        if db_session is None:
            db_session = SyncSessionLocal()
            should_close = True

        try:
            metadata_str = json.dumps(metadata) if metadata else None
            log_entry = SystemLog(
                timestamp=get_pkt_now(),
                level=level.upper(),
                category=category.upper(),
                event=event,
                provider=provider,
                model_name=model_name,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                latency_ms=latency_ms,
                invoice_id=invoice_id,
                batch_id=batch_id,
                message=message,
                metadata_json=metadata_str
            )
            db_session.add(log_entry)
            db_session.commit()
        except Exception as e:
            if db_session:
                db_session.rollback()
            print(f"[LoggerService Error] Failed to write log: {e}")
        finally:
            if should_close and db_session:
                db_session.close()

    @staticmethod
    async def log_async(
        event: str,
        level: str = "INFO",
        category: str = "SYSTEM",
        message: Optional[str] = None,
        provider: Optional[str] = None,
        model_name: Optional[str] = None,
        prompt_tokens: Optional[int] = None,
        completion_tokens: Optional[int] = None,
        total_tokens: Optional[int] = None,
        latency_ms: Optional[float] = None,
        invoice_id: Optional[int] = None,
        batch_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        db_session: Optional[AsyncSession] = None
    ) -> None:
        """
        Asynchronously persists a system log entry to PostgreSQL.
        Used by FastAPI routes and async handlers.
        """
        should_close = False
        if db_session is None:
            db_session = AsyncSessionLocal()
            should_close = True

        try:
            metadata_str = json.dumps(metadata) if metadata else None
            log_entry = SystemLog(
                timestamp=get_pkt_now(),
                level=level.upper(),
                category=category.upper(),
                event=event,
                provider=provider,
                model_name=model_name,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                latency_ms=latency_ms,
                invoice_id=invoice_id,
                batch_id=batch_id,
                message=message,
                metadata_json=metadata_str
            )
            db_session.add(log_entry)
            await db_session.commit()
        except Exception as e:
            if db_session:
                await db_session.rollback()
            print(f"[LoggerService Async Error] Failed to write log: {e}")
        finally:
            if should_close and db_session:
                await db_session.close()

logger_service = LoggerService()
