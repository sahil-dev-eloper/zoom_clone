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

_backend_dir = Path(__file__).resolve().parents[1]
_default_db = f"sqlite:///{(_backend_dir / 'zoom_clone.db').as_posix()}"
DATABASE_URL = os.getenv("DATABASE_URL", _default_db)

if DATABASE_URL.startswith("sqlite:///"):
    path_str = DATABASE_URL[len("sqlite:///"):]
    # If zoom.db is referenced, align with zoom_clone.db
    if path_str.endswith("zoom.db"):
        path_str = path_str[:-7] + "zoom_clone.db"

    # Check if path is relative (Windows drive letter or leading slash)
    is_absolute = (len(path_str) > 2 and path_str[1] == ":") or path_str.startswith("/")
    if not is_absolute:
        clean_rel = path_str.lstrip("./").lstrip(".\\")
        abs_file = (_backend_dir / clean_rel).resolve()
        DATABASE_URL = f"sqlite:///{abs_file.as_posix()}"

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
