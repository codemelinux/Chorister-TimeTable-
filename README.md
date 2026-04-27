# Chorister TimeTable

Chorister TimeTable is a web-based monthly choir roster planner for assigning choristers to `Hymn`, `Praise Worship`, and `Thanksgiving` service functions.

It is built for a simple first release:
- public visitors can view the monthly roster
- admins can log in with a shared password
- admins can manage choristers and service-date roster entries
- the app is structured for Vercel deployment with a static frontend and Python API routes

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

## Stack

### Backend
- Python 3
- FastAPI
- SQLAlchemy
- SessionMiddleware for admin sessions
- PostgreSQL-ready via `psycopg`

### Frontend
- Static HTML, CSS, and vanilla JavaScript
- Bootstrap 5
- Bootstrap Icons

### Deployment
- Vercel static frontend from `public/`
- Vercel Python API entrypoint at `api/index.py`
- Vercel Postgres via environment-backed `DATABASE_URL` or `POSTGRES_URL`

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
├── requirements.txt      # Python dependencies
├── .env.example          # Required environment variables
└── scripts/              # Local setup/start helpers
```

## Environment Variables

Create a local `.env` or configure these in Vercel:

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

## API Overview

### Auth
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Public Data
- `GET /api/choristers`
- `GET /api/roster?year=YYYY&month=M`

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

## Vercel Deployment Notes

- Put the frontend in `public/`
- Keep the FastAPI app export available through `api/index.py`
- Set `ADMIN_PASSWORD`, `SESSION_SECRET`, and your Postgres connection string in Vercel environment settings
- For production, use Vercel Postgres rather than local SQLite

## Current Product Behavior

- Logged-out users can browse the roster but cannot edit anything
- Logged-in admins can create, edit, and delete roster entries
- Logged-in admins can add and remove choristers
- Duplicate service dates are rejected

---

Developed by Benedict U.
