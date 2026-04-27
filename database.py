# Developed by Benedict U.
import os
from contextlib import contextmanager

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, create_engine, event, func, select
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

Base = declarative_base()


def _normalize_database_url(url: str | None) -> str:
    if not url:
        return f"sqlite:///{os.path.join(os.path.dirname(__file__), 'chorister_timetable.db')}"
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


DATABASE_URL = _normalize_database_url(
    os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, future=True, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Chorister(Base):
    __tablename__ = "choristers"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RosterEntry(Base):
    __tablename__ = "roster_entries"

    id = Column(Integer, primary_key=True)
    service_date = Column(Date, nullable=False, unique=True, index=True)

    hymn_chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="SET NULL"))
    hymn_song_title = Column(String(255), nullable=False, default="", server_default="")
    hymn_musical_key = Column(String(64), nullable=False, default="", server_default="")

    praise_worship_chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="SET NULL"))
    praise_worship_musical_key = Column(String(64), nullable=False, default="", server_default="")
    praise_worship_loop_bitrate = Column(String(64), nullable=False, default="", server_default="")

    thanksgiving_chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="SET NULL"))
    thanksgiving_musical_key = Column(String(64), nullable=False, default="", server_default="")
    thanksgiving_loop_bitrate = Column(String(64), nullable=False, default="", server_default="")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    hymn_chorister = relationship("Chorister", foreign_keys=[hymn_chorister_id])
    praise_worship_chorister = relationship("Chorister", foreign_keys=[praise_worship_chorister_id])
    thanksgiving_chorister = relationship("Chorister", foreign_keys=[thanksgiving_chorister_id])


def init_db():
    Base.metadata.create_all(bind=engine)


@contextmanager
def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def list_choristers(session: Session):
    rows = session.execute(select(Chorister).order_by(Chorister.name)).scalars().all()
    return [serialize_chorister(row) for row in rows]


def add_chorister(session: Session, name: str) -> dict:
    row = Chorister(name=name)
    session.add(row)
    session.commit()
    session.refresh(row)
    return serialize_chorister(row)


def delete_chorister(session: Session, chorister_id: int):
    row = session.get(Chorister, chorister_id)
    if row:
        session.delete(row)
        session.commit()


def list_roster_entries(session: Session, month_start, month_end):
    rows = session.execute(
        select(RosterEntry)
        .where(RosterEntry.service_date >= month_start, RosterEntry.service_date <= month_end)
        .order_by(RosterEntry.service_date)
    ).scalars().all()
    return [serialize_roster_entry(row) for row in rows]


def get_roster_entry(session: Session, entry_id: int) -> dict | None:
    row = session.get(RosterEntry, entry_id)
    return serialize_roster_entry(row) if row else None


def create_roster_entry(session: Session, data: dict) -> dict:
    row = RosterEntry(**data)
    session.add(row)
    session.commit()
    session.refresh(row)
    return serialize_roster_entry(row)


def update_roster_entry(session: Session, entry_id: int, data: dict) -> dict | None:
    row = session.get(RosterEntry, entry_id)
    if not row:
        return None
    for key, value in data.items():
        setattr(row, key, value)
    session.commit()
    session.refresh(row)
    return serialize_roster_entry(row)


def delete_roster_entry(session: Session, entry_id: int):
    row = session.get(RosterEntry, entry_id)
    if row:
        session.delete(row)
        session.commit()


def serialize_chorister(row: Chorister) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def serialize_roster_entry(row: RosterEntry) -> dict:
    return {
        "id": row.id,
        "service_date": row.service_date.isoformat(),
        "hymn_chorister_id": row.hymn_chorister_id,
        "hymn_song_title": row.hymn_song_title or "",
        "hymn_musical_key": row.hymn_musical_key or "",
        "praise_worship_chorister_id": row.praise_worship_chorister_id,
        "praise_worship_musical_key": row.praise_worship_musical_key or "",
        "praise_worship_loop_bitrate": row.praise_worship_loop_bitrate or "",
        "thanksgiving_chorister_id": row.thanksgiving_chorister_id,
        "thanksgiving_musical_key": row.thanksgiving_musical_key or "",
        "thanksgiving_loop_bitrate": row.thanksgiving_loop_bitrate or "",
        "hymn_chorister_name": row.hymn_chorister.name if row.hymn_chorister else None,
        "praise_worship_chorister_name": row.praise_worship_chorister.name if row.praise_worship_chorister else None,
        "thanksgiving_chorister_name": row.thanksgiving_chorister.name if row.thanksgiving_chorister else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
