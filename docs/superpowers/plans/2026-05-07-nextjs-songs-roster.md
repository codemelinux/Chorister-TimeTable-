# Next.js Sub-project 2: Songs & Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Songs library, Monthly Roster, and Prayer Roster pages to the Next.js app, with full CRUD API routes and mobile-first UI components.

**Architecture:** Server Components fetch data via Prisma at request time. Client Components handle mutations via API route handlers (`fetch` + `router.refresh()`). Home page reads `?year=&month=` search params for month navigation.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma, Neon PostgreSQL, shadcn/ui (Sheet, Dialog, Select, Tabs), Tailwind CSS, Vitest

---

## File Map

```
lib/
  types.ts                            shared Prisma payload types + constants
  roster-utils.ts                     pure helper functions (testable)
__tests__/lib/
  roster-utils.test.ts                unit tests
app/api/
  songs/route.ts                      GET list, POST create
  songs/stats/route.ts                GET usage counts
  songs/monthly/route.ts              GET songs by month
  songs/[id]/route.ts                 GET, PUT, DELETE
  songs/[id]/assign/route.ts          POST assign chorister
  songs/[id]/assign/[choristerId]/route.ts  DELETE unassign
  roster/route.ts                     GET, POST
  roster/[id]/route.ts                PUT, DELETE
  prayer-roster/route.ts              GET, POST
  prayer-roster/next/route.ts         GET next
  prayer-roster/[id]/route.ts         PUT, DELETE
components/app/
  SongCard.tsx
  SongSheet.tsx
  AddSongModal.tsx
  SongList.tsx
  MonthNavigator.tsx
  AssignModal.tsx
  RosterTable.tsx
  PrayerRosterTable.tsx
  RosterView.tsx
app/(app)/
  page.tsx                            Home — replaces placeholder
  songs/page.tsx                      Songs library
```

**Work directory:** `C:\Users\ubenedict\Pictures\PythonProject\chorister-next`

---

### Task 1: shadcn components + shared types + utility functions + tests

**Files:**
- Create: `lib/types.ts`
- Create: `lib/roster-utils.ts`
- Create: `__tests__/lib/roster-utils.test.ts`

- [ ] **Step 1: Install shadcn components**

```powershell
cd C:\Users\ubenedict\Pictures\PythonProject\chorister-next
npx shadcn@latest add sheet dialog select tabs
```

Expected: components appear in `components/ui/`.

- [ ] **Step 2: Write failing tests**

Create `__tests__/lib/roster-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { addMonths, formatMonth, isThisWeek, monthDateRange } from "@/lib/roster-utils"

describe("addMonths", () => {
  it("adds positive months", () => {
    const result = addMonths(new Date(2026, 4, 1), 1)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(5)
  })
  it("subtracts with negative value", () => {
    const result = addMonths(new Date(2026, 4, 1), -1)
    expect(result.getMonth()).toBe(3)
  })
  it("wraps year correctly", () => {
    const result = addMonths(new Date(2025, 11, 1), 1)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(0)
  })
})

describe("monthDateRange", () => {
  it("starts on the 1st", () => {
    const { gte } = monthDateRange(2026, 5)
    expect(gte.getDate()).toBe(1)
    expect(gte.getMonth()).toBe(4)
  })
  it("ends on last day of month", () => {
    const { lte } = monthDateRange(2026, 2)
    expect(lte.getDate()).toBe(28)
  })
})

describe("isThisWeek", () => {
  it("returns true for today", () => {
    expect(isThisWeek(new Date())).toBe(true)
  })
  it("returns false for 30 days ago", () => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    expect(isThisWeek(d)).toBe(false)
  })
  it("returns false for future date", () => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    expect(isThisWeek(d)).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests — confirm they fail**

```powershell
npm test
```

Expected: FAIL — `Cannot find module '@/lib/roster-utils'`

- [ ] **Step 4: Create `lib/roster-utils.ts`**

```ts
export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

export function formatMonth(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export function isThisWeek(serviceDate: Date): boolean {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - 6)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return serviceDate >= start && serviceDate <= end
}

export function monthDateRange(year: number, month: number): { gte: Date; lte: Date } {
  return {
    gte: new Date(year, month - 1, 1),
    lte: new Date(year, month, 0, 23, 59, 59, 999),
  }
}
```

- [ ] **Step 5: Create `lib/types.ts`**

```ts
import type { Prisma } from "@prisma/client"

export type SongWithAssignments = Prisma.SongGetPayload<{
  include: { assignments: { include: { chorister: true } } }
}>

export type RosterEntryWithChorister = Prisma.RosterEntryGetPayload<{
  include: { chorister: true }
}>

export type PrayerEntryWithChorister = Prisma.PrayerRosterEntryGetPayload<{
  include: { chorister: true }
}>

export const SONG_CATEGORIES = ["hymn", "praise_worship", "thanksgiving", "general"] as const
export type SongCategory = (typeof SONG_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<SongCategory, string> = {
  hymn: "Hymn",
  praise_worship: "Praise & Worship",
  thanksgiving: "Thanksgiving",
  general: "General",
}

export const CATEGORY_COLORS: Record<SongCategory, string> = {
  hymn: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  praise_worship: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  thanksgiving: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  general: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
}

export const ROSTER_CATEGORIES = ["hymn", "praise_worship", "thanksgiving"] as const
export type RosterCategory = (typeof ROSTER_CATEGORIES)[number]
```

- [ ] **Step 6: Run tests — confirm they pass**

```powershell
npm test
```

Expected: all tests pass (9 tests including Sub-project 1 tests).

- [ ] **Step 7: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "feat: add shared types, roster utils, and shadcn sheet/dialog/select/tabs"
```

---

### Task 2: Song collection API routes

**Files:**
- Create: `app/api/songs/route.ts`
- Create: `app/api/songs/stats/route.ts`
- Create: `app/api/songs/monthly/route.ts`

- [ ] **Step 1: Create `app/api/songs/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { SONG_CATEGORIES } from "@/lib/types"

export async function GET() {
  const songs = await db.song.findMany({
    include: { assignments: { include: { chorister: true } } },
    orderBy: { title: "asc" },
  })
  return NextResponse.json(songs)
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const { title, category, key, driveUrl } = await req.json()
  if (!title?.trim()) {
    return NextResponse.json({ detail: "Title is required" }, { status: 400 })
  }
  if (!SONG_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { detail: `category must be one of: ${SONG_CATEGORIES.join(", ")}` },
      { status: 400 }
    )
  }

  const song = await db.song.create({
    data: {
      title: title.trim(),
      category,
      key: key?.trim() || null,
      driveUrl: driveUrl?.trim() || null,
    },
    include: { assignments: { include: { chorister: true } } },
  })
  return NextResponse.json(song, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/songs/stats/route.ts`**

```ts
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const stats = await db.songAssignment.groupBy({
    by: ["songId"],
    _count: { songId: true },
    orderBy: { _count: { songId: "desc" } },
  })
  return NextResponse.json(stats)
}
```

- [ ] **Step 3: Create `app/api/songs/monthly/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { monthDateRange } from "@/lib/roster-utils"

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get("year") ?? "")
  const month = parseInt(searchParams.get("month") ?? "")
  if (!year || !month) {
    return NextResponse.json({ detail: "year and month are required" }, { status: 400 })
  }

  const range = monthDateRange(year, month)
  const entries = await db.rosterEntry.findMany({
    where: { serviceDate: range },
    select: { songId: true },
  })
  const songIds = [...new Set(entries.map((e) => e.songId).filter(Boolean))] as number[]

  const songs = await db.song.findMany({
    where: { id: { in: songIds } },
    include: { assignments: { include: { chorister: true } } },
    orderBy: { title: "asc" },
  })
  return NextResponse.json(songs)
}
```

- [ ] **Step 4: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: add song collection API routes (list, create, stats, monthly)"
```

---

### Task 3: Song item API routes

**Files:**
- Create: `app/api/songs/[id]/route.ts`
- Create: `app/api/songs/[id]/assign/route.ts`
- Create: `app/api/songs/[id]/assign/[choristerId]/route.ts`

- [ ] **Step 1: Create `app/api/songs/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, checkIsAuth } from "@/lib/auth"
import { SONG_CATEGORIES } from "@/lib/types"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const song = await db.song.findUnique({
    where: { id: parseInt(id) },
    include: { assignments: { include: { chorister: true } } },
  })
  if (!song) return NextResponse.json({ detail: "Not found" }, { status: 404 })
  return NextResponse.json(song)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  const songId = parseInt(id)
  const song = await db.song.findUnique({ where: { id: songId } })
  if (!song) return NextResponse.json({ detail: "Not found" }, { status: 404 })

  const { title, category, key, driveUrl } = await req.json()
  if (title !== undefined && !title.trim()) {
    return NextResponse.json({ detail: "Title cannot be empty" }, { status: 400 })
  }
  if (category !== undefined && !SONG_CATEGORIES.includes(category)) {
    return NextResponse.json({ detail: `Invalid category` }, { status: 400 })
  }

  const updated = await db.song.update({
    where: { id: songId },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(category !== undefined && { category }),
      ...(key !== undefined && { key: key?.trim() || null }),
      ...(driveUrl !== undefined && { driveUrl: driveUrl?.trim() || null }),
    },
    include: { assignments: { include: { chorister: true } } },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!checkIsAuth(session)) {
    return NextResponse.json({ detail: "Login required" }, { status: 401 })
  }

  const { id } = await params
  const songId = parseInt(id)
  const song = await db.song.findUnique({ where: { id: songId } })
  if (!song) return NextResponse.json({ detail: "Not found" }, { status: 404 })

  const canDelete =
    session.isAdmin || (session.choristerId != null && song.addedBy === session.choristerId)
  if (!canDelete) return NextResponse.json({ detail: "Forbidden" }, { status: 403 })

  await db.song.delete({ where: { id: songId } })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 2: Create `app/api/songs/[id]/assign/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  const { chorister_id } = await req.json()
  if (!chorister_id) {
    return NextResponse.json({ detail: "chorister_id required" }, { status: 400 })
  }

  const assignment = await db.songAssignment.create({
    data: { songId: parseInt(id), choristerId: Number(chorister_id) },
    include: { chorister: true },
  })
  return NextResponse.json(assignment, { status: 201 })
}
```

- [ ] **Step 3: Create `app/api/songs/[id]/assign/[choristerId]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

type Params = { params: Promise<{ id: string; choristerId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id, choristerId } = await params
  await db.songAssignment.deleteMany({
    where: { songId: parseInt(id), choristerId: parseInt(choristerId) },
  })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: add song item API routes (get, update, delete, assign)"
```

---

### Task 4: Roster and Prayer Roster API routes

**Files:**
- Create: `app/api/roster/route.ts`
- Create: `app/api/roster/[id]/route.ts`
- Create: `app/api/prayer-roster/route.ts`
- Create: `app/api/prayer-roster/next/route.ts`
- Create: `app/api/prayer-roster/[id]/route.ts`

- [ ] **Step 1: Create `app/api/roster/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, requireAuth } from "@/lib/auth"
import { monthDateRange } from "@/lib/roster-utils"
import { ROSTER_CATEGORIES } from "@/lib/types"

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get("year") ?? "")
  const month = parseInt(searchParams.get("month") ?? "")
  if (!year || !month) {
    return NextResponse.json({ detail: "year and month are required" }, { status: 400 })
  }

  const entries = await db.rosterEntry.findMany({
    where: { serviceDate: monthDateRange(year, month) },
    include: { chorister: true },
    orderBy: { serviceDate: "asc" },
  })
  return NextResponse.json(entries)
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const { chorister_id, service_date, category, song_id } = await req.json()
  if (!chorister_id || !service_date || !category) {
    return NextResponse.json(
      { detail: "chorister_id, service_date, and category are required" },
      { status: 400 }
    )
  }
  if (!ROSTER_CATEGORIES.includes(category)) {
    return NextResponse.json({ detail: `Invalid category` }, { status: 400 })
  }

  const entry = await db.rosterEntry.create({
    data: {
      choristerId: Number(chorister_id),
      serviceDate: new Date(service_date),
      category,
      songId: song_id ? Number(song_id) : null,
    },
    include: { chorister: true },
  })
  return NextResponse.json(entry, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/roster/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  const { chorister_id, song_id } = await req.json()

  const updated = await db.rosterEntry.update({
    where: { id: parseInt(id) },
    data: {
      ...(chorister_id !== undefined && { choristerId: Number(chorister_id) }),
      ...(song_id !== undefined && { songId: song_id ? Number(song_id) : null }),
    },
    include: { chorister: true },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  await db.rosterEntry.delete({ where: { id: parseInt(id) } })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Create `app/api/prayer-roster/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, requireAuth } from "@/lib/auth"
import { monthDateRange } from "@/lib/roster-utils"

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get("year") ?? "")
  const month = parseInt(searchParams.get("month") ?? "")
  if (!year || !month) {
    return NextResponse.json({ detail: "year and month are required" }, { status: 400 })
  }

  const entries = await db.prayerRosterEntry.findMany({
    where: { serviceDate: monthDateRange(year, month) },
    include: { chorister: true },
    orderBy: { serviceDate: "asc" },
  })
  return NextResponse.json(entries)
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const { chorister_id, service_date } = await req.json()
  if (!chorister_id || !service_date) {
    return NextResponse.json(
      { detail: "chorister_id and service_date are required" },
      { status: 400 }
    )
  }

  const entry = await db.prayerRosterEntry.create({
    data: {
      choristerId: Number(chorister_id),
      serviceDate: new Date(service_date),
    },
    include: { chorister: true },
  })
  return NextResponse.json(entry, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/prayer-roster/next/route.ts`**

```ts
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const entry = await db.prayerRosterEntry.findFirst({
    where: { serviceDate: { gte: new Date() } },
    include: { chorister: true },
    orderBy: { serviceDate: "asc" },
  })
  return NextResponse.json(entry ?? null)
}
```

- [ ] **Step 5: Create `app/api/prayer-roster/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  const { chorister_id } = await req.json()
  const updated = await db.prayerRosterEntry.update({
    where: { id: parseInt(id) },
    data: { choristerId: Number(chorister_id) },
    include: { chorister: true },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  await db.prayerRosterEntry.delete({ where: { id: parseInt(id) } })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 6: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat: add roster and prayer-roster API routes"
```

---

### Task 5: Song UI components

**Files:**
- Create: `components/app/SongCard.tsx`
- Create: `components/app/SongSheet.tsx`
- Create: `components/app/AddSongModal.tsx`

- [ ] **Step 1: Create `components/app/SongCard.tsx`**

```tsx
import { cn } from "@/lib/utils"
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type SongWithAssignments,
  type SongCategory,
} from "@/lib/types"

type Props = {
  song: SongWithAssignments
  onClick: () => void
}

export function SongCard({ song, onClick }: Props) {
  const color = CATEGORY_COLORS[song.category as SongCategory] ?? CATEGORY_COLORS.general
  const label = CATEGORY_LABELS[song.category as SongCategory] ?? song.category

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-2xl border bg-card hover:bg-accent transition-colors shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm leading-snug line-clamp-2 flex-1">{song.title}</h3>
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", color)}>
          {label}
        </span>
      </div>
      {song.key && <p className="text-xs text-muted-foreground mt-1">Key: {song.key}</p>}
      {song.assignments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {song.assignments.map((a) => (
            <span
              key={a.choristerId}
              className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded"
            >
              {a.chorister.name}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Create `components/app/SongSheet.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Trash2, X } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { CATEGORY_LABELS, type SongWithAssignments, type SongCategory } from "@/lib/types"
import type { Chorister } from "@prisma/client"

type Props = {
  song: SongWithAssignments | null
  isAdmin: boolean
  choristers: Chorister[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SongSheet({ song, isAdmin, open, onOpenChange }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (!song) return null

  async function handleUnassign(choristerId: number) {
    setLoading(true)
    await fetch(`/api/songs/${song!.id}/assign/${choristerId}`, { method: "DELETE" })
    router.refresh()
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm(`Delete "${song!.title}"?`)) return
    setLoading(true)
    await fetch(`/api/songs/${song!.id}`, { method: "DELETE" })
    onOpenChange(false)
    router.refresh()
    setLoading(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] md:h-screen md:max-w-md md:right-0 md:left-auto rounded-t-2xl md:rounded-none overflow-y-auto"
      >
        <SheetHeader className="text-left mb-4">
          <SheetTitle className="text-xl pr-8">{song.title}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {CATEGORY_LABELS[song.category as SongCategory] ?? song.category}
            {song.key && ` · Key: ${song.key}`}
          </p>
        </SheetHeader>

        <div className="space-y-6">
          {/* Assigned choristers */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Assigned to
            </p>
            {song.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one assigned yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {song.assignments.map((a) => (
                  <div
                    key={a.choristerId}
                    className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-lg text-sm"
                  >
                    {a.chorister.name}
                    {isAdmin && (
                      <button
                        onClick={() => handleUnassign(a.choristerId)}
                        disabled={loading}
                        className="text-muted-foreground hover:text-destructive ml-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lyrics */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Lyrics
            </p>
            {song.driveUrl ? (
              <div className="space-y-2">
                <a
                  href={song.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in Google Docs
                </a>
                <iframe
                  src={`${song.driveUrl}?embedded=true`}
                  className="w-full h-72 rounded-xl border bg-background"
                  title={`${song.title} lyrics`}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No lyrics linked yet</p>
            )}
          </div>

          {/* Admin actions */}
          {isAdmin && (
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete song
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 3: Create `components/app/AddSongModal.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SONG_CATEGORIES, CATEGORY_LABELS } from "@/lib/types"

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

export function AddSongModal({ open, onOpenChange }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [key, setKey] = useState("")
  const [driveUrl, setDriveUrl] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const res = await fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, key: key || null, driveUrl: driveUrl || null }),
    })
    setLoading(false)
    if (res.ok) {
      setTitle("")
      setCategory("")
      setKey("")
      setDriveUrl("")
      onOpenChange(false)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.detail ?? "Failed to create song")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Song</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="song-title">Title</Label>
            <Input
              id="song-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory} required>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {SONG_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="song-key">Key (optional)</Label>
            <Input
              id="song-key"
              placeholder="e.g. C, G, Bb"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="song-drive">Google Doc URL (optional)</Label>
            <Input
              id="song-drive"
              type="url"
              placeholder="https://docs.google.com/..."
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !category}>
              {loading ? "Adding…" : "Add Song"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: add SongCard, SongSheet, AddSongModal components"
```

---

### Task 6: Songs page

**Files:**
- Create: `components/app/SongList.tsx`
- Create: `app/(app)/songs/page.tsx`

- [ ] **Step 1: Create `components/app/SongList.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SongCard } from "./SongCard"
import { SongSheet } from "./SongSheet"
import { AddSongModal } from "./AddSongModal"
import {
  SONG_CATEGORIES,
  CATEGORY_LABELS,
  type SongWithAssignments,
  type SongCategory,
} from "@/lib/types"
import type { Chorister } from "@prisma/client"

type Filter = "all" | SongCategory

type Props = {
  songs: SongWithAssignments[]
  choristers: Chorister[]
  isAdmin: boolean
}

export function SongList({ songs, choristers, isAdmin }: Props) {
  const [filter, setFilter] = useState<Filter>("all")
  const [selectedSong, setSelectedSong] = useState<SongWithAssignments | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const filtered =
    filter === "all" ? songs : songs.filter((s) => s.category === filter)

  function openSong(song: SongWithAssignments) {
    setSelectedSong(song)
    setSheetOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Songs</h1>
        {isAdmin && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        )}
      </div>

      {/* Category filter pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(["all", ...SONG_CATEGORIES] as Filter[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === cat
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat as SongCategory]}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          No songs in this category.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((song) => (
            <SongCard key={song.id} song={song} onClick={() => openSong(song)} />
          ))}
        </div>
      )}

      <SongSheet
        song={selectedSong}
        isAdmin={isAdmin}
        choristers={choristers}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      {isAdmin && <AddSongModal open={addOpen} onOpenChange={setAddOpen} />}
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(app)/songs/page.tsx`**

```tsx
import { db } from "@/lib/db"
import { getSession, checkIsAdmin } from "@/lib/auth"
import { SongList } from "@/components/app/SongList"

export default async function SongsPage() {
  const [session, songs, choristers] = await Promise.all([
    getSession(),
    db.song.findMany({
      include: { assignments: { include: { chorister: true } } },
      orderBy: { title: "asc" },
    }),
    db.chorister.findMany({ orderBy: { name: "asc" } }),
  ])

  return (
    <SongList
      songs={songs}
      choristers={choristers}
      isAdmin={checkIsAdmin(session)}
    />
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Test manually**

```powershell
npm run dev
```

Open `http://localhost:3000/songs`. Verify:
- [ ] Song grid loads with category filter pills
- [ ] Tapping a song opens the Sheet
- [ ] Admin sees Add button; non-admin does not
- [ ] Lyrics iframe appears when a song has a `driveUrl`

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: add Songs page with category filter and song detail sheet"
```

---

### Task 7: Roster UI components

**Files:**
- Create: `components/app/MonthNavigator.tsx`
- Create: `components/app/AssignModal.tsx`
- Create: `components/app/RosterTable.tsx`
- Create: `components/app/PrayerRosterTable.tsx`

- [ ] **Step 1: Create `components/app/MonthNavigator.tsx`**

```tsx
"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { addMonths, formatMonth } from "@/lib/roster-utils"

type Props = { value: Date; onChange: (date: Date) => void }

export function MonthNavigator({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(addMonths(value, -1))}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="font-semibold text-sm md:text-base min-w-[150px] text-center">
        {formatMonth(value)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(addMonths(value, 1))}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/app/AssignModal.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Chorister } from "@prisma/client"

type RosterConfig = {
  mode: "roster"
  serviceDate: string
  category: "hymn" | "praise_worship" | "thanksgiving"
  existingEntryId?: number
}

type PrayerConfig = {
  mode: "prayer"
  serviceDate: string
  existingEntryId?: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  choristers: Chorister[]
  config: RosterConfig | PrayerConfig
}

export function AssignModal({ open, onOpenChange, choristers, config }: Props) {
  const router = useRouter()
  const [choristerId, setChoristerId] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const isRoster = config.mode === "roster"
  const endpoint = isRoster ? "/api/roster" : "/api/prayer-roster"
  const dateLabel = new Date(config.serviceDate + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const title = isRoster
    ? `${dateLabel} — ${(config as RosterConfig).category.replace("_", " ")}`
    : `Prayer — ${dateLabel}`

  async function handleSave() {
    if (!choristerId) return
    setLoading(true)
    setError("")

    const body =
      config.mode === "roster"
        ? {
            chorister_id: Number(choristerId),
            service_date: config.serviceDate,
            category: (config as RosterConfig).category,
          }
        : {
            chorister_id: Number(choristerId),
            service_date: config.serviceDate,
          }

    const url = config.existingEntryId ? `${endpoint}/${config.existingEntryId}` : endpoint
    const method = config.existingEntryId ? "PUT" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setLoading(false)
    if (res.ok) {
      setChoristerId("")
      onOpenChange(false)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.detail ?? "Failed to assign")
    }
  }

  async function handleRemove() {
    if (!config.existingEntryId) return
    setLoading(true)
    await fetch(`${endpoint}/${config.existingEntryId}`, { method: "DELETE" })
    setLoading(false)
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base capitalize">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Chorister</Label>
            <Select value={choristerId} onValueChange={setChoristerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select chorister" />
              </SelectTrigger>
              <SelectContent>
                {choristers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          {config.existingEntryId && (
            <Button variant="destructive" size="sm" onClick={handleRemove} disabled={loading}>
              Remove
            </Button>
          )}
          <Button onClick={handleSave} disabled={loading || !choristerId} className="flex-1">
            {loading ? "Saving…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Create `components/app/RosterTable.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { isThisWeek } from "@/lib/roster-utils"
import { AssignModal } from "./AssignModal"
import type { RosterEntryWithChorister, RosterCategory } from "@/lib/types"
import type { Chorister } from "@prisma/client"

const COLS: { key: RosterCategory; label: string }[] = [
  { key: "hymn", label: "Hymn" },
  { key: "praise_worship", label: "Praise & Worship" },
  { key: "thanksgiving", label: "Thanksgiving" },
]

type ModalConfig = {
  serviceDate: string
  category: RosterCategory
  existingEntryId?: number
}

type Props = {
  entries: RosterEntryWithChorister[]
  choristers: Chorister[]
  isAdmin: boolean
}

export function RosterTable({ entries, choristers, isAdmin }: Props) {
  const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null)

  // Group by date string, then by category
  const byDate = new Map<string, Partial<Record<RosterCategory, RosterEntryWithChorister>>>()
  for (const entry of entries) {
    const d = new Date(entry.serviceDate).toISOString().split("T")[0]
    if (!byDate.has(d)) byDate.set(d, {})
    byDate.get(d)![entry.category as RosterCategory] = entry
  }
  const dates = [...byDate.keys()].sort()

  if (dates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        No service dates this month.
        {isAdmin && " Use Add Service Date to create entries."}
      </p>
    )
  }

  return (
    <>
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide pb-2 w-24">
                Date
              </th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide pb-2 px-2"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((dateStr) => {
              const row = byDate.get(dateStr)!
              const date = new Date(dateStr + "T12:00:00")
              const highlight = isThisWeek(date)
              return (
                <tr
                  key={dateStr}
                  className={`border-b last:border-0 ${highlight ? "bg-primary/5" : ""}`}
                >
                  <td className="py-3 pr-2">
                    <p className="font-medium">
                      {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                    {highlight && (
                      <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">
                        This Week
                      </span>
                    )}
                  </td>
                  {COLS.map((col) => {
                    const entry = row[col.key]
                    return (
                      <td key={col.key} className="py-3 px-2">
                        <div className="flex items-center gap-1.5 group min-h-[24px]">
                          <span className={entry?.chorister ? "" : "text-muted-foreground"}>
                            {entry?.chorister?.name ?? "—"}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() =>
                                setModalConfig({
                                  serviceDate: dateStr,
                                  category: col.key,
                                  existingEntryId: entry?.id,
                                })
                              }
                              className="opacity-0 group-hover:opacity-100 md:block transition-opacity text-muted-foreground hover:text-foreground"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modalConfig && (
        <AssignModal
          open
          onOpenChange={(o) => !o && setModalConfig(null)}
          choristers={choristers}
          config={{ mode: "roster", ...modalConfig }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4: Create `components/app/PrayerRosterTable.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { isThisWeek } from "@/lib/roster-utils"
import { AssignModal } from "./AssignModal"
import type { PrayerEntryWithChorister } from "@/lib/types"
import type { Chorister } from "@prisma/client"

type ModalConfig = { serviceDate: string; existingEntryId?: number }

type Props = {
  entries: PrayerEntryWithChorister[]
  choristers: Chorister[]
  isAdmin: boolean
}

export function PrayerRosterTable({ entries, choristers, isAdmin }: Props) {
  const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null)
  const sorted = [...entries].sort(
    (a, b) => new Date(a.serviceDate).getTime() - new Date(b.serviceDate).getTime()
  )

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        No prayer assignments this month.
      </p>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {sorted.map((entry) => {
          const date = new Date(entry.serviceDate)
          const highlight = isThisWeek(date)
          const dateStr = date.toISOString().split("T")[0]
          return (
            <div
              key={entry.id}
              className={`flex items-center justify-between p-3 rounded-xl border ${
                highlight ? "bg-primary/5 border-primary/20" : "bg-card"
              }`}
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {highlight && (
                  <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">
                    This Week
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{entry.chorister?.name ?? "Unassigned"}</span>
                {isAdmin && (
                  <button
                    onClick={() => setModalConfig({ serviceDate: dateStr, existingEntryId: entry.id })}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {modalConfig && (
        <AssignModal
          open
          onOpenChange={(o) => !o && setModalConfig(null)}
          choristers={choristers}
          config={{ mode: "prayer", ...modalConfig }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: add MonthNavigator, AssignModal, RosterTable, PrayerRosterTable"
```

---

### Task 8: Home page (Monthly Roster)

**Files:**
- Create: `components/app/RosterView.tsx`
- Modify: `app/(app)/page.tsx`

- [ ] **Step 1: Create `components/app/RosterView.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MonthNavigator } from "./MonthNavigator"
import { RosterTable } from "./RosterTable"
import { PrayerRosterTable } from "./PrayerRosterTable"
import { addMonths } from "@/lib/roster-utils"
import type { RosterEntryWithChorister, PrayerEntryWithChorister } from "@/lib/types"
import type { Chorister } from "@prisma/client"

type Props = {
  rosterEntries: RosterEntryWithChorister[]
  prayerEntries: PrayerEntryWithChorister[]
  choristers: Chorister[]
  isAdmin: boolean
  initialYear: number
  initialMonth: number
}

export function RosterView({
  rosterEntries,
  prayerEntries,
  choristers,
  isAdmin,
  initialYear,
  initialMonth,
}: Props) {
  const router = useRouter()
  const [month, setMonth] = useState(new Date(initialYear, initialMonth - 1, 1))

  function handleMonthChange(newDate: Date) {
    setMonth(newDate)
    router.push(`/?year=${newDate.getFullYear()}&month=${newDate.getMonth() + 1}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Monthly Roster</h1>
        <MonthNavigator value={month} onChange={handleMonthChange} />
      </div>

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="prayer">Prayer</TabsTrigger>
        </TabsList>
        <TabsContent value="roster" className="mt-4">
          <RosterTable
            entries={rosterEntries}
            choristers={choristers}
            isAdmin={isAdmin}
          />
        </TabsContent>
        <TabsContent value="prayer" className="mt-4">
          <PrayerRosterTable
            entries={prayerEntries}
            choristers={choristers}
            isAdmin={isAdmin}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Replace `app/(app)/page.tsx`**

```tsx
import { db } from "@/lib/db"
import { getSession, checkIsAdmin } from "@/lib/auth"
import { RosterView } from "@/components/app/RosterView"
import { monthDateRange } from "@/lib/roster-utils"

type Props = { searchParams: Promise<{ year?: string; month?: string }> }

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams
  const now = new Date()
  const year = parseInt(params.year ?? "") || now.getFullYear()
  const month = parseInt(params.month ?? "") || now.getMonth() + 1
  const range = monthDateRange(year, month)

  const [session, rosterEntries, prayerEntries, choristers] = await Promise.all([
    getSession(),
    db.rosterEntry.findMany({
      where: { serviceDate: range },
      include: { chorister: true },
      orderBy: { serviceDate: "asc" },
    }),
    db.prayerRosterEntry.findMany({
      where: { serviceDate: range },
      include: { chorister: true },
      orderBy: { serviceDate: "asc" },
    }),
    db.chorister.findMany({ orderBy: { name: "asc" } }),
  ])

  return (
    <RosterView
      rosterEntries={rosterEntries}
      prayerEntries={prayerEntries}
      choristers={choristers}
      isAdmin={checkIsAdmin(session)}
      initialYear={year}
      initialMonth={month}
    />
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```powershell
npm test
```

Expected: all 9 tests pass.

- [ ] **Step 5: Test manually**

```powershell
npm run dev
```

Open `http://localhost:3000`. Verify:
- [ ] Roster table loads for current month
- [ ] Month navigator prev/next updates URL and re-renders table
- [ ] "This Week" badge appears on current week's row
- [ ] Prayer tab shows prayer assignments
- [ ] Admin: pencil icon appears on hover → AssignModal opens → assigning refreshes table
- [ ] Non-admin: no pencil icons visible
- [ ] `/songs` page loads with category filter and song cards

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: add Home (Monthly Roster) page with month navigation and prayer tab"
```
