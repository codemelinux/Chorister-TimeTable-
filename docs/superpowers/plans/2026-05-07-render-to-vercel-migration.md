# Render → Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Chorister TimeTable FastAPI app and its PostgreSQL database from Render to Vercel + Neon with zero data loss.

**Architecture:** Two code changes (vercel.json routing + StaticFiles guard in main.py) plus a database dump/restore and environment variable setup. Vercel's CDN serves static files natively; the Python Lambda only handles /api/* routes.

**Tech Stack:** FastAPI, SQLAlchemy, psycopg3, Vercel Python runtime, Neon PostgreSQL, pg_dump/psql

---

## File Map

| File | Action | Change |
|---|---|---|
| `vercel.json` | Modify | Replace catch-all with API-only route + SPA fallback |
| `main.py` | Modify | Guard StaticFiles mount with `VERCEL_ENV` check |

All other files require no changes.

---

### Task 1: Update `vercel.json` routing

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Replace the file contents**

Open `vercel.json`. Current content:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index.py"
    }
  ]
}
```

Replace with:
```json
{
  "functions": {
    "api/index.py": {
      "runtime": "python3.12"
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.py" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The `functions` block pins the Python runtime to 3.12. This is required because the codebase uses `str | None` union syntax (Python 3.10+) and Vercel's default is Python 3.9, which would cause a syntax error at build time.

The first rewrite rule routes all `/api/...` requests to the Python Lambda. The second rule is the SPA catch-all — any path not matching a file in `public/` serves `public/index.html`. Vercel automatically serves real files from `public/` by filename before applying rewrites.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: update vercel routing — api-only Lambda, SPA catch-all, pin Python 3.12"
```

---

### Task 2: Guard StaticFiles mount in `main.py`

**Files:**
- Modify: `main.py:1000-1001`

- [ ] **Step 1: Update the StaticFiles mount guard**

Find this line near the bottom of `main.py` (currently line 1000):
```python
if PUBLIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
```

Replace with:
```python
if PUBLIC_DIR.exists() and not os.getenv("VERCEL_ENV"):
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")
```

On Vercel, `VERCEL_ENV` is always set (`production`, `preview`, or `development`), so the mount is skipped. Locally (dev), it still mounts as before.

- [ ] **Step 2: Verify locally that static files still work in dev**

```bash
uvicorn main:app --reload
```

Open `http://localhost:8000` — the app should load normally. No `VERCEL_ENV` is set locally, so StaticFiles mounts as usual.

- [ ] **Step 3: Commit**

```bash
git add main.py
git commit -m "chore: skip StaticFiles mount on Vercel, served by CDN instead"
```

---

### Task 3: Provision Neon PostgreSQL via Vercel dashboard

This is a manual step in the Vercel web UI.

- [ ] **Step 1: Create the Vercel project (if not already done)**

  Go to [vercel.com](https://vercel.com) → Add New → Project → Import the `Chorister TimeTable` GitHub repository. Accept all defaults. Do **not** deploy yet — click away or cancel after import.

- [ ] **Step 2: Add Neon Postgres storage**

  In the Vercel dashboard → your project → **Storage** tab → **Create** → **Postgres (Neon)** → follow prompts to create a new database.

  Vercel automatically injects these env vars into all deployments:
  - `POSTGRES_URL` — pooled connection string (used by the app at runtime)
  - `POSTGRES_URL_NON_POOLING` — direct connection string (used for migrations)
  - `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGPORT`

- [ ] **Step 3: Copy the non-pooling connection string**

  In the Vercel dashboard → Storage → your Neon database → **.env.local** tab → copy the value of `POSTGRES_URL_NON_POOLING`. You will use this in Task 4 as `$NEON_URL`.

---

### Task 4: Migrate the database from Render to Neon

This copies all live production data from the Render PostgreSQL database to the new Neon database.

- [ ] **Step 1: Get your Render database URL**

  In the Render dashboard → your PostgreSQL service → **Connect** tab → copy the **External Database URL**. It looks like:
  ```
  postgresql://USER:PASSWORD@HOST.render.com:5432/DBNAME
  ```
  Save it as `$RENDER_URL` in your terminal session:
  ```bash
  export RENDER_URL="postgresql://USER:PASSWORD@HOST.render.com:5432/DBNAME"
  export NEON_URL="postgresql://USER:PASSWORD@HOST.neon.tech:5432/DBNAME?sslmode=require"
  ```

- [ ] **Step 2: Dump Render database to a file**

  Requires `pg_dump` installed locally (comes with PostgreSQL). Run:
  ```bash
  pg_dump "$RENDER_URL" --no-owner --no-acl -Fp -f render_backup.sql
  ```

  Expected: a `render_backup.sql` file is created. Check it has content:
  ```bash
  wc -l render_backup.sql
  # Expected: several hundred lines or more
  ```

- [ ] **Step 3: Import the dump into Neon**

  ```bash
  psql "$NEON_URL" -f render_backup.sql
  ```

  Expected output: a stream of `CREATE TABLE`, `INSERT`, `ALTER TABLE` lines with no `ERROR:` lines. Warnings about roles/owners are normal and can be ignored.

- [ ] **Step 4: Verify row counts match**

  Run on Render (source):
  ```bash
  psql "$RENDER_URL" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"
  ```

  Run on Neon (target):
  ```bash
  psql "$NEON_URL" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"
  ```

  The `n_live_tup` counts should match for every table. If any table shows 0 on Neon but non-zero on Render, re-run Step 3 with `--clean` flag:
  ```bash
  psql "$NEON_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  psql "$NEON_URL" -f render_backup.sql
  ```

---

### Task 5: Set environment variables in Vercel

- [ ] **Step 1: Open environment variable settings**

  Vercel dashboard → your project → **Settings** → **Environment Variables**.

- [ ] **Step 2: Add each variable**

  Add the following, selecting **Production**, **Preview**, and **Development** for all of them:

  | Variable | Value |
  |---|---|
  | `ADMIN_PASSWORD` | (copy from Render env) |
  | `SESSION_SECRET` | (copy from Render env) |
  | `GOOGLE_CLIENT_ID` | (copy from Render env) |
  | `GOOGLE_CLIENT_SECRET` | (copy from Render env) |
  | `GOOGLE_REFRESH_TOKEN` | (copy from Render env) |
  | `GOOGLE_DRIVE_FOLDER_ID` | (copy from Render env) |
  | `MONTHLY_DUES_SPREADSHEET_ID` | (copy from Render env) |

  `POSTGRES_URL` is already set automatically by the Neon storage integration. Do **not** set `DATABASE_URL` — the code prefers `POSTGRES_URL` as fallback.

---

### Task 6: Deploy and smoke-test

- [ ] **Step 1: Push code to GitHub**

  ```bash
  git push origin main
  ```

  Vercel will automatically detect the push and deploy. Watch the build in the Vercel dashboard → Deployments tab.

- [ ] **Step 2: Check the build log**

  Expected: build completes without errors. The Python runtime installs from `requirements.txt`. If you see `ModuleNotFoundError`, check that `requirements.txt` is committed.

- [ ] **Step 3: Smoke-test the deployment**

  Open the Vercel deployment URL (e.g. `https://chorister-timetable.vercel.app`).

  Run through this checklist:
  - [ ] Home page loads (static file served from CDN)
  - [ ] Login with admin password works → `POST /api/login` returns 200
  - [ ] Songs list loads → `GET /api/songs` returns data
  - [ ] Roster page loads → `GET /api/roster` returns data
  - [ ] Monthly Dues page loads and shows existing data
  - [ ] Google Drive sync works (if credentials are set)
  - [ ] Logout works

- [ ] **Step 4: Verify DB connectivity in Vercel logs**

  Vercel dashboard → Deployments → your deployment → **Functions** tab → click on `api/index.py` → check logs. Should show no connection errors on startup (`db.init_db()` runs at cold start).

---

### Task 7: Cutover and cleanup

- [ ] **Step 1: Point your custom domain to Vercel (if applicable)**

  Vercel dashboard → your project → **Settings** → **Domains** → add your domain. Follow DNS instructions (add a CNAME or A record). Remove the old Render domain setting.

  If you have no custom domain, skip this step.

- [ ] **Step 2: Suspend the Render web service**

  Render dashboard → your web service → **Settings** → **Suspend Service**. This stops billing for the dyno but keeps the database alive as a rollback option.

- [ ] **Step 3: Keep Render DB alive for 7 days**

  Do not delete the Render PostgreSQL database immediately. If anything goes wrong with the Neon data, you can re-run the `pg_dump` → `psql` steps (Task 4) to restore.

- [ ] **Step 4: Delete Render resources after 7 days**

  After confirming the Vercel deployment is stable for 7 days:
  - Delete the Render web service
  - Delete the Render PostgreSQL database
  - Delete `render_backup.sql` from your local machine (it contains credentials in the connection strings)

  ```bash
  rm render_backup.sql
  ```

- [ ] **Step 5: Final commit — remove Procfile**

  The `Procfile` is only used by Render and is now dead code:
  ```bash
  git rm Procfile
  git commit -m "chore: remove Render Procfile, app is now on Vercel"
  git push origin main
  ```
