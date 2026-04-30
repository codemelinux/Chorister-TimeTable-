# Chorister TimeTable

Chorister TimeTable is a FastAPI-based choir planning app for managing service rosters, a shared song library, chorister portal access, prayer assignments, and performance ratings.

The app serves a static frontend from `public/` and exposes JSON APIs for administration and day-to-day choir workflows. It can run locally with SQLite and deploy to platforms like Vercel, Render, or Railway with PostgreSQL.

## What The Project Currently Does

- Public users can view the monthly service roster, prayer roster, and analytics data.
- Admins can log in with a shared password stored in environment variables.
- Admins can add and remove choristers.
- Admins can create, edit, and delete roster entries for `Hymn`, `Praise Worship`, and `Thanksgiving`.
- Choristers can be granted portal access with a PIN and log in separately from admins.
- Authenticated choristers can submit songs to the shared library.
- Admins can assign songs to specific choristers.
- Songs can optionally sync to Google Docs in Google Drive.
- Admins can record performance ratings, and choristers can view their own ratings.

## Tech Stack

- Backend: FastAPI, Pydantic v2, SQLAlchemy
- Database: SQLite for local development, PostgreSQL in deployment
- Auth: Starlette `SessionMiddleware`, shared admin password, chorister PIN login with `bcrypt`
- Frontend: static HTML, CSS, and JavaScript in `public/`
- Optional integrations: Google Drive API and Google Docs API for song lyric documents

## Project Structure

```text
Chorister TimeTable/
├── api/
│   └── index.py                 # Deployment entrypoint importing main:app
├── public/
│   ├── app.js                   # Frontend logic
│   ├── index.html               # Main UI
│   └── style.css                # Styling
├── scripts/
│   ├── google_auth_setup.py     # One-time Google OAuth helper
│   ├── setup.bat                # Windows setup
│   ├── setup.sh                 # Unix/macOS/WSL setup
│   ├── start.bat                # Windows start script
│   └── start.sh                 # Unix/macOS/WSL start script
├── database.py                  # ORM models, DB helpers, startup migrations
├── google_drive.py              # Google Drive / Docs sync helpers
├── main.py                      # FastAPI app, routes, auth, static file mount
├── Procfile                     # Railway/Procfile start command
├── requirements.txt             # Python dependencies
├── .env.example                 # Example environment variables
└── chorister_timetable.db       # Local SQLite database fallback
```

## Architecture Notes

- `main.py` loads `.env` locally, configures sessions, creates the FastAPI app, and mounts the `public/` directory.
- `database.py` contains the SQLAlchemy models plus all CRUD and analytics helpers.
- Database tables are created automatically on startup, and lightweight column migrations run at startup as well.
- If `DATABASE_URL` or `POSTGRES_URL` is not set, the app falls back to a local SQLite file.
- Session cookies are marked `https_only=True` in production.

## Data Model Overview

Core tables in `database.py`:

- `choristers`: choir members, optional PIN hash, portal-access flag
- `songs`: song library entries, lyrics, category, optional Google Doc link, submission source
- `song_assignments`: links songs to choristers
- `roster_entries`: one row per service date with role assignments and notes
- `prayer_roster`: separate prayer schedule
- `performance_ratings`: admin ratings for service performance

## Environment Variables

Create a local `.env` file based on `.env.example`.

Required for normal app usage:

```env
ADMIN_PASSWORD=change-me-admin
SESSION_SECRET=change-me-session-secret
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
```

Optional Google Drive integration:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GOOGLE_DRIVE_FOLDER_ID=
```

Notes:

- `ADMIN_PASSWORD` is the shared admin login password.
- `SESSION_SECRET` signs session cookies.
- `DATABASE_URL` is the main database connection string.
- `POSTGRES_URL` is also accepted.
- `GOOGLE_DRIVE_FOLDER_ID` is optional. If omitted, song docs are created in the Drive root.

## Production Safeguards

Production mode is detected when any of these are set:

- `VERCEL_ENV=production`
- `RENDER=true`
- `RAILWAY_ENVIRONMENT=production`

In production, the app refuses to start if:

- `ADMIN_PASSWORD` is still `change-me-admin`
- `SESSION_SECRET` is still `dev-session-secret`

## API Summary

### Authentication

- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/chorister-session`
- `POST /api/auth/chorister-login`
- `POST /api/auth/chorister-logout`

### Choristers

- `GET /api/choristers`
- `GET /api/choristers/portal`
- `POST /api/choristers`
- `DELETE /api/choristers/{chorister_id}`
- `POST /api/choristers/{chorister_id}/set-pin`
- `DELETE /api/choristers/{chorister_id}/pin`

### Songs

- `GET /api/songs`
- `GET /api/songs/stats`
- `GET /api/songs/monthly?year=YYYY&month=M`
- `POST /api/songs`
- `PUT /api/songs/{song_id}`
- `DELETE /api/songs/{song_id}`
- `POST /api/songs/{song_id}/assign`
- `DELETE /api/songs/{song_id}/assign/{chorister_id}`
- `POST /api/songs/{song_id}/sync-to-drive`
- `POST /api/songs/sync-all-to-drive`

### Service Roster

- `GET /api/roster?year=YYYY&month=M`
- `POST /api/roster`
- `PUT /api/roster/{entry_id}`
- `DELETE /api/roster/{entry_id}`

### Prayer Roster

- `GET /api/prayer-roster?year=YYYY&month=M`
- `GET /api/prayer-roster/next`
- `POST /api/prayer-roster`
- `PUT /api/prayer-roster/{entry_id}`
- `DELETE /api/prayer-roster/{entry_id}`

### Analytics And Ratings

- `GET /api/analytics?from=YYYY-MM&to=YYYY-MM`
- `POST /api/ratings`
- `GET /api/ratings?year=YYYY&month=M`
- `GET /api/ratings/me`
- `DELETE /api/ratings/{rating_id}`

## Local Development

### Windows

Setup:

```bat
scripts\setup.bat
```

Run:

```bat
scripts\start.bat
```

### Unix, macOS, or WSL

Setup:

```bash
bash scripts/setup.sh
```

Run:

```bash
bash scripts/start.sh
```

### Direct Uvicorn Command

```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) after the server starts.

## Google Drive Setup

Google Drive sync is optional. If configured, songs can be pushed to Google Docs and stored in category folders such as `Hymns`, `Praise & Worship`, and `Thanksgiving`.

One-time setup:

```bash
python scripts/google_auth_setup.py
```

That script expects `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to already exist in your environment or `.env`. It opens a browser-based OAuth flow and prints the `GOOGLE_REFRESH_TOKEN` you should save.

## Deployment

### Vercel

- `api/index.py` is the Python entrypoint and simply imports `main.app`.
- Configure the required environment variables in the Vercel dashboard.
- Use PostgreSQL in production.

### Render

- The app detects Render via `RENDER=true`.
- Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Railway

- `Procfile` contains:

```text
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

- The app detects Railway production via `RAILWAY_ENVIRONMENT=production`.

## Author

Developed by Benedict U.
