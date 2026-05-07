# Next.js Rewrite — Sub-project 1: Foundation

**Date:** 2026-05-07
**Status:** Approved

## Overview

Replace the Python/FastAPI backend and vanilla JS frontend with a full-stack Next.js 15 application. This sub-project delivers the foundation only: project scaffolding, database connection, auth, and the mobile-first layout shell. Feature pages (roster, songs, dues, etc.) are built in subsequent sub-projects.

The existing Python app on Vercel stays live during development. The new app is built in a separate repo and deployed to a new Vercel project. When ready, the domain is swapped.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) | Vercel-native, server components, zero-config deploy |
| Language | TypeScript | Type safety throughout |
| ORM | Prisma | TypeScript-first, native Neon support |
| Database | Neon PostgreSQL (existing) | Reuse live data, no migration |
| Auth | iron-session | Lightweight cookie sessions, replaces Python SessionMiddleware |
| UI | shadcn/ui + Tailwind CSS | Mobile-first, accessible, composable components |

---

## Section 1: Project Structure & Deployment

**New GitHub repository** — built in parallel with the existing Python app.

```
chorister-timetable/
├── app/
│   ├── layout.tsx              ← root layout, fonts, theme provider
│   ├── page.tsx                ← home (roster view placeholder)
│   ├── (auth)/
│   │   └── login/page.tsx      ← login page (admin + chorister)
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts          ← POST admin login
│       │   ├── chorister-login/route.ts ← POST chorister login
│       │   └── logout/route.ts         ← POST logout
│       └── session/route.ts    ← GET current session info
├── components/
│   ├── ui/                     ← shadcn auto-generated components
│   └── app/
│       ├── AppShell.tsx        ← root layout wrapper
│       ├── BottomNav.tsx       ← mobile bottom tab bar
│       ├── Sidebar.tsx         ← desktop left sidebar
│       └── Header.tsx          ← mobile top header
├── lib/
│   ├── db.ts                   ← Prisma client singleton
│   ├── session.ts              ← iron-session config + types
│   └── auth.ts                 ← requireAdmin / requireAuth helpers
├── prisma/
│   └── schema.prisma           ← full schema mirroring existing Neon DB
├── public/                     ← static assets
├── .env.local                  ← DATABASE_URL, SESSION_SECRET, ADMIN_PASSWORD
└── next.config.ts
```

**Deployment:** Connect new repo to Vercel → auto-deploys on push to `main`. No `vercel.json` needed. `public/` served at root natively.

---

## Section 2: Database & Schema

Reuses the **existing Neon database** — same connection string, same data. Prisma generates TypeScript types from the existing schema via `prisma db pull`, then `schema.prisma` is committed.

**8 models** mirroring the current tables:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Chorister {
  id              Int       @id @default(autoincrement())
  name            String
  email           String?
  phone           String?
  pinHash         String?   @map("pin_hash")
  hasPortalAccess Boolean   @default(false) @map("has_portal_access")
  createdAt       DateTime? @default(now()) @map("created_at")

  songAssignments SongAssignment[]
  rosterEntries   RosterEntry[]
  prayerEntries   PrayerRosterEntry[]
  ratings         PerformanceRating[]
  feedback        ChoristerFeedback[]
  monthlyDues     MonthlyDue[]

  @@map("choristers")
}

model Song {
  id          Int      @id @default(autoincrement())
  title       String
  category    String
  key         String?
  driveUrl    String?  @map("drive_url")
  createdAt   DateTime @default(now()) @map("created_at")
  addedBy     Int?     @map("added_by")

  assignments SongAssignment[]

  @@map("songs")
}

model SongAssignment {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  songId      Int      @map("song_id")
  assignedAt  DateTime @default(now()) @map("assigned_at")

  chorister   Chorister @relation(fields: [choristerId], references: [id])
  song        Song      @relation(fields: [songId], references: [id])

  @@map("song_assignments")
}

model RosterEntry {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  serviceDate DateTime @map("service_date")
  category    String
  songId      Int?     @map("song_id")

  chorister   Chorister @relation(fields: [choristerId], references: [id])

  @@map("roster_entries")
}

model PrayerRosterEntry {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  serviceDate DateTime @map("service_date")

  chorister   Chorister @relation(fields: [choristerId], references: [id])

  @@map("prayer_roster_entries")
}

model PerformanceRating {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  rating      Int
  notes       String?
  ratedAt     DateTime @default(now()) @map("rated_at")

  chorister   Chorister @relation(fields: [choristerId], references: [id])

  @@map("performance_ratings")
}

model ChoristerFeedback {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  feedback    String
  createdAt   DateTime @default(now()) @map("created_at")

  chorister   Chorister @relation(fields: [choristerId], references: [id])

  @@map("chorister_feedback")
}

model MonthlyDue {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  year        Int
  month       Int
  amountOwed  Decimal  @map("amount_owed")
  amountPaid  Decimal  @default(0) @map("amount_paid")
  paidAt      DateTime? @map("paid_at")

  chorister   Chorister @relation(fields: [choristerId], references: [id])

  @@unique([choristerId, year, month])
  @@map("monthly_dues")
}
```

**Prisma client singleton** (`lib/db.ts`) — prevents connection pool exhaustion in serverless:

```ts
import { PrismaClient } from "@prisma/client"
const globalForPrisma = globalThis as { prisma?: PrismaClient }
export const db = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
```

---

## Section 3: Auth

**iron-session** with two roles. Session stored in an HttpOnly, SameSite=lax, Secure-in-production cookie with 12-hour max-age.

**Session type** (`lib/session.ts`):
```ts
export type SessionData = {
  isAdmin: boolean
  choristerId?: number
  choristerName?: string
}
export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "chorister-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
  },
}
```

**API routes:**
- `POST /api/auth/login` — bcrypt-verify password vs `ADMIN_PASSWORD`. Sets `isAdmin: true`.
- `POST /api/auth/chorister-login` — look up chorister by ID, bcrypt-verify PIN hash from DB. Sets `choristerId`.
- `POST /api/auth/logout` — destroys session.
- `GET /api/session` — returns current session data (used by client to know role).

**Auth helpers** (`lib/auth.ts`):
```ts
export async function requireAdmin(req: NextRequest): Promise<SessionData>
export async function requireAuth(req: NextRequest): Promise<SessionData>
```
Both throw a `NextResponse` with status 401 if the condition fails. Every API route handler calls the relevant helper before touching the DB.

**Environment variables:**
```
DATABASE_URL=          # Neon pooled connection string (from existing Vercel integration)
SESSION_SECRET=        # 32+ char random string
ADMIN_PASSWORD=        # copy from existing deployment
```

---

## Section 4: Layout & Navigation Shell

**Mobile-first, responsive.** Choristers use phones → bottom tab bar. Admins use desktop → left sidebar.

**Visual direction:**
- Light base with deep indigo/slate primary (`indigo-600` / `slate-800`)
- Rounded cards (`rounded-2xl`) with soft shadows
- Minimum 48px tap targets on all interactive elements
- System font stack + Geist (Next.js default) for headings
- Dark mode toggle via `next-themes`, preference stored in localStorage

**Navigation items** (role-aware):
| Item | Icon | Visible to |
|---|---|---|
| Home | House | All |
| Songs | Music note | All |
| Roster | Calendar | All |
| Dues | Wallet | All |
| Choristers | People | Admin only |
| Analytics | Chart | Admin only |

**Components:**
- `AppShell.tsx` — wraps every page, renders Header + page content + BottomNav (mobile) or Sidebar (md+)
- `BottomNav.tsx` — fixed bottom bar, 5 icons with labels, active state highlighting
- `Sidebar.tsx` — collapsible on tablet, always visible on desktop, shows user name + role
- `Header.tsx` — mobile only: app name left, avatar/menu right

**Breakpoints:**
- `< 768px` (mobile): Header + BottomNav visible, Sidebar hidden
- `768px–1023px` (tablet): Sidebar collapsed to icon-only, BottomNav hidden
- `≥ 1024px` (desktop): Sidebar expanded, Header hidden

**Deliverable for Sub-project 1:** A live Vercel deployment with:
- Working admin login and chorister login
- Shell layout rendering correctly across all breakpoints
- Role-aware navigation (admin sees all items, chorister sees subset)
- Home page placeholder ("Coming soon" or skeleton)
- All existing Neon data accessible via Prisma (verified by a `/api/session` endpoint returning correct data)

---

## Sub-project Roadmap

| # | Sub-project | Builds on |
|---|---|---|
| 1 | **Foundation** (this spec) | — |
| 2 | Songs & Roster | Foundation |
| 3 | Choristers | Foundation |
| 4 | Dues, Ratings & Feedback | Foundation |
| 5 | Google Integrations + Analytics | All above |

Each sub-project gets its own spec → plan → implementation cycle.
