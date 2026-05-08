# Chorister TimeTable

Chorister TimeTable is a FastAPI-based choir planning app for managing service rosters, prayer schedules, songs, chorister portal access, monthly dues, feedback, analytics, and performance ratings.

The app serves a static frontend from `public/` and exposes JSON APIs for administration and day-to-day choir workflows. It can run locally with SQLite and deploy with PostgreSQL on platforms such as Vercel, Render, or Railway.

## Features

- Public users can view monthly service rosters, prayer rosters, and analytics.
- Admins can log in with a shared password stored in environment variables.
- Admins can add and remove choristers.
- Choristers can receive portal access with a PIN and log in separately from admins.
- Admins can create, edit, and delete roster entries for `Hymn`, `Praise Worship`, and `Thanksgiving`.
- Choristers can submit songs to the shared song library.
- Admins can assign songs to specific choristers.
- Songs can optionally sync to Google Docs in Google Drive.
- Admins can record performance ratings, and choristers can view their own ratings.
- Choristers can submit feedback, and admins can review and update it.
- Monthly dues can be tracked in the app and optionally synced with Google Sheets.

## Tech Stack

- Backend: FastAPI, Pydantic v2, SQLAlchemy
- Database: SQLite for local development, PostgreSQL in deployment
- Auth: Starlette `SessionMiddleware`, shared admin password, chorister PIN login with `bcrypt`
- Frontend: static HTML, CSS, and JavaScript in `public/`
- Optional integrations: Google Drive, Google Docs, and Google Sheets APIs

## Project Structure

```text
Chorister TimeTable/
|-- api/
|   `-- index.py                 # Deployment entrypoint importing main:app
|-- public/
|   |-- app.js                   # Frontend bootstrap / shared logic
|   |-- index.html               # Main UI
|   |-- style.css                # Styling
|   `-- js/modals/               # Modal-specific frontend modules
|-- scripts/
|   |-- google_auth_setup.py     # One-time Google OAuth helper
|   |-- setup.bat                # Windows setup
|   |-- setup.sh                 # Unix/macOS/WSL setup
|   |-- start.bat                # Windows start script
|   `-- start.sh                 # Unix/macOS/WSL start script
|-- database.py                  # ORM models, DB helpers, startup migrations
|-- google_drive.py              # Google Drive / Docs sync helpers
|-- google_sheets.py             # Monthly dues Google Sheets helpers
|-- main.py                      # FastAPI app, routes, auth, static file mount
|-- requirements.txt             # Python dependencies
|-- vercel.json                  # Vercel routing configuration
|-- .env.example                 # Example environment variables
`-- chorister_timetable.db       # Local SQLite database fallback
```

## Architecture Notes

- `main.py` loads `.env` locally, configures sessions, creates the FastAPI app, and mounts the `public/` directory.
- `database.py` contains the SQLAlchemy models plus CRUD, analytics, ratings, feedback, and monthly dues helpers.
- Database tables are created automatically on startup, and lightweight column migrations run at startup as needed.
- If `DATABASE_URL` or `POSTGRES_URL` is not set, the app falls back to a local SQLite file.
- Session cookies are marked `https_only=True` in production.

## Data Model Overview

Core tables in `database.py` include:

- `choristers`: choir members, optional PIN hash, and portal-access flag
- `songs`: song library entries, lyrics, category, optional Google Doc link, and submission source
- `song_assignments`: song-to-chorister assignments
- `roster_entries`: service dates with role assignments and notes
- `prayer_roster`: prayer schedule entries
- `performance_ratings`: admin ratings for service performance
- Feedback and monthly dues tables used by the portal and admin views

## Environment Variables

Create a local `.env` file based on `.env.example`.

Required for normal app usage:

```env
ADMIN_PASSWORD=change-me-admin
SESSION_SECRET=change-me-session-secret
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
```

Optional Google integrations:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GOOGLE_DRIVE_FOLDER_ID=
MONTHLY_DUES_SPREADSHEET_ID=
```

Notes:

- `ADMIN_PASSWORD` is the shared admin login password.
- `SESSION_SECRET` signs session cookies.
- `DATABASE_URL` is the main database connection string.
- `POSTGRES_URL` is also accepted.
- `GOOGLE_DRIVE_FOLDER_ID` is optional. If omitted, song docs are created in the Drive root.
- `MONTHLY_DUES_SPREADSHEET_ID` is optional and enables monthly dues sync with an existing Google Sheet.

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

### Analytics, Ratings, Feedback, And Dues

- `GET /api/analytics?from=YYYY-MM&to=YYYY-MM`
- `POST /api/ratings`
- `GET /api/ratings?year=YYYY&month=M`
- `GET /api/ratings/me`
- `DELETE /api/ratings/{rating_id}`
- `POST /api/feedback`
- `GET /api/feedback/me`
- `GET /api/feedback`
- `PATCH /api/feedback/{feedback_id}`
- `GET /api/monthly-dues`
- `PUT /api/monthly-dues/{chorister_id}/{year}/{month}`
- `POST /api/monthly-dues/sync`

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

## Google Drive And Sheets Setup

Google integration is optional. If configured, songs can be pushed to Google Docs and stored in category folders such as `Hymns`, `Praise & Worship`, and `Thanksgiving`. Monthly dues can also sync with an existing Google Sheet when `MONTHLY_DUES_SPREADSHEET_ID` is set.

One-time OAuth setup:

```bash
python scripts/google_auth_setup.py
```

That script expects `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to already exist in your environment or `.env`. It opens a browser-based OAuth flow and prints the `GOOGLE_REFRESH_TOKEN` you should save.

## Deployment

### Vercel

- `api/index.py` is the Python entrypoint and imports `main.app`.
- `vercel.json` rewrites API requests to that FastAPI app.
- Add a Postgres database from Vercel Marketplace, or connect an existing Postgres provider, then set `DATABASE_URL` or `POSTGRES_URL` in the Vercel project environment.
- Set production values for `ADMIN_PASSWORD` and `SESSION_SECRET`; the app refuses to start in production with the development defaults.
- Optional Google integrations should also be copied into Vercel environment variables if song Docs or monthly dues Sheets sync are used.

### Render

- The app detects Render via `RENDER=true`.
- Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Railway

- Use this start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

- The app detects Railway production via `RAILWAY_ENVIRONMENT=production`.

## Author

Developed by Benedict U.
