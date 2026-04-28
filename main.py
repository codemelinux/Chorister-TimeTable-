# Developed by Benedict U.
import calendar
import os
import secrets
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

import database as db
import google_drive

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"


def load_local_env():
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

app = FastAPI(title="Chorister TimeTable")
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    https_only=IS_PRODUCTION,
    max_age=60 * 60 * 12,
)


@app.on_event("startup")
def startup():
    db.init_db()


def get_session():
    with db.get_session() as session:
        yield session


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def require_admin(request: Request):
    if not request.session.get("is_admin"):
        raise HTTPException(status_code=401, detail="Admin login required")


def require_chorister_or_admin(request: Request):
    if not (request.session.get("is_admin") or request.session.get("chorister_id")):
        raise HTTPException(status_code=401, detail="Login required")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class LoginBody(BaseModel):
    password: str


class ChoristerLogin(BaseModel):
    chorister_id: int
    pin: str


class SetChoristerPin(BaseModel):
    pin: str = Field(..., min_length=4, max_length=20)


class ChoristerCreate(BaseModel):
    name: str = Field(..., max_length=255)


class SongCreate(BaseModel):
    title: str = Field(..., max_length=255)
    lyrics: str = Field("")
    category: str = Field("general", max_length=32)
    hyperlink: Optional[str] = None


class SongUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    lyrics: Optional[str] = None
    category: Optional[str] = Field(None, max_length=32)
    hyperlink: Optional[str] = None


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
    notes: Optional[str] = None


def parse_service_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(400, "Invalid service_date format") from exc


# ---------------------------------------------------------------------------
# Admin auth endpoints
# ---------------------------------------------------------------------------

@app.get("/api/auth/session")
def api_auth_session(request: Request):
    return {"authenticated": bool(request.session.get("is_admin"))}


@app.post("/api/auth/login")
def api_auth_login(body: LoginBody, request: Request):
    if not secrets.compare_digest(body.password, ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid password")
    request.session["is_admin"] = True
    return {"authenticated": True}


@app.post("/api/auth/logout")
def api_auth_logout(request: Request):
    request.session.pop("is_admin", None)
    return {"authenticated": False}


# ---------------------------------------------------------------------------
# Chorister auth endpoints
# ---------------------------------------------------------------------------

@app.get("/api/auth/chorister-session")
def api_chorister_session(request: Request):
    chorister_id = request.session.get("chorister_id")
    return {
        "authenticated": bool(chorister_id),
        "chorister_id": chorister_id,
        "name": request.session.get("chorister_name"),
    }


@app.post("/api/auth/chorister-login")
def api_chorister_login(body: ChoristerLogin, request: Request, session: Session = Depends(get_session)):
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
    request.session.pop("chorister_id", None)
    request.session.pop("chorister_name", None)
    return {"authenticated": False}


# ---------------------------------------------------------------------------
# Chorister management
# ---------------------------------------------------------------------------

@app.get("/api/choristers")
def api_list_choristers(session: Session = Depends(get_session)):
    return db.list_choristers(session)


@app.get("/api/choristers/portal")
def api_list_portal_choristers(session: Session = Depends(get_session)):
    """Return choristers with portal access (for login dropdown)."""
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
    db.revoke_chorister_pin(session, chorister_id)


# ---------------------------------------------------------------------------
# Songs
# ---------------------------------------------------------------------------

@app.get("/api/songs")
def api_list_songs(session: Session = Depends(get_session)):
    return db.list_songs(session)


@app.get("/api/songs/stats")
def api_song_stats(session: Session = Depends(get_session)):
    return db.get_song_stats(session)


@app.get("/api/songs/monthly")
def api_songs_monthly(year: int, month: int, session: Session = Depends(get_session)):
    if not (1 <= month <= 12):
        raise HTTPException(400, "month must be 1-12")
    return db.list_songs_by_month(session, year, month)


@app.post("/api/songs", status_code=201)
def api_create_song(
    body: SongCreate,
    request: Request,
    session: Session = Depends(get_session),
    _auth: None = Depends(require_chorister_or_admin),
):
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Song title cannot be empty")
    valid_categories = {"hymn", "praise_worship", "thanksgiving", "general"}
    category = body.category.strip() if body.category else "general"
    if category not in valid_categories:
        raise HTTPException(400, f"category must be one of: {', '.join(sorted(valid_categories))}")

    submitted_by = request.session.get("chorister_id")

    song_data = {
        "title": title,
        "lyrics": body.lyrics.strip() if body.lyrics else "",
        "category": category,
        "hyperlink": body.hyperlink.strip() if body.hyperlink else None,
        "submitted_by_chorister_id": submitted_by,
    }
    created = db.create_song(session, song_data)

    # Push to Google Drive (non-blocking — errors are logged, not raised)
    doc_url, doc_id = google_drive.push_song_to_drive(title, category, song_data["lyrics"])
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
    song = db.get_song_obj(session, song_id)
    if not song:
        raise HTTPException(404, "Song not found")

    # Choristers may only edit their own submissions
    chorister_id = request.session.get("chorister_id")
    is_admin = request.session.get("is_admin")
    if chorister_id and not is_admin:
        if song.submitted_by_chorister_id != chorister_id:
            raise HTTPException(403, "You can only edit songs you submitted")

    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "title" in data:
        data["title"] = data["title"].strip()
        if not data["title"]:
            raise HTTPException(400, "Song title cannot be empty")
    if "lyrics" in data:
        data["lyrics"] = data["lyrics"].strip()
    if "category" in data:
        valid_categories = {"hymn", "praise_worship", "thanksgiving", "general"}
        if data["category"] not in valid_categories:
            raise HTTPException(400, f"category must be one of: {', '.join(sorted(valid_categories))}")

    updated = db.update_song(session, song_id, data)

    # Re-sync to Drive if lyrics or title changed
    if "lyrics" in data or "title" in data:
        fresh = db.get_song_obj(session, song_id)
        doc_url, doc_id = google_drive.push_song_to_drive(
            fresh.title, fresh.category, fresh.lyrics or "", fresh.google_doc_id
        )
        if doc_url:
            db.update_song(session, song_id, {"google_doc_url": doc_url, "google_doc_id": doc_id})
            updated["google_doc_url"] = doc_url

    return updated


@app.delete("/api/songs/{song_id}", status_code=204)
def api_delete_song(
    song_id: int,
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    db.delete_song(session, song_id)


# ---------------------------------------------------------------------------
# Roster
# ---------------------------------------------------------------------------

@app.get("/api/roster")
def api_list_roster(year: int, month: int, session: Session = Depends(get_session)):
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
    data = {k: v for k, v in body.model_dump().items() if v is not None}
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
# Analytics
# ---------------------------------------------------------------------------

@app.get("/api/analytics")
def api_analytics(
    from_month: str = Query(..., alias="from"),
    to_month: str = Query(..., alias="to"),
    session: Session = Depends(get_session),
):
    try:
        date_from = date.fromisoformat(f"{from_month}-01")
        date_to_parsed = date.fromisoformat(f"{to_month}-01")
        last_day = calendar.monthrange(date_to_parsed.year, date_to_parsed.month)[1]
        date_to = date(date_to_parsed.year, date_to_parsed.month, last_day)
    except ValueError as exc:
        raise HTTPException(400, "Invalid month format. Use YYYY-MM.") from exc
    return db.get_chorister_stats(session, date_from, date_to)


# ---------------------------------------------------------------------------
# Static files (must be last)
# ---------------------------------------------------------------------------

if PUBLIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
