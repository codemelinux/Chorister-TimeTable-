# Next.js Rewrite — Sub-project 2: Songs & Roster

**Date:** 2026-05-07
**Status:** Approved

## Overview

Implement the Songs page, Monthly Roster (home page), and Prayer Roster for the Chorister TimeTable Next.js app. Builds directly on the foundation from Sub-project 1 (auth, Prisma, AppShell).

**Pattern:** Server Components fetch data via Prisma at request time (instant load, no spinners). Client Components handle mutations via API route handlers. `router.refresh()` re-renders server data after mutations — no manual state sync.

---

## Section 1: API Routes

All routes live under `app/api/` and follow the same pattern as the auth routes from Sub-project 1. Auth helpers (`requireAdmin`, `requireAuth`) from `lib/auth.ts` are used at the top of each handler.

### Songs — `app/api/songs/`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/songs` | Public | List all songs |
| POST | `/api/songs` | Admin | Create song |
| GET | `/api/songs/stats` | Admin | Usage counts per song |
| GET | `/api/songs/monthly` | Auth | Songs used in `?year=&month=` |
| GET | `/api/songs/[id]` | Public | Single song detail |
| PUT | `/api/songs/[id]` | Admin | Update song |
| DELETE | `/api/songs/[id]` | Admin/own | Delete song |
| POST | `/api/songs/[id]/assign` | Admin | Assign chorister to song |
| DELETE | `/api/songs/[id]/assign/[choristerId]` | Admin | Unassign chorister |

### Roster — `app/api/roster/`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/roster` | Auth | Entries for `?year=&month=` |
| POST | `/api/roster` | Admin | Create entry |
| PUT | `/api/roster/[id]` | Admin | Update entry |
| DELETE | `/api/roster/[id]` | Admin | Delete entry |

### Prayer Roster — `app/api/prayer-roster/`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/prayer-roster` | Auth | Entries for `?year=&month=` |
| GET | `/api/prayer-roster/next` | Auth | Next upcoming prayer leader |
| POST | `/api/prayer-roster` | Admin | Create entry |
| PUT | `/api/prayer-roster/[id]` | Admin | Update entry |
| DELETE | `/api/prayer-roster/[id]` | Admin | Delete entry |

---

## Section 2: Pages & Components

### Home page (`app/(app)/page.tsx`) — Monthly Roster

Replaces the Sub-project 1 placeholder. Server Component fetches roster and prayer roster data for the current month via Prisma. Renders `RosterView` client component with the fetched data.

**Features:**
- `MonthNavigator` — prev/next month arrows, current month label
- Two tabs: **Roster** | **Prayer Roster**
- **Roster tab:** `RosterTable` — rows are service dates (sorted), columns are Hymn / Praise Worship / Thanksgiving
  - "This Week" badge on the row whose `serviceDate` is closest to today (client-side)
  - Admin: each cell has an edit icon → `AssignModal`
- **Prayer Roster tab:** `PrayerRosterTable` — rows are service dates, single column for the assigned chorister
  - Admin: edit icon per row → `AssignModal` (prayer mode)
- Admin: "Add Service Date" button for both tabs

### Songs page (`app/(app)/songs/page.tsx`)

Server Component fetches all songs + chorister list via Prisma. Passes to `SongList` client component.

**Features:**
- Category tabs: **All | Hymn | Praise & Worship | Thanksgiving | General** — filters the list client-side (no re-fetch)
- Responsive grid: 1 col mobile, 2 col tablet, 3 col desktop
- `SongCard` — shows title, category badge (colour-coded), key, assigned chorister names
- Tap card → `SongSheet` opens (shadcn `Sheet`)
- Admin: floating "+" button → `AddSongModal`
- Admin: edit/delete inside `SongSheet`

### `SongSheet` (song detail drawer)

shadcn `Sheet` — slides up from bottom on mobile, from the right on desktop.

**Contents:**
- Song title, category, key
- Assigned choristers (with unassign buttons for admin)
- Admin: assign chorister dropdown
- Lyrics section:
  - If `driveUrl` set: iframe loading `{driveUrl}?embedded=true` + "Open in Google Docs" external link above it
  - If no `driveUrl`: "No lyrics linked yet" placeholder
- Admin: Edit / Delete buttons

---

## Section 3: Data Flow & Auth Guards

**Server-side data fetching** (Prisma directly in Server Components):
- `app/(app)/page.tsx` — fetches `RosterEntry[]` and `PrayerRosterEntry[]` for current month, plus `Chorister[]` for assignment dropdowns
- `app/(app)/songs/page.tsx` — fetches `Song[]` with `assignments` relation included, plus `Chorister[]`

**Client mutations** (API route `fetch` → `router.refresh()`):
1. User triggers action (add/edit/delete) → Client Component modal opens
2. Form submits → `fetch` to API route
3. API route validates auth, runs Prisma mutation, returns JSON
4. Client calls `router.refresh()` → Server Component re-renders with fresh data
5. Modal closes

**Auth guard levels:**
- **Public** — `GET /api/songs`, `GET /api/songs/[id]`
- **Auth required** — `GET /api/roster`, `GET /api/prayer-roster`, `GET /api/prayer-roster/next`, `GET /api/songs/monthly`
- **Admin only** — all POST, PUT, DELETE routes + `GET /api/songs/stats`

**Service dates:** No auto-generation of Sundays. Entries are explicitly created by admin per service date. API response sorts by `serviceDate` ascending. Client highlights "This Week" by finding the entry with `serviceDate` closest to `new Date()` without being more than 6 days in the past.

---

## Component File Map

```
app/
├── (app)/
│   ├── page.tsx                          ← Home: monthly roster (Server Component)
│   └── songs/
│       └── page.tsx                      ← Songs library (Server Component)
│   api/
│   ├── songs/
│   │   ├── route.ts                      ← GET list, POST create
│   │   ├── stats/route.ts                ← GET stats
│   │   ├── monthly/route.ts              ← GET monthly songs
│   │   └── [id]/
│   │       ├── route.ts                  ← GET, PUT, DELETE
│   │       └── assign/
│   │           ├── route.ts              ← POST assign
│   │           └── [choristerId]/route.ts ← DELETE unassign
│   ├── roster/
│   │   ├── route.ts                      ← GET, POST
│   │   └── [id]/route.ts                 ← PUT, DELETE
│   └── prayer-roster/
│       ├── route.ts                      ← GET, POST
│       ├── next/route.ts                 ← GET next
│       └── [id]/route.ts                 ← PUT, DELETE
components/app/
├── MonthNavigator.tsx                    ← Month prev/next selector
├── RosterTable.tsx                       ← Service date rows × category columns
├── PrayerRosterTable.tsx                 ← Service date rows × chorister
├── AssignModal.tsx                       ← Assign chorister dialog (roster + prayer)
├── SongCard.tsx                          ← Song grid card
├── SongSheet.tsx                         ← Song detail drawer with lyrics iframe
└── AddSongModal.tsx                      ← Add/edit song form dialog
```

---

## Sub-project Roadmap (updated)

| # | Sub-project | Status |
|---|---|---|
| 1 | Foundation | ✅ Complete |
| 2 | **Songs & Roster** | ← This spec |
| 3 | Choristers | Pending |
| 4 | Dues, Ratings & Feedback | Pending |
| 5 | Google Integrations + Analytics | Pending |
