"""Database engine, session factory, and helpers."""

import os
from collections.abc import Generator
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

load_dotenv()

_default_db = f"sqlite:///{Path(__file__).resolve().parents[1] / 'zoom_clone.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", _default_db)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign key constraints for SQLite connections."""
    if "sqlite" in DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    """Return the current UTC time as a naive datetime."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_db() -> Generator[Session, None, None]:
    """Yield a database session that is closed after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
