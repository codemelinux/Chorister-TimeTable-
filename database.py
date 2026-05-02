# Developed by Benedict U.
# SQLAlchemy ORM models, engine setup, and all database helper functions.
# pin_hash is NEVER included in serialized output — it stays in the DB only.

import calendar
import os
from contextlib import contextmanager
from datetime import date as date_type

import bcrypt
from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Integer,
    String, Text, UniqueConstraint, create_engine, event, extract, func, or_, select, text,
)
from sqlalchemy.orm import Session, declarative_base, relationship, selectinload, sessionmaker

Base = declarative_base()

# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------

def _normalize_database_url(url: str | None) -> str:
    """Normalise Postgres URL variants so psycopg3 driver is always used."""
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

# Enable foreign-key enforcement for SQLite (disabled by default).
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# ---------------------------------------------------------------------------
# ORM models
# ---------------------------------------------------------------------------

class Chorister(Base):
    """A choir member who can be assigned to service functions."""
    __tablename__ = "choristers"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    # pin_hash is bcrypt-hashed; never exposed in API responses.
    pin_hash = Column(Text, nullable=True)
    has_portal_access = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Song(Base):
    """A song in the library, optionally linked to a Google Doc and a submitting chorister."""
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    lyrics = Column(Text, nullable=False, default="", server_default="")
    category = Column(String(32), nullable=False, default="general", server_default="general")
    hyperlink = Column(Text, nullable=True)          # Optional external link (YouTube, website, etc.)
    submitted_by_chorister_id = Column(
        Integer, ForeignKey("choristers.id", ondelete="SET NULL"), nullable=True
    )
    google_doc_id = Column(Text, nullable=True)      # Drive file ID — used for updates
    google_doc_url = Column(Text, nullable=True)     # Shareable "anyone with the link" URL
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    submitted_by = relationship("Chorister", foreign_keys=[submitted_by_chorister_id])


class SongAssignment(Base):
    """Admin-created link that assigns a library song to a chorister for roster purposes."""
    __tablename__ = "song_assignments"

    id = Column(Integer, primary_key=True)
    song_id = Column(Integer, ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="CASCADE"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    song = relationship("Song", foreign_keys=[song_id])
    chorister = relationship("Chorister", foreign_keys=[chorister_id])

    __table_args__ = (UniqueConstraint("song_id", "chorister_id", name="uq_song_assignment"),)


class RosterEntry(Base):
    """One service date with chorister/song assignments for Hymn, Praise Worship, and Thanksgiving."""
    __tablename__ = "roster_entries"

    id = Column(Integer, primary_key=True)
    service_date = Column(Date, nullable=False, unique=True, index=True)

    # --- Hymn ---
    hymn_chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="SET NULL"))
    # hymn_song_title is a legacy free-text field kept for backward compat.
    # Prefer hymn_song_id (FK) when assigning songs from the library.
    hymn_song_title = Column(String(255), nullable=False, default="", server_default="")
    hymn_musical_key = Column(String(64), nullable=False, default="", server_default="")
    hymn_song_id = Column(Integer, ForeignKey("songs.id", ondelete="SET NULL"), nullable=True)

    # --- Praise Worship ---
    praise_worship_chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="SET NULL"))
    praise_worship_musical_key = Column(String(64), nullable=False, default="", server_default="")
    praise_worship_loop_bitrate = Column(String(64), nullable=False, default="", server_default="")
    praise_worship_song_id = Column(Integer, ForeignKey("songs.id", ondelete="SET NULL"), nullable=True)

    # --- Thanksgiving ---
    thanksgiving_chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="SET NULL"))
    thanksgiving_musical_key = Column(String(64), nullable=False, default="", server_default="")
    thanksgiving_loop_bitrate = Column(String(64), nullable=False, default="", server_default="")
    thanksgiving_song_id = Column(Integer, ForeignKey("songs.id", ondelete="SET NULL"), nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships — all FKs use SET NULL so deleting a chorister/song doesn't cascade.
    hymn_chorister = relationship("Chorister", foreign_keys=[hymn_chorister_id])
    praise_worship_chorister = relationship("Chorister", foreign_keys=[praise_worship_chorister_id])
    thanksgiving_chorister = relationship("Chorister", foreign_keys=[thanksgiving_chorister_id])
    hymn_song = relationship("Song", foreign_keys=[hymn_song_id])
    praise_worship_song = relationship("Song", foreign_keys=[praise_worship_song_id])
    thanksgiving_song = relationship("Song", foreign_keys=[thanksgiving_song_id])


class PrayerRosterEntry(Base):
    """One prayer date with the chorister who leads prayer on that day."""
    __tablename__ = "prayer_roster"

    id           = Column(Integer, primary_key=True)
    date         = Column(Date, nullable=False, unique=True, index=True)
    chorister_id = Column(
        Integer, ForeignKey("choristers.id", ondelete="SET NULL"), nullable=True
    )
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    chorister = relationship("Chorister", foreign_keys=[chorister_id])


class PerformanceRating(Base):
    """Admin rating for a chorister's performance in a specific service slot."""
    __tablename__ = "performance_ratings"

    id              = Column(Integer, primary_key=True)
    roster_entry_id = Column(Integer, ForeignKey("roster_entries.id", ondelete="CASCADE"), nullable=False)
    role            = Column(String(32), nullable=False)   # 'hymn' | 'praise_worship' | 'thanksgiving'
    chorister_id    = Column(Integer, ForeignKey("choristers.id", ondelete="CASCADE"), nullable=False)
    rating          = Column(Integer, nullable=False)       # 1–5
    comment         = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    roster_entry = relationship("RosterEntry", foreign_keys=[roster_entry_id])
    chorister    = relationship("Chorister", foreign_keys=[chorister_id])

    __table_args__ = (UniqueConstraint("roster_entry_id", "role", name="uq_rating_entry_role"),)


class MonthlyDue(Base):
    """Monthly RM10 dues status for one chorister."""
    __tablename__ = "monthly_dues"

    id = Column(Integer, primary_key=True)
    chorister_id = Column(Integer, ForeignKey("choristers.id", ondelete="CASCADE"), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    amount = Column(Integer, nullable=False, default=10, server_default="10")
    status = Column(String(16), nullable=False, default="pending", server_default="pending")
    marked_by_admin_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    chorister = relationship("Chorister", foreign_keys=[chorister_id])

    __table_args__ = (UniqueConstraint("chorister_id", "year", "month", name="uq_monthly_due"),)


# ---------------------------------------------------------------------------
# DB initialisation + session factory
# ---------------------------------------------------------------------------

def init_db():
    """Create all tables that don't yet exist, then apply column migrations."""
    Base.metadata.create_all(bind=engine)
    _run_column_migrations()


def _run_column_migrations():
    """
    Add new columns to existing tables if they don't already exist.

    This runs on every startup and is fully idempotent:
    - PostgreSQL uses ADD COLUMN IF NOT EXISTS (native support).
    - SQLite catches the 'duplicate column' error and continues.

    Add new entries here whenever a column is added to a model.
    """
    is_postgres = not DATABASE_URL.startswith("sqlite")

    # Each tuple: (table, column_name, column_definition)
    migrations = [
        # choristers — portal access (added v2)
        ("choristers", "pin_hash",           "TEXT"),
        ("choristers", "has_portal_access",  "BOOLEAN DEFAULT FALSE NOT NULL"),
        # songs — extended metadata (added v2)
        ("songs", "hyperlink",               "TEXT"),
        ("songs", "submitted_by_chorister_id", "INTEGER"),
        ("songs", "google_doc_id",           "TEXT"),
        ("songs", "google_doc_url",          "TEXT"),
        # roster_entries — song linking + notes (added v2)
        ("roster_entries", "hymn_song_id",              "INTEGER"),
        ("roster_entries", "praise_worship_song_id",    "INTEGER"),
        ("roster_entries", "thanksgiving_song_id",      "INTEGER"),
        ("roster_entries", "notes",                     "TEXT"),
    ]

    with engine.connect() as conn:
        for table, column, definition in migrations:
            if is_postgres:
                sql = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}"
                try:
                    conn.execute(text(sql))
                except Exception as exc:
                    print(f"[migration] {table}.{column}: {exc}")
            else:
                # SQLite does not support IF NOT EXISTS on ALTER TABLE;
                # catch the 'duplicate column name' error and move on.
                try:
                    conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
                    ))
                except Exception:
                    pass  # column already exists
        conn.commit()


@contextmanager
def get_session():
    """Context manager that yields a session and closes it on exit."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Chorister CRUD
# ---------------------------------------------------------------------------

def _query_choristers(session: Session, portal_only: bool = False):
    """Shared query builder used by list_choristers and list_portal_choristers."""
    q = select(Chorister).order_by(Chorister.name)
    if portal_only:
        q = q.where(Chorister.has_portal_access == True)
    return session.execute(q).scalars().all()


def list_choristers(session: Session) -> list:
    """Return all choristers (used for roster display and dropdown population)."""
    return [serialize_chorister(row) for row in _query_choristers(session)]


def list_portal_choristers(session: Session) -> list:
    """Return only choristers with portal access (used for the chorister login dropdown)."""
    return [serialize_chorister(row) for row in _query_choristers(session, portal_only=True)]


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
    """Hash the PIN with bcrypt and grant portal access."""
    row = session.get(Chorister, chorister_id)
    if not row:
        return None
    row.pin_hash = bcrypt.hashpw(plain_pin.encode(), bcrypt.gensalt()).decode()
    row.has_portal_access = True
    session.commit()
    session.refresh(row)
    return serialize_chorister(row)


def revoke_chorister_pin(session: Session, chorister_id: int) -> dict | None:
    """Remove the PIN hash and revoke portal access."""
    row = session.get(Chorister, chorister_id)
    if not row:
        return None
    row.pin_hash = None
    row.has_portal_access = False
    session.commit()
    session.refresh(row)
    return serialize_chorister(row)


def verify_chorister_pin(session: Session, chorister_id: int, plain_pin: str) -> bool:
    """Return True if the plain PIN matches the stored bcrypt hash."""
    row = session.get(Chorister, chorister_id)
    if not row or not row.pin_hash or not row.has_portal_access:
        return False
    return bcrypt.checkpw(plain_pin.encode(), row.pin_hash.encode())


# ---------------------------------------------------------------------------
# Roster CRUD
# ---------------------------------------------------------------------------

def list_roster_entries(session: Session, month_start: date_type, month_end: date_type) -> list:
    """Return all roster entries in a date range with relationships eagerly loaded."""
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

    # Batch-load all assignments to avoid N+1 queries.
    assignment_rows = session.execute(
        select(SongAssignment).options(selectinload(SongAssignment.chorister))
    ).scalars().all()
    assignments_by_song: dict[int, list] = {}
    for a in assignment_rows:
        assignments_by_song.setdefault(a.song_id, []).append({
            "chorister_id": a.chorister_id,
            "chorister_name": a.chorister.name if a.chorister else None,
        })

    return [serialize_song(row, assignments_by_song.get(row.id, [])) for row in rows]


def get_song(session: Session, song_id: int) -> dict | None:
    row = session.get(Song, song_id)
    return serialize_song(row) if row else None


def get_song_obj(session: Session, song_id: int) -> Song | None:
    """Return the raw ORM Song object (needed when google_doc_id must be accessed)."""
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


# ---------------------------------------------------------------------------
# Song assignment CRUD
# ---------------------------------------------------------------------------

def get_song_assignments(session: Session, song_id: int) -> list[dict]:
    """Return all choristers assigned to a song."""
    rows = session.execute(
        select(SongAssignment)
        .where(SongAssignment.song_id == song_id)
        .options(selectinload(SongAssignment.chorister))
    ).scalars().all()
    return [
        {"chorister_id": r.chorister_id, "chorister_name": r.chorister.name if r.chorister else None}
        for r in rows
    ]


def assign_song_to_chorister(session: Session, song_id: int, chorister_id: int) -> bool:
    """Create an assignment. Returns False if the assignment already exists."""
    existing = session.execute(
        select(SongAssignment).where(
            SongAssignment.song_id == song_id,
            SongAssignment.chorister_id == chorister_id,
        )
    ).scalar_one_or_none()
    if existing:
        return False
    session.add(SongAssignment(song_id=song_id, chorister_id=chorister_id))
    session.commit()
    return True


def unassign_song_from_chorister(session: Session, song_id: int, chorister_id: int):
    """Remove an assignment if it exists."""
    row = session.execute(
        select(SongAssignment).where(
            SongAssignment.song_id == song_id,
            SongAssignment.chorister_id == chorister_id,
        )
    ).scalar_one_or_none()
    if row:
        session.delete(row)
        session.commit()


def list_songs_by_month(session: Session, year: int, month: int) -> list:
    """
    Return every song referenced in services during the given month.

    Two sources are combined:
      1. Library songs linked via FK (hymn_song_id etc.) — include full lyrics/links.
      2. Legacy free-text hymn_song_title entries — included as title-only stubs
         so pre-library roster entries still appear in the lyrics catalogue.

    Each song appears at most once (deduplication by ID for library songs, by
    normalised title+category for legacy stubs).
    """
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

    seen_ids: set[int] = set()
    seen_titles: set[tuple] = set()  # (normalised_title, category)
    result: list[dict] = []

    for entry in entries:
        # Pass 1: library-linked songs
        for song, category in [
            (entry.hymn_song, "hymn"),
            (entry.praise_worship_song, "praise_worship"),
            (entry.thanksgiving_song, "thanksgiving"),
        ]:
            if song and song.id not in seen_ids:
                seen_ids.add(song.id)
                seen_titles.add((song.title.lower(), category))
                result.append(serialize_song(song))

        # Pass 2: legacy free-text hymn title (only Hymn had a free-text field historically)
        if entry.hymn_song_title and not entry.hymn_song_id:
            key = (entry.hymn_song_title.strip().lower(), "hymn")
            if key not in seen_titles:
                seen_titles.add(key)
                result.append({
                    "id": None,
                    "title": entry.hymn_song_title.strip(),
                    "lyrics": "",
                    "category": "hymn",
                    "hyperlink": "",
                    "google_doc_url": "",
                    "submitted_by_chorister_id": None,
                    "submitted_by_chorister_name": None,
                    "created_at": None,
                })

    return result


# ---------------------------------------------------------------------------
# Performance Ratings CRUD
# ---------------------------------------------------------------------------

def _serialize_rating(r: PerformanceRating) -> dict:
    return {
        "id": r.id,
        "roster_entry_id": r.roster_entry_id,
        "role": r.role,
        "chorister_id": r.chorister_id,
        "rating": r.rating,
        "comment": r.comment,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def upsert_rating(session: Session, roster_entry_id: int, role: str, chorister_id: int, rating: int, comment: str | None) -> dict:
    existing = session.execute(
        select(PerformanceRating).where(
            PerformanceRating.roster_entry_id == roster_entry_id,
            PerformanceRating.role == role,
        )
    ).scalar_one_or_none()
    if existing:
        existing.chorister_id = chorister_id
        existing.rating = rating
        existing.comment = comment
    else:
        existing = PerformanceRating(
            roster_entry_id=roster_entry_id,
            role=role,
            chorister_id=chorister_id,
            rating=rating,
            comment=comment,
        )
        session.add(existing)
    session.commit()
    return _serialize_rating(existing)


def get_ratings_for_month(session: Session, year: int, month: int) -> list:
    """Return all ratings for roster entries in the given month."""
    rows = session.execute(
        select(PerformanceRating)
        .join(RosterEntry, PerformanceRating.roster_entry_id == RosterEntry.id)
        .where(
            extract("year", RosterEntry.service_date) == year,
            extract("month", RosterEntry.service_date) == month,
        )
        .order_by(RosterEntry.service_date)
    ).scalars().all()
    return [_serialize_rating(r) for r in rows]


def get_ratings_by_chorister(session: Session, chorister_id: int) -> list:
    rows = session.execute(
        select(PerformanceRating)
        .where(PerformanceRating.chorister_id == chorister_id)
        .options(selectinload(PerformanceRating.roster_entry))
        .order_by(PerformanceRating.created_at.desc())
    ).scalars().all()
    result = []
    for r in rows:
        d = _serialize_rating(r)
        d["service_date"] = r.roster_entry.service_date.isoformat() if r.roster_entry else None
        result.append(d)
    return result


def delete_rating(session: Session, rating_id: int) -> bool:
    r = session.get(PerformanceRating, rating_id)
    if not r:
        return False
    session.delete(r)
    session.commit()
    return True


# ---------------------------------------------------------------------------
# Monthly dues CRUD
# ---------------------------------------------------------------------------

MONTHLY_DUE_AMOUNT = 10
MONTHLY_DUE_STATUSES = {"pending", "paid", "waived"}


def _default_due(chorister_id: int, year: int, month: int) -> dict:
    return {
        "id": None,
        "chorister_id": chorister_id,
        "year": year,
        "month": month,
        "amount": MONTHLY_DUE_AMOUNT,
        "status": "pending",
        "marked_by_admin_at": None,
        "updated_at": None,
    }


def list_monthly_dues(session: Session, year: int, chorister_id: int | None = None) -> list[dict]:
    chorister_query = select(Chorister).order_by(Chorister.name)
    if chorister_id is not None:
        chorister_query = chorister_query.where(Chorister.id == chorister_id)
    chorister_rows = session.execute(chorister_query).scalars().all()

    due_rows = session.execute(select(MonthlyDue).where(MonthlyDue.year == year)).scalars().all()
    dues_by_key = {(row.chorister_id, row.month): serialize_monthly_due(row) for row in due_rows}

    result = []
    for chorister in chorister_rows:
        months = []
        total_owed = 0
        for month in range(1, 13):
            due = dues_by_key.get((chorister.id, month), _default_due(chorister.id, year, month))
            months.append(due)
            if due["status"] == "pending":
                total_owed += due["amount"]
        result.append({
            "chorister_id": chorister.id,
            "chorister_name": chorister.name,
            "year": year,
            "months": months,
            "total_owed": total_owed,
        })
    return result


def upsert_monthly_due(session: Session, chorister_id: int, year: int, month: int, status: str) -> dict | None:
    if status not in MONTHLY_DUE_STATUSES:
        raise ValueError("Invalid dues status")
    if not session.get(Chorister, chorister_id):
        return None

    row = session.execute(
        select(MonthlyDue).where(
            MonthlyDue.chorister_id == chorister_id,
            MonthlyDue.year == year,
            MonthlyDue.month == month,
        )
    ).scalar_one_or_none()

    if row:
        row.status = status
        row.amount = MONTHLY_DUE_AMOUNT
    else:
        row = MonthlyDue(
            chorister_id=chorister_id,
            year=year,
            month=month,
            amount=MONTHLY_DUE_AMOUNT,
            status=status,
        )
        session.add(row)
    row.marked_by_admin_at = func.now()
    session.commit()
    session.refresh(row)
    return serialize_monthly_due(row)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

def get_chorister_stats(session: Session, date_from: date_type, date_to: date_type) -> list:
    """Return per-chorister service-slot counts broken down by category for the given date range, sorted descending."""
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
        for chorister, role in [
            (row.hymn_chorister, "hymn"),
            (row.praise_worship_chorister, "praise_worship"),
            (row.thanksgiving_chorister, "thanksgiving"),
        ]:
            if chorister:
                if chorister.id not in counts:
                    counts[chorister.id] = {
                        "chorister_id": chorister.id,
                        "name": chorister.name,
                        "hymn_count": 0,
                        "praise_worship_count": 0,
                        "thanksgiving_count": 0,
                        "total": 0,
                    }
                counts[chorister.id][f"{role}_count"] += 1
                counts[chorister.id]["total"] += 1

    return sorted(counts.values(), key=lambda x: x["total"], reverse=True)


def get_song_stats(session: Session) -> list:
    """
    Return per-song usage counts (how many times used per category + total).

    Counts both library-linked songs (via FK) and legacy free-text hymn titles
    so that pre-library roster entries appear in the analytics cards.
    Legacy entries use a string key prefixed with 'text:' to avoid collisions
    with real integer song IDs.
    """
    rows = session.execute(
        select(RosterEntry).options(
            selectinload(RosterEntry.hymn_song),
            selectinload(RosterEntry.praise_worship_song),
            selectinload(RosterEntry.thanksgiving_song),
        )
    ).scalars().all()

    counts: dict = {}

    for row in rows:
        # Library-linked songs
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

        # Legacy free-text hymn title
        if row.hymn_song_title and not row.hymn_song_id:
            key = f"text:{row.hymn_song_title.strip().lower()}"
            if key not in counts:
                counts[key] = {
                    "song_id": None,
                    "title": row.hymn_song_title.strip(),
                    "lyrics": "",
                    "category": "hymn",
                    "hymn_count": 0,
                    "praise_worship_count": 0,
                    "thanksgiving_count": 0,
                    "count": 0,
                }
            counts[key]["hymn_count"] += 1
            counts[key]["count"] += 1

    return sorted(counts.values(), key=lambda x: x["count"], reverse=True)


# ---------------------------------------------------------------------------
# Serializers — convert ORM objects to plain dicts for JSON responses.
# IMPORTANT: pin_hash is intentionally excluded from all serializers.
# ---------------------------------------------------------------------------

def serialize_chorister(row: Chorister) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "has_portal_access": bool(row.has_portal_access),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def serialize_monthly_due(row: MonthlyDue) -> dict:
    return {
        "id": row.id,
        "chorister_id": row.chorister_id,
        "year": row.year,
        "month": row.month,
        "amount": row.amount,
        "status": row.status,
        "marked_by_admin_at": row.marked_by_admin_at.isoformat() if row.marked_by_admin_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def serialize_song(row: Song, assigned_choristers: list | None = None) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "lyrics": row.lyrics or "",
        "category": row.category or "general",
        "hyperlink": row.hyperlink or "",
        "google_doc_url": row.google_doc_url or "",
        "submitted_by_chorister_id": row.submitted_by_chorister_id,
        "submitted_by_chorister_name": row.submitted_by.name if row.submitted_by else None,
        "assigned_choristers": assigned_choristers or [],
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def serialize_prayer_entry(row: PrayerRosterEntry) -> dict:
    return {
        "id":             row.id,
        "date":           row.date.isoformat(),
        "chorister_id":   row.chorister_id,
        "chorister_name": row.chorister.name if row.chorister else None,
        "created_at":     row.created_at.isoformat() if row.created_at else None,
    }


def serialize_roster_entry(row: RosterEntry) -> dict:
    return {
        "id": row.id,
        "service_date": row.service_date.isoformat(),
        # Chorister IDs + names
        "hymn_chorister_id": row.hymn_chorister_id,
        "hymn_chorister_name": row.hymn_chorister.name if row.hymn_chorister else None,
        "praise_worship_chorister_id": row.praise_worship_chorister_id,
        "praise_worship_chorister_name": row.praise_worship_chorister.name if row.praise_worship_chorister else None,
        "thanksgiving_chorister_id": row.thanksgiving_chorister_id,
        "thanksgiving_chorister_name": row.thanksgiving_chorister.name if row.thanksgiving_chorister else None,
        # Hymn details (legacy free-text title kept for backward compat)
        "hymn_song_title": row.hymn_song_title or "",
        "hymn_musical_key": row.hymn_musical_key or "",
        "hymn_song_id": row.hymn_song_id,
        "hymn_song_title_linked": row.hymn_song.title if row.hymn_song else None,
        # Praise Worship details
        "praise_worship_musical_key": row.praise_worship_musical_key or "",
        "praise_worship_loop_bitrate": row.praise_worship_loop_bitrate or "",
        "praise_worship_song_id": row.praise_worship_song_id,
        "praise_worship_song_title": row.praise_worship_song.title if row.praise_worship_song else None,
        # Thanksgiving details
        "thanksgiving_musical_key": row.thanksgiving_musical_key or "",
        "thanksgiving_loop_bitrate": row.thanksgiving_loop_bitrate or "",
        "thanksgiving_song_id": row.thanksgiving_song_id,
        "thanksgiving_song_title": row.thanksgiving_song.title if row.thanksgiving_song else None,
        # Metadata
        "notes": row.notes or "",
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


# ---------------------------------------------------------------------------
# Prayer Roster CRUD
# ---------------------------------------------------------------------------

def list_prayer_entries(session: Session, month_start: date_type, month_end: date_type) -> list:
    rows = session.execute(
        select(PrayerRosterEntry)
        .where(PrayerRosterEntry.date >= month_start, PrayerRosterEntry.date <= month_end)
        .options(selectinload(PrayerRosterEntry.chorister))
        .order_by(PrayerRosterEntry.date)
    ).scalars().all()
    return [serialize_prayer_entry(row) for row in rows]


def get_next_prayer_entry(session: Session, today: date_type) -> dict | None:
    row = session.execute(
        select(PrayerRosterEntry)
        .where(PrayerRosterEntry.date >= today)
        .options(selectinload(PrayerRosterEntry.chorister))
        .order_by(PrayerRosterEntry.date)
        .limit(1)
    ).scalar_one_or_none()
    return serialize_prayer_entry(row) if row else None


def create_prayer_entry(session: Session, data: dict) -> dict:
    row = PrayerRosterEntry(**data)
    session.add(row)
    session.commit()
    session.refresh(row)
    return serialize_prayer_entry(row)


def update_prayer_entry(session: Session, entry_id: int, data: dict) -> dict | None:
    row = session.get(PrayerRosterEntry, entry_id)
    if not row:
        return None
    for key, value in data.items():
        setattr(row, key, value)
    session.commit()
    session.refresh(row)
    return serialize_prayer_entry(row)


def delete_prayer_entry(session: Session, entry_id: int):
    row = session.get(PrayerRosterEntry, entry_id)
    if row:
        session.delete(row)
        session.commit()
