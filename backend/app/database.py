from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import create_engine
from app.config import settings

# Async Engine for FastAPI
async_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_size=10,
    max_overflow=20
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Synchronous Engine for Celery tasks
sync_db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
sync_engine = create_engine(sync_db_url, pool_pre_ping=True)
SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

Base = declarative_base()

async def get_async_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
