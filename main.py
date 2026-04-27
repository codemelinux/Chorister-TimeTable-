# Developed by Benedict U.
import calendar
import os
import secrets
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

import database as db

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "change-me-admin")
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-session-secret")
IS_PRODUCTION = os.getenv("VERCEL_ENV") == "production"

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


def require_admin(request: Request):
    if not request.session.get("is_admin"):
        raise HTTPException(status_code=401, detail="Admin login required")


class LoginBody(BaseModel):
    password: str


class ChoristerCreate(BaseModel):
    name: str


class RosterEntryCreate(BaseModel):
    service_date: str
    hymn_chorister_id: Optional[int] = None
    hymn_song_title: str = ""
    hymn_musical_key: str = ""
    praise_worship_chorister_id: Optional[int] = None
    praise_worship_musical_key: str = ""
    praise_worship_loop_bitrate: str = ""
    thanksgiving_chorister_id: Optional[int] = None
    thanksgiving_musical_key: str = ""
    thanksgiving_loop_bitrate: str = ""


class RosterEntryUpdate(BaseModel):
    service_date: Optional[str] = None
    hymn_chorister_id: Optional[int] = None
    hymn_song_title: Optional[str] = None
    hymn_musical_key: Optional[str] = None
    praise_worship_chorister_id: Optional[int] = None
    praise_worship_musical_key: Optional[str] = None
    praise_worship_loop_bitrate: Optional[str] = None
    thanksgiving_chorister_id: Optional[int] = None
    thanksgiving_musical_key: Optional[str] = None
    thanksgiving_loop_bitrate: Optional[str] = None


def parse_service_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(400, "Invalid service_date format") from exc


def validate_service_date(value: str):
    parse_service_date(value)


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
    request.session.clear()
    return {"authenticated": False}


@app.get("/api/choristers")
def api_list_choristers(session: Session = Depends(get_session)):
    return db.list_choristers(session)


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


if PUBLIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
