# Chorister TimeTable

Chorister TimeTable is a web-based monthly choir roster planner for assigning choristers to `Hymn`, `Praise Worship`, and `Thanksgiving` service functions.

- Public visitors can view the monthly roster
- Admins can log in with a shared password
- Admins can manage choristers and service-date roster entries
- The app supports deployment on Vercel, Render, and Railway

## Features

- Monthly roster table with month navigation
- One row per service date
- Function-specific metadata:
  - `Hymn`: chorister, song title, musical key
  - `Praise Worship`: chorister, musical key, loop bitrate
  - `Thanksgiving`: chorister, musical key, loop bitrate
- Shared admin authentication using cookie sessions
- Public read-only mode
- Mobile-friendly layout with responsive controls and scrollable roster table
- Chorister analytics endpoint for assignment statistics across a date range

## Stack

### Backend
- Python 3
- FastAPI
- SQLAlchemy
- SessionMiddleware for admin sessions
- PostgreSQL via `psycopg[binary]`

### Frontend
- Static HTML, CSS, and vanilla JavaScript
- Bootstrap 5
- Bootstrap Icons

### Deployment
- Vercel: static frontend from `public/`, Python API entrypoint at `api/index.py`
- Render: web service using `uvicorn` (`RENDER=true` detected automatically)
- Railway: `Procfile`-based deployment (`RAILWAY_ENVIRONMENT=production` detected automatically)

## Project Structure

```text
Chorister TimeTable/
├── api/
│   └── index.py          # Vercel Python API entrypoint
├── public/
│   ├── index.html        # Main web UI
│   ├── app.js            # Frontend logic, auth state, API calls
│   └── style.css         # Responsive styling
├── main.py               # FastAPI app, routes, auth, local dev entrypoint
├── database.py           # SQLAlchemy models and database helpers
├── Procfile              # Railway deployment entrypoint
├── requirements.txt      # Python dependencies
├── .env.example          # Required environment variables
└── scripts/              # Local setup/start helpers
```

## Environment Variables

Create a local `.env` or configure these in your hosting provider:

```env
ADMIN_PASSWORD=change-me-admin
SESSION_SECRET=change-me-session-secret
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
```

Notes:
- `ADMIN_PASSWORD` is the shared admin password for the whole app
- `SESSION_SECRET` signs the HTTP-only session cookie
- `DATABASE_URL` is the primary database connection string
- `POSTGRES_URL` is also supported for Vercel-style environments

If no database URL is provided locally, the app falls back to a local SQLite file for development convenience.

Production mode is detected automatically when any of the following are set:
- `VERCEL_ENV=production`
- `RENDER=true`
- `RAILWAY_ENVIRONMENT=production`

In production mode the app refuses to start if `ADMIN_PASSWORD` or `SESSION_SECRET` are still set to their default values.

## API Overview

### Auth
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Public Data
- `GET /api/choristers`
- `GET /api/roster?year=YYYY&month=M`
- `GET /api/analytics?from=YYYY-MM&to=YYYY-MM`

### Admin-only Data Mutation
- `POST /api/choristers`
- `DELETE /api/choristers/{id}`
- `POST /api/roster`
- `PUT /api/roster/{id}`
- `DELETE /api/roster/{id}`

## Local Development

### Setup

Windows:

```bat
scripts\setup.bat
```

Unix/macOS/WSL:

```bash
bash scripts/setup.sh
```

### Run

Windows:

```bat
scripts\start.bat
```

Unix/macOS/WSL:

```bash
bash scripts/start.sh
```

Or directly:

```bash
python -m uvicorn main:app --reload
```

Then open:

```text
http://127.0.0.1:8000
```

## Deployment

### Vercel
- Frontend is served from `public/`
- API entrypoint is `api/index.py`
- Set `ADMIN_PASSWORD`, `SESSION_SECRET`, and your Postgres connection string in Vercel environment settings

### Render
- Deploy as a web service running `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set `RENDER=true` (or Render sets it automatically) plus the required environment variables

### Railway
- The `Procfile` defines the start command: `web: uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set `RAILWAY_ENVIRONMENT=production` plus the required environment variables in the Railway dashboard

## Current Product Behavior

- Logged-out users can browse the roster but cannot edit anything
- Logged-in admins can create, edit, and delete roster entries
- Logged-in admins can add and remove choristers
- Duplicate service dates are rejected
- Analytics endpoint returns per-chorister assignment counts for a given month range

---

Developed by Benedict U.
