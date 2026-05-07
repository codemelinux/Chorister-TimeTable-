# Render → Vercel Migration Design

**Date:** 2026-05-07
**Status:** Approved

## Overview

Migrate the Chorister TimeTable FastAPI app from Render to Vercel, replacing the Render PostgreSQL database with Neon PostgreSQL (Vercel's native Postgres partner). The app already has partial Vercel scaffolding in place (`vercel.json`, `api/index.py`).

---

## 1. Routing & Static Files

**Approach:** Vercel serves `public/` from its CDN; only `/api/*` requests hit the Python Lambda.

**`vercel.json` (replace current content):**
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.py" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- `/api/*` → Python Lambda (FastAPI)
- All other paths → `public/index.html` (SPA catch-all, served from CDN)
- Static files in `public/` (CSS, JS, images) are served automatically by Vercel CDN by filename

**`main.py` change** — guard the StaticFiles mount so it's skipped on Vercel:
```python
if PUBLIC_DIR.exists() and not os.getenv("VERCEL_ENV"):
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
```

---

## 2. Database — Neon PostgreSQL

**Setup:** Create via Vercel dashboard → Storage → Create → Postgres (Neon). Vercel auto-injects `POSTGRES_URL` and related env vars.

**Code compatibility:** No changes needed. `database.py` already reads:
```python
os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
```

**Data migration (Render PostgreSQL → Neon):**
1. `pg_dump` the live Render PostgreSQL database to a `.sql` file
2. Import the dump into Neon via `psql` or Neon's dashboard import tool
3. Verify row counts match before cutover

The existing `scripts/migrate_sqlite_to_postgres.py` is not used here (it copies SQLite → Postgres; source data is already Postgres on Render).

---

## 3. Environment Variables

Set these in Vercel dashboard (Settings → Environment Variables):

| Variable | Source |
|---|---|
| `ADMIN_PASSWORD` | Copy from Render env |
| `SESSION_SECRET` | Copy from Render env |
| `GOOGLE_CLIENT_ID` | Copy from Render env |
| `GOOGLE_CLIENT_SECRET` | Copy from Render env |
| `GOOGLE_REFRESH_TOKEN` | Copy from Render env |
| `GOOGLE_DRIVE_FOLDER_ID` | Copy from Render env |
| `MONTHLY_DUES_SPREADSHEET_ID` | Copy from Render env |
| `POSTGRES_URL` | Auto-set by Vercel when Neon storage is added |

`DATABASE_URL` does not need to be set manually — the code falls back to `POSTGRES_URL`.

`VERCEL_ENV` is set automatically by Vercel in all deployments (value: `production`, `preview`, or `development`). The existing `IS_PRODUCTION` guard in `main.py` already checks for it.

---

## 4. Cutover Sequence

Steps in order to avoid data loss or downtime:

1. Create Neon DB via Vercel dashboard (Storage → Postgres)
2. `pg_dump` Render DB → import into Neon, verify row counts
3. Set all env vars in Vercel dashboard
4. Connect GitHub repo to Vercel (or deploy via `vercel --prod`)
5. Smoke-test the Vercel deployment: login, songs, roster, monthly dues, Google Drive sync
6. Point custom domain (if any) to Vercel
7. Shut down Render web service; keep Render DB alive a few days as rollback backup, then delete

---

## 5. Code Changes Summary

| File | Change |
|---|---|
| `vercel.json` | Replace routing — API only to Lambda, SPA catch-all for static |
| `main.py` | Guard `StaticFiles` mount with `not os.getenv("VERCEL_ENV")` |

All other files (`api/index.py`, `database.py`, `requirements.txt`) require no changes.
