# Developed by Benedict U.
# FastAPI application — routes, auth middleware, and request handling.
# Database access is delegated to database.py; Drive sync to google_drive.py.

import calendar
import os
import re
import secrets
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

import database as db
import google_drive

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"

# Valid song categories — single source of truth used in both create and update.
VALID_CATEGORIES = {"hymn", "praise_worship", "thanksgiving", "general"}

# Allowed URL schemes for hyperlink fields.
_ALLOWED_SCHEMES = re.compile(r"^https?://", re.IGNORECASE)


def load_local_env():
    """Load KEY=VALUE pairs from .env into os.environ (dev convenience only)."""
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_local_env()

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "change-me-admin")
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-session-secret")

# Detect deployment platform to enforce production guards.
IS_PRODUCTION = (
    os.getenv("VERCEL_ENV") == "production"
    or os.getenv("RENDER") == "true"
    or os.getenv("RAILWAY_ENVIRONMENT") == "production"
)

if IS_PRODUCTION:
    if ADMIN_PASSWORD == "change-me-admin":
        raise RuntimeError("ADMIN_PASSWORD must be set in production")
    if SESSION_SECRET == "dev-session-secret":
        raise RuntimeError("SESSION_SECRET must be set in production")

# ---------------------------------------------------------------------------
# App + middleware
# ---------------------------------------------------------------------------

app = FastAPI(title="Chorister TimeTable")

# Session cookies: SameSite=lax prevents most CSRF; https_only in production.
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    https_only=IS_PRODUCTION,
    max_age=60 * 60 * 12,  # 12-hour sessions
)


@app.on_event("startup")
def startup():
    """Create/migrate DB tables on first run."""
    db.init_db()


def get_session():
    """FastAPI dependency: yields a SQLAlchemy session, closed after request."""
    with db.get_session() as session:
        yield session


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------

def require_admin(request: Request):
    """Raise 401 if the request does not carry a valid admin session."""
    if not request.session.get("is_admin"):
        raise HTTPException(status_code=401, detail="Admin login required")


def require_chorister_or_admin(request: Request):
    """Raise 401 unless the caller is a logged-in admin or chorister."""
    if not (request.session.get("is_admin") or request.session.get("chorister_id")):
        raise HTTPException(status_code=401, detail="Login required")


# ---------------------------------------------------------------------------
# Pydantic request/response models
# ---------------------------------------------------------------------------

class LoginBody(BaseModel):
    password: str


class ChoristerLogin(BaseModel):
    chorister_id: int
    pin: str = Field(..., min_length=1)


class SetChoristerPin(BaseModel):
    pin: str = Field(..., min_length=4, max_length=20)


class ChoristerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


def _validate_hyperlink(v: Optional[str]) -> Optional[str]:
    """Accept only http/https URLs; reject javascript:, data:, etc."""
    if v is None or v == "":
        return None
    v = v.strip()
    if not _ALLOWED_SCHEMES.match(v):
        raise ValueError("Hyperlink must start with http:// or https://")
    return v


class SongCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    lyrics: str = Field("")
    category: str = Field("general", max_length=32)
    hyperlink: Optional[str] = None

    @field_validator("hyperlink", mode="before")
    @classmethod
    def validate_hyperlink(cls, v):
        return _validate_hyperlink(v)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v):
        v = (v or "general").strip()
        if v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
        return v


class SongUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    lyrics: Optional[str] = None
    category: Optional[str] = Field(None, max_length=32)
    hyperlink: Optional[str] = None

    @field_validator("hyperlink", mode="before")
    @classmethod
    def validate_hyperlink(cls, v):
        return _validate_hyperlink(v)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v):
        if v is None:
            return v
        v = v.strip()
        if v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
        return v


class SongAssignBody(BaseModel):
    chorister_id: int


class RosterEntryCreate(BaseModel):
    service_date: str
    hymn_chorister_id: Optional[int] = None
    hymn_song_title: str = Field("", max_length=255)
    hymn_musical_key: str = Field("", max_length=64)
    hymn_song_id: Optional[int] = None
    praise_worship_chorister_id: Optional[int] = None
    praise_worship_musical_key: str = Field("", max_length=64)
    praise_worship_loop_bitrate: str = Field("", max_length=64)
    praise_worship_song_id: Optional[int] = None
    thanksgiving_chorister_id: Optional[int] = None
    thanksgiving_musical_key: str = Field("", max_length=64)
    thanksgiving_loop_bitrate: str = Field("", max_length=64)
    thanksgiving_song_id: Optional[int] = None
    notes: Optional[str] = None


class RosterEntryUpdate(BaseModel):
    service_date: Optional[str] = None
    hymn_chorister_id: Optional[int] = None
    hymn_song_title: Optional[str] = Field(None, max_length=255)
    hymn_musical_key: Optional[str] = Field(None, max_length=64)
    hymn_song_id: Optional[int] = None
    praise_worship_chorister_id: Optional[int] = None
    praise_worship_musical_key: Optional[str] = Field(None, max_length=64)
    praise_worship_loop_bitrate: Optional[str] = Field(None, max_length=64)
    praise_worship_song_id: Optional[int] = None
    thanksgiving_chorister_id: Optional[int] = None
    thanksgiving_musical_key: Optional[str] = Field(None, max_length=64)
    thanksgiving_loop_bitrate: Optional[str] = Field(None, max_length=64)
    thanksgiving_song_id: Optional[int] = None
    notes: Optional[str] = None  # None clears the note when explicitly sent as null


def parse_service_date(value: str) -> date:
    """Parse ISO date string or raise 400."""
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(400, "Invalid service_date format. Use YYYY-MM-DD.") from exc


# ---------------------------------------------------------------------------
# Admin auth endpoints
# ---------------------------------------------------------------------------

@app.get("/api/auth/session")
def api_auth_session(request: Request):
    """Return whether the caller has an active admin session."""
    return {"authenticated": bool(request.session.get("is_admin"))}


@app.post("/api/auth/login")
def api_auth_login(body: LoginBody, request: Request):
    """Verify the shared admin password and create a session."""
    if not secrets.compare_digest(body.password, ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid password")
    request.session["is_admin"] = True
    return {"authenticated": True}


@app.post("/api/auth/logout")
def api_auth_logout(request: Request):
    """Destroy the admin session cookie."""
    request.session.pop("is_admin", None)
    return {"authenticated": False}


# ---------------------------------------------------------------------------
# Chorister auth endpoints
# ---------------------------------------------------------------------------

@app.get("/api/auth/chorister-session")
def api_chorister_session(request: Request):
    """Return the currently logged-in chorister's identity, if any."""
    chorister_id = request.session.get("chorister_id")
    return {
        "authenticated": bool(chorister_id),
        "chorister_id": chorister_id,
        "name": request.session.get("chorister_name"),
    }


@app.post("/api/auth/chorister-login")
def api_chorister_login(
    body: ChoristerLogin,
    request: Request,
    session: Session = Depends(get_session),
):
    """Verify chorister PIN and create a chorister session."""
    chorister = session.get(db.Chorister, body.chorister_id)
    if not chorister or not chorister.has_portal_access:
        raise HTTPException(401, "Chorister not found or portal access not granted")
    if not db.verify_chorister_pin(session, body.chorister_id, body.pin):
        raise HTTPException(401, "Invalid PIN")
    request.session["chorister_id"] = chorister.id
    request.session["chorister_name"] = chorister.name
    return {"authenticated": True, "chorister_id": chorister.id, "name": chorister.name}


@app.post("/api/auth/chorister-logout")
def api_chorister_logout(request: Request):
    """Destroy the chorister session."""
    request.session.pop("chorister_id", None)
    request.session.pop("chorister_name", None)
    return {"authenticated": False}


# ---------------------------------------------------------------------------
# Chorister management (admin-only writes; public reads)
# ---------------------------------------------------------------------------

@app.get("/api/choristers")
def api_list_choristers(session: Session = Depends(get_session)):
    """List all choristers (public — used for roster display)."""
    return db.list_choristers(session)


@app.get("/api/choristers/portal")
def api_list_portal_choristers(session: Session = Depends(get_session)):
    """List choristers with portal access (used to populate login dropdown)."""
    return db.list_portal_choristers(session)


@app.post("/api/choristers", status_code=201)
def api_add_chorister(
    body: ChoristerCreate,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    return db.add_chorister(session, name)


@app.delete("/api/choristers/{chorister_id}", status_code=204)
def api_delete_chorister(
    chorister_id: int,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    db.delete_chorister(session, chorister_id)


@app.post("/api/choristers/{chorister_id}/set-pin")
def api_set_chorister_pin(
    chorister_id: int,
    body: SetChoristerPin,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    """Grant portal access to a chorister by setting their PIN (bcrypt-hashed)."""
    result = db.set_chorister_pin(session, chorister_id, body.pin)
    if not result:
        raise HTTPException(404, "Chorister not found")
    return result


@app.delete("/api/choristers/{chorister_id}/pin", status_code=204)
def api_revoke_chorister_pin(
    chorister_id: int,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    """Revoke portal access from a chorister (clears PIN hash)."""
    db.revoke_chorister_pin(session, chorister_id)


# ---------------------------------------------------------------------------
# Songs (public reads; chorister/admin writes; admin-only deletes)
# Note: /api/songs/stats and /api/songs/monthly MUST be registered before
# /api/songs/{song_id} so FastAPI does not treat the path segment as an ID.
# ---------------------------------------------------------------------------

@app.get("/api/songs")
def api_list_songs(session: Session = Depends(get_session)):
    """Return all songs in the library."""
    return db.list_songs(session)


@app.get("/api/songs/stats")
def api_song_stats(session: Session = Depends(get_session)):
    """Return per-song usage counts (how many times each was assigned to a service)."""
    return db.get_song_stats(session)


@app.get("/api/songs/monthly")
def api_songs_monthly(year: int, month: int, session: Session = Depends(get_session)):
    """Return songs used in services during the given month (for lyrics catalogue)."""
    if not (1 <= month <= 12):
        raise HTTPException(400, "month must be 1-12")
    return db.list_songs_by_month(session, year, month)


@app.post("/api/songs/sync-all-to-drive")
def api_sync_all_to_drive(
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    """Push all songs that lack a Google Doc to Drive. Returns a summary."""
    if not google_drive.is_configured():
        raise HTTPException(503, "Google Drive is not configured")

    songs_without_doc = session.execute(
        select(db.Song).where(
            or_(db.Song.google_doc_url == None, db.Song.google_doc_url == "")
        )
    ).scalars().all()

    synced = failed = 0
    errors = []
    for song in songs_without_doc:
        try:
            doc_url, doc_id = google_drive.push_song_to_drive(
                song.title, song.category, song.lyrics or ""
            )
            db.update_song(session, song.id, {"google_doc_url": doc_url, "google_doc_id": doc_id})
            synced += 1
        except Exception as exc:
            failed += 1
            errors.append(str(exc))

    return {"synced": synced, "failed": failed, "total": len(songs_without_doc), "errors": errors}


@app.post("/api/songs/{song_id}/sync-to-drive")
def api_sync_song_to_drive(
    song_id: int,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    """Push a single song's lyrics to Google Drive (or update existing doc)."""
    if not google_drive.is_configured():
        raise HTTPException(503, "Google Drive is not configured")
    song = db.get_song_obj(session, song_id)
    if not song:
        raise HTTPException(404, "Song not found")
    try:
        doc_url, doc_id = google_drive.push_song_to_drive(
            song.title, song.category, song.lyrics or "", song.google_doc_id
        )
    except Exception as exc:
        raise HTTPException(502, f"Google Drive sync failed: {exc}") from exc
    return db.update_song(session, song_id, {"google_doc_url": doc_url, "google_doc_id": doc_id})


@app.post("/api/songs", status_code=201)
def api_create_song(
    body: SongCreate,
    request: Request,
    session: Session = Depends(get_session),
    _auth: None = Depends(require_chorister_or_admin),
):
    """Create a new song. Chorister submissions are tagged with their ID."""
    submitted_by = request.session.get("chorister_id")

    song_data = {
        "title": body.title.strip(),
        "lyrics": body.lyrics.strip() if body.lyrics else "",
        "category": body.category,
        "hyperlink": body.hyperlink,
        "submitted_by_chorister_id": submitted_by,
    }
    created = db.create_song(session, song_data)

    # Attempt Google Drive sync — failure is non-fatal (logged in google_drive.py).
    doc_url, doc_id = google_drive.push_song_to_drive(
        song_data["title"], song_data["category"], song_data["lyrics"]
    )
    if doc_url:
        db.update_song(session, created["id"], {"google_doc_url": doc_url, "google_doc_id": doc_id})
        created["google_doc_url"] = doc_url

    return created


@app.put("/api/songs/{song_id}")
def api_update_song(
    song_id: int,
    body: SongUpdate,
    request: Request,
    session: Session = Depends(get_session),
    _auth: None = Depends(require_chorister_or_admin),
):
    """Update a song. Choristers may only edit their own submissions (IDOR check)."""
    song = db.get_song_obj(session, song_id)
    if not song:
        raise HTTPException(404, "Song not found")

    # Prevent choristers from editing songs they didn't submit.
    chorister_id = request.session.get("chorister_id")
    if chorister_id and not request.session.get("is_admin"):
        if song.submitted_by_chorister_id != chorister_id:
            raise HTTPException(403, "You can only edit songs you submitted")

    # Only update fields that were actually sent in the request body.
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "title" in data:
        data["title"] = data["title"].strip()
        if not data["title"]:
            raise HTTPException(400, "Song title cannot be empty")
    if "lyrics" in data:
        data["lyrics"] = data["lyrics"].strip()

    updated = db.update_song(session, song_id, data)

    # Re-sync to Drive when content that affects the doc has changed.
    if "lyrics" in data or "title" in data:
        fresh = db.get_song_obj(session, song_id)
        doc_url, doc_id = google_drive.push_song_to_drive(
            fresh.title, fresh.category, fresh.lyrics or "", fresh.google_doc_id
        )
        if doc_url:
            db.update_song(session, song_id, {"google_doc_url": doc_url, "google_doc_id": doc_id})
            updated["google_doc_url"] = doc_url

    return updated


@app.post("/api/songs/{song_id}/assign", status_code=201)
def api_assign_song(
    song_id: int,
    body: SongAssignBody,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    """Assign a library song to a chorister so it appears in their roster song dropdown."""
    if not session.get(db.Song, song_id):
        raise HTTPException(404, "Song not found")
    if not session.get(db.Chorister, body.chorister_id):
        raise HTTPException(404, "Chorister not found")
    if not db.assign_song_to_chorister(session, song_id, body.chorister_id):
        raise HTTPException(409, "Song already assigned to this chorister")
    return {"song_id": song_id, "assignments": db.get_song_assignments(session, song_id)}


@app.delete("/api/songs/{song_id}/assign/{chorister_id}", status_code=204)
def api_unassign_song(
    song_id: int,
    chorister_id: int,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    """Remove a song assignment from a chorister."""
    db.unassign_song_from_chorister(session, song_id, chorister_id)


@app.delete("/api/songs/{song_id}", status_code=204)
def api_delete_song(
    song_id: int,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    """Delete a song and its corresponding Google Doc (if any)."""
    song = db.get_song_obj(session, song_id)
    if song and song.google_doc_id:
        # Best-effort deletion — Drive errors don't block the DB delete.
        google_drive.delete_doc_from_drive(song.google_doc_id)
    db.delete_song(session, song_id)


# ---------------------------------------------------------------------------
# Roster (public read; admin-only writes)
# ---------------------------------------------------------------------------

@app.get("/api/roster")
def api_list_roster(year: int, month: int, session: Session = Depends(get_session)):
    """Return all service-date entries for the given month."""
    if not (1 <= month <= 12):
        raise HTTPException(400, "month must be 1-12")
    last_day = calendar.monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end = date(year, month, last_day)
    return db.list_roster_entries(session, month_start, month_end)


@app.post("/api/roster", status_code=201)
def api_create_roster_entry(
    body: RosterEntryCreate,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    payload = body.model_dump()
    payload["service_date"] = parse_service_date(payload["service_date"])
    try:
        return db.create_roster_entry(session, payload)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(400, "A roster entry already exists for this service date") from exc


@app.put("/api/roster/{entry_id}")
def api_update_roster_entry(
    entry_id: int,
    body: RosterEntryUpdate,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    entry = db.get_roster_entry(session, entry_id)
    if not entry:
        raise HTTPException(404, "Roster entry not found")

    # Use exclude_unset so that sending notes=null explicitly clears the field,
    # while omitting notes from the payload leaves it unchanged.
    raw = body.model_dump(exclude_unset=True)
    data = {k: v for k, v in raw.items() if v is not None or k == "notes"}

    if "service_date" in data:
        data["service_date"] = parse_service_date(data["service_date"])
    try:
        return db.update_roster_entry(session, entry_id, data)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(400, "A roster entry already exists for this service date") from exc


@app.delete("/api/roster/{entry_id}", status_code=204)
def api_delete_roster_entry(
    entry_id: int,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    db.delete_roster_entry(session, entry_id)


# ---------------------------------------------------------------------------
# Analytics (public read)
# ---------------------------------------------------------------------------

@app.get("/api/analytics")
def api_analytics(
    from_month: str = Query(..., alias="from"),
    to_month: str = Query(..., alias="to"),
    session: Session = Depends(get_session),
):
    """Return per-chorister service counts for a date range (YYYY-MM format)."""
    try:
        date_from = date.fromisoformat(f"{from_month}-01")
        date_to_parsed = date.fromisoformat(f"{to_month}-01")
        last_day = calendar.monthrange(date_to_parsed.year, date_to_parsed.month)[1]
        date_to = date(date_to_parsed.year, date_to_parsed.month, last_day)
    except ValueError as exc:
        raise HTTPException(400, "Invalid month format. Use YYYY-MM.") from exc
    return db.get_chorister_stats(session, date_from, date_to)


# ---------------------------------------------------------------------------
# Static files — MUST be mounted last so API routes take priority
# ---------------------------------------------------------------------------

if PUBLIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
