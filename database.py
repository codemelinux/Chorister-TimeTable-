# Developed by Benedict U.
import os
from contextlib import contextmanager

import bcrypt
from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, create_engine, event, func, select, or_
from sqlalchemy.orm import Session, declarative_base, relationship, selectinload, sessionmaker

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
    pin_hash = Column(Text, nullable=True)
    has_portal_access = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    lyrics = Column(Text, nullable=False, default="", server_default="")
    category = Column(String(32), nullable=False, default="general", server_default="general")
    hyperlink = Column(Text, nullable=True)
    submitted_by_chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="SET NULL"), nullable=True)
    google_doc_id = Column(Text, nullable=True)
    google_doc_url = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    submitted_by = relationship("Chorister", foreign_keys=[submitted_by_chorister_id])


class RosterEntry(Base):
    __tablename__ = "roster_entries"

    id = Column(Integer, primary_key=True)
    service_date = Column(Date, nullable=False, unique=True, index=True)

    hymn_chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="SET NULL"))
    hymn_song_title = Column(String(255), nullable=False, default="", server_default="")
    hymn_musical_key = Column(String(64), nullable=False, default="", server_default="")
    hymn_song_id = Column(Integer, ForeignKey("songs.id", ondelete="SET NULL"), nullable=True)

    praise_worship_chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="SET NULL"))
    praise_worship_musical_key = Column(String(64), nullable=False, default="", server_default="")
    praise_worship_loop_bitrate = Column(String(64), nullable=False, default="", server_default="")
    praise_worship_song_id = Column(Integer, ForeignKey("songs.id", ondelete="SET NULL"), nullable=True)

    thanksgiving_chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="SET NULL"))
    thanksgiving_musical_key = Column(String(64), nullable=False, default="", server_default="")
    thanksgiving_loop_bitrate = Column(String(64), nullable=False, default="", server_default="")
    thanksgiving_song_id = Column(Integer, ForeignKey("songs.id", ondelete="SET NULL"), nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    hymn_chorister = relationship("Chorister", foreign_keys=[hymn_chorister_id])
    praise_worship_chorister = relationship("Chorister", foreign_keys=[praise_worship_chorister_id])
    thanksgiving_chorister = relationship("Chorister", foreign_keys=[thanksgiving_chorister_id])
    hymn_song = relationship("Song", foreign_keys=[hymn_song_id])
    praise_worship_song = relationship("Song", foreign_keys=[praise_worship_song_id])
    thanksgiving_song = relationship("Song", foreign_keys=[thanksgiving_song_id])


def init_db():
    Base.metadata.create_all(bind=engine)


@contextmanager
def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Chorister CRUD
# ---------------------------------------------------------------------------

def list_choristers(session: Session):
    rows = session.execute(select(Chorister).order_by(Chorister.name)).scalars().all()
    return [serialize_chorister(row) for row in rows]


def list_portal_choristers(session: Session):
    """Return only choristers who have been granted portal access."""
    rows = session.execute(
        select(Chorister).where(Chorister.has_portal_access == True).order_by(Chorister.name)
    ).scalars().all()
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


def set_chorister_pin(session: Session, chorister_id: int, plain_pin: str) -> dict | None:
    row = session.get(Chorister, chorister_id)
    if not row:
        return None
    hashed = bcrypt.hashpw(plain_pin.encode(), bcrypt.gensalt())
    row.pin_hash = hashed.decode()
    row.has_portal_access = True
    session.commit()
    session.refresh(row)
    return serialize_chorister(row)


def revoke_chorister_pin(session: Session, chorister_id: int) -> dict | None:
    row = session.get(Chorister, chorister_id)
    if not row:
        return None
    row.pin_hash = None
    row.has_portal_access = False
    session.commit()
    session.refresh(row)
    return serialize_chorister(row)


def verify_chorister_pin(session: Session, chorister_id: int, plain_pin: str) -> bool:
    row = session.get(Chorister, chorister_id)
    if not row or not row.pin_hash or not row.has_portal_access:
        return False
    return bcrypt.checkpw(plain_pin.encode(), row.pin_hash.encode())


# ---------------------------------------------------------------------------
# Roster CRUD
# ---------------------------------------------------------------------------

def list_roster_entries(session: Session, month_start, month_end):
    rows = session.execute(
        select(RosterEntry)
        .where(RosterEntry.service_date >= month_start, RosterEntry.service_date <= month_end)
        .options(
            selectinload(RosterEntry.hymn_chorister),
            selectinload(RosterEntry.praise_worship_chorister),
            selectinload(RosterEntry.thanksgiving_chorister),
            selectinload(RosterEntry.hymn_song),
            selectinload(RosterEntry.praise_worship_song),
            selectinload(RosterEntry.thanksgiving_song),
        )
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


# ---------------------------------------------------------------------------
# Song CRUD
# ---------------------------------------------------------------------------

def list_songs(session: Session) -> list:
    rows = session.execute(
        select(Song).options(selectinload(Song.submitted_by)).order_by(Song.title)
    ).scalars().all()
    return [serialize_song(row) for row in rows]


def get_song(session: Session, song_id: int) -> dict | None:
    row = session.get(Song, song_id)
    return serialize_song(row) if row else None


def get_song_obj(session: Session, song_id: int) -> Song | None:
    return session.get(Song, song_id)


def create_song(session: Session, data: dict) -> dict:
    row = Song(**data)
    session.add(row)
    session.commit()
    session.refresh(row)
    return serialize_song(row)


def update_song(session: Session, song_id: int, data: dict) -> dict | None:
    row = session.get(Song, song_id)
    if not row:
        return None
    for key, value in data.items():
        setattr(row, key, value)
    session.commit()
    session.refresh(row)
    return serialize_song(row)


def delete_song(session: Session, song_id: int):
    row = session.get(Song, song_id)
    if row:
        session.delete(row)
        session.commit()


def list_songs_by_month(session: Session, year: int, month: int) -> list:
    """
    Return songs that were used in roster entries during the given month,
    grouped by category. Each song appears once even if used on multiple dates.
    """
    import calendar
    from datetime import date as date_type
    last_day = calendar.monthrange(year, month)[1]
    month_start = date_type(year, month, 1)
    month_end = date_type(year, month, last_day)

    entries = session.execute(
        select(RosterEntry)
        .where(RosterEntry.service_date >= month_start, RosterEntry.service_date <= month_end)
        .options(
            selectinload(RosterEntry.hymn_song).selectinload(Song.submitted_by),
            selectinload(RosterEntry.praise_worship_song).selectinload(Song.submitted_by),
            selectinload(RosterEntry.thanksgiving_song).selectinload(Song.submitted_by),
        )
    ).scalars().all()

    seen: set[int] = set()
    result: list[dict] = []
    for entry in entries:
        for song in [entry.hymn_song, entry.praise_worship_song, entry.thanksgiving_song]:
            if song and song.id not in seen:
                seen.add(song.id)
                result.append(serialize_song(song))
    return result


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

def get_chorister_stats(session: Session, date_from, date_to) -> list:
    rows = session.execute(
        select(RosterEntry)
        .where(RosterEntry.service_date >= date_from, RosterEntry.service_date <= date_to)
        .options(
            selectinload(RosterEntry.hymn_chorister),
            selectinload(RosterEntry.praise_worship_chorister),
            selectinload(RosterEntry.thanksgiving_chorister),
        )
    ).scalars().all()

    counts: dict = {}
    for row in rows:
        for chorister in [row.hymn_chorister, row.praise_worship_chorister, row.thanksgiving_chorister]:
            if chorister:
                if chorister.id not in counts:
                    counts[chorister.id] = {"chorister_id": chorister.id, "name": chorister.name, "count": 0}
                counts[chorister.id]["count"] += 1

    return sorted(counts.values(), key=lambda x: x["count"], reverse=True)


def get_song_stats(session: Session) -> list:
    rows = session.execute(
        select(RosterEntry).options(
            selectinload(RosterEntry.hymn_song),
            selectinload(RosterEntry.praise_worship_song),
            selectinload(RosterEntry.thanksgiving_song),
        )
    ).scalars().all()

    counts: dict = {}
    for row in rows:
        for song, col in [
            (row.hymn_song, "hymn_count"),
            (row.praise_worship_song, "praise_worship_count"),
            (row.thanksgiving_song, "thanksgiving_count"),
        ]:
            if song:
                if song.id not in counts:
                    counts[song.id] = {
                        "song_id": song.id,
                        "title": song.title,
                        "lyrics": song.lyrics or "",
                        "category": song.category or "general",
                        "hymn_count": 0,
                        "praise_worship_count": 0,
                        "thanksgiving_count": 0,
                        "count": 0,
                    }
                counts[song.id][col] += 1
                counts[song.id]["count"] += 1

    return sorted(counts.values(), key=lambda x: x["count"], reverse=True)


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def serialize_chorister(row: Chorister) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "has_portal_access": bool(row.has_portal_access),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def serialize_song(row: Song) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "lyrics": row.lyrics or "",
        "category": row.category or "general",
        "hyperlink": row.hyperlink or "",
        "google_doc_url": row.google_doc_url or "",
        "submitted_by_chorister_id": row.submitted_by_chorister_id,
        "submitted_by_chorister_name": row.submitted_by.name if row.submitted_by else None,
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
        "hymn_song_id": row.hymn_song_id,
        "hymn_song_title_linked": row.hymn_song.title if row.hymn_song else None,
        "praise_worship_song_id": row.praise_worship_song_id,
        "praise_worship_song_title": row.praise_worship_song.title if row.praise_worship_song else None,
        "thanksgiving_song_id": row.thanksgiving_song_id,
        "thanksgiving_song_title": row.thanksgiving_song.title if row.thanksgiving_song else None,
        "notes": row.notes or "",
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
