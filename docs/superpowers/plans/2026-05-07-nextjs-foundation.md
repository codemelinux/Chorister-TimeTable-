# Next.js Rewrite — Sub-project 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a new Next.js 15 full-stack app with Prisma + Neon DB, iron-session auth, and a mobile-first layout shell, deployed to Vercel with a clean URL.

**Architecture:** Next.js 15 App Router with route groups — `(auth)` for the login page (no shell) and `(app)` for authenticated pages (wrapped in AppShell). Auth uses iron-session cookies. DB uses Prisma against the existing Neon PostgreSQL database. UI uses shadcn/ui + Tailwind with dark mode support via next-themes.

**Tech Stack:** Next.js 15, TypeScript, Prisma, Neon PostgreSQL, iron-session, bcryptjs, shadcn/ui, Tailwind CSS, next-themes, lucide-react, Vitest

---

## File Map

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | All 8 DB models, mirrors existing Neon schema |
| `lib/db.ts` | Prisma client singleton |
| `lib/session.ts` | iron-session config + SessionData type |
| `lib/auth.ts` | getSession, requireAdmin, requireAuth, checkIsAdmin, checkIsAuth |
| `app/layout.tsx` | Root layout — fonts, ThemeProvider |
| `app/(auth)/login/page.tsx` | Unified admin + chorister login |
| `app/(app)/layout.tsx` | Auth guard + AppShell wrapper |
| `app/(app)/page.tsx` | Home placeholder |
| `app/api/auth/login/route.ts` | POST admin login |
| `app/api/auth/chorister-login/route.ts` | POST chorister login |
| `app/api/auth/logout/route.ts` | POST logout |
| `app/api/session/route.ts` | GET current session |
| `components/app/ThemeProvider.tsx` | next-themes wrapper |
| `components/app/ThemeToggle.tsx` | Dark/light toggle button |
| `components/app/AppShell.tsx` | Server component — reads session, renders shell |
| `components/app/Header.tsx` | Mobile sticky header |
| `components/app/BottomNav.tsx` | Mobile bottom tab bar |
| `components/app/Sidebar.tsx` | Desktop left sidebar |
| `__tests__/lib/auth.test.ts` | Unit tests for checkIsAdmin / checkIsAuth |

**Work directory:** `C:\Users\ubenedict\Pictures\PythonProject\chorister-next`
(All commands run from this directory unless noted.)

---

### Task 1: Scaffold the project

**Files:**
- Create: `C:\Users\ubenedict\Pictures\PythonProject\chorister-next\` (new directory via CLI)

- [ ] **Step 1: Run create-next-app**

```powershell
cd C:\Users\ubenedict\Pictures\PythonProject
npx create-next-app@latest chorister-next --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --no-turbopack
```

When prompted for "Would you like to use Turbopack for next dev?": choose **No**.

Expected: a `chorister-next/` directory is created.

- [ ] **Step 2: Enter the directory and initialise git**

```powershell
cd chorister-next
git init
git add -A
git commit -m "chore: scaffold Next.js 15 project"
```

- [ ] **Step 3: Create `.env.local`**

Create `C:\Users\ubenedict\Pictures\PythonProject\chorister-next\.env.local` with:

```env
DATABASE_URL=<paste POSTGRES_URL_NON_POOLING from Vercel/Neon dashboard>
SESSION_SECRET=<generate 32+ char random string e.g. openssl rand -base64 32>
ADMIN_PASSWORD=<copy from existing Render/Vercel env>
```

The `DATABASE_URL` should be the **non-pooling** connection string for Prisma migrations/introspection. At runtime, Vercel injects `POSTGRES_URL` automatically.

- [ ] **Step 4: Add `.env.local` to `.gitignore`**

Confirm `.gitignore` already contains `.env.local` (create-next-app adds it). If missing:

```powershell
echo ".env.local" >> .gitignore
```

---

### Task 2: Install dependencies

**Files:** `package.json`

- [ ] **Step 1: Install Prisma**

```powershell
npm install prisma @prisma/client
npm install -D prisma
```

- [ ] **Step 2: Install iron-session and bcryptjs**

```powershell
npm install iron-session bcryptjs
npm install -D @types/bcryptjs
```

- [ ] **Step 3: Install next-themes**

```powershell
npm install next-themes
```

- [ ] **Step 4: Install Vitest and testing libraries**

```powershell
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./") },
  },
})
```

- [ ] **Step 6: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom"
```

- [ ] **Step 7: Add test script to `package.json`**

Open `package.json` and add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 8: Initialise shadcn/ui**

```powershell
npx shadcn@latest init
```

When prompted:
- Style: **Default**
- Base color: **Slate**
- CSS variables: **Yes**

- [ ] **Step 9: Add required shadcn components**

```powershell
npx shadcn@latest add button input label card tabs
```

- [ ] **Step 10: Commit**

```powershell
git add -A
git commit -m "chore: install dependencies and configure shadcn/ui"
```

---

### Task 3: Prisma schema and DB client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/db.ts`

- [ ] **Step 1: Initialise Prisma**

```powershell
npx prisma init --datasource-provider postgresql
```

Expected: `prisma/schema.prisma` and `.env` created. Delete the generated `.env` (we use `.env.local`):

```powershell
Remove-Item .env
```

- [ ] **Step 2: Write `prisma/schema.prisma`**

Replace the entire file with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
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
  id        Int      @id @default(autoincrement())
  title     String
  category  String
  key       String?
  driveUrl  String?  @map("drive_url")
  createdAt DateTime @default(now()) @map("created_at")
  addedBy   Int?     @map("added_by")

  assignments SongAssignment[]

  @@map("songs")
}

model SongAssignment {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  songId      Int      @map("song_id")
  assignedAt  DateTime @default(now()) @map("assigned_at")

  chorister Chorister @relation(fields: [choristerId], references: [id], onDelete: Cascade)
  song      Song      @relation(fields: [songId], references: [id], onDelete: Cascade)

  @@map("song_assignments")
}

model RosterEntry {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  serviceDate DateTime @map("service_date")
  category    String
  songId      Int?     @map("song_id")

  chorister Chorister @relation(fields: [choristerId], references: [id], onDelete: Cascade)

  @@map("roster_entries")
}

model PrayerRosterEntry {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  serviceDate DateTime @map("service_date")

  chorister Chorister @relation(fields: [choristerId], references: [id], onDelete: Cascade)

  @@map("prayer_roster_entries")
}

model PerformanceRating {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  rating      Int
  notes       String?
  ratedAt     DateTime @default(now()) @map("rated_at")

  chorister Chorister @relation(fields: [choristerId], references: [id], onDelete: Cascade)

  @@map("performance_ratings")
}

model ChoristerFeedback {
  id          Int      @id @default(autoincrement())
  choristerId Int      @map("chorister_id")
  feedback    String
  createdAt   DateTime @default(now()) @map("created_at")

  chorister Chorister @relation(fields: [choristerId], references: [id], onDelete: Cascade)

  @@map("chorister_feedback")
}

model MonthlyDue {
  id          Int       @id @default(autoincrement())
  choristerId Int       @map("chorister_id")
  year        Int
  month       Int
  amountOwed  Decimal   @map("amount_owed")
  amountPaid  Decimal   @default(0) @map("amount_paid")
  paidAt      DateTime? @map("paid_at")

  chorister Chorister @relation(fields: [choristerId], references: [id], onDelete: Cascade)

  @@unique([choristerId, year, month])
  @@map("monthly_dues")
}
```

- [ ] **Step 3: Generate Prisma client**

```powershell
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 4: Verify schema matches live DB**

```powershell
npx prisma db pull --force
```

If this produces a diff, reconcile any column name differences between what was pulled and the schema above, then re-run `npx prisma generate`.

- [ ] **Step 5: Create `lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as { prisma?: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
```

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: add Prisma schema and DB client singleton"
```

---

### Task 4: Session and auth library

**Files:**
- Create: `lib/session.ts`
- Create: `lib/auth.ts`
- Create: `__tests__/lib/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { checkIsAdmin, checkIsAuth } from "@/lib/auth"

describe("checkIsAdmin", () => {
  it("returns true when isAdmin is true", () => {
    expect(checkIsAdmin({ isAdmin: true })).toBe(true)
  })
  it("returns false when isAdmin is false", () => {
    expect(checkIsAdmin({ isAdmin: false })).toBe(false)
  })
  it("returns false for empty session", () => {
    expect(checkIsAdmin({})).toBe(false)
  })
})

describe("checkIsAuth", () => {
  it("returns true for admin", () => {
    expect(checkIsAuth({ isAdmin: true })).toBe(true)
  })
  it("returns true for chorister with ID", () => {
    expect(checkIsAuth({ isAdmin: false, choristerId: 1 })).toBe(true)
  })
  it("returns false for empty session", () => {
    expect(checkIsAuth({})).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
npm test
```

Expected: FAIL — `Cannot find module '@/lib/auth'`

- [ ] **Step 3: Create `lib/session.ts`**

```ts
import type { SessionOptions } from "iron-session"

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
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  },
}
```

- [ ] **Step 4: Create `lib/auth.ts`**

```ts
import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { sessionOptions, type SessionData } from "./session"

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions)
}

export function checkIsAdmin(session: Partial<SessionData>): boolean {
  return !!session.isAdmin
}

export function checkIsAuth(session: Partial<SessionData>): boolean {
  return !!session.isAdmin || !!session.choristerId
}

export async function requireAdmin() {
  const session = await getSession()
  if (!checkIsAdmin(session)) {
    return { session: null, error: NextResponse.json({ detail: "Admin required" }, { status: 401 }) }
  }
  return { session, error: null }
}

export async function requireAuth() {
  const session = await getSession()
  if (!checkIsAuth(session)) {
    return { session: null, error: NextResponse.json({ detail: "Login required" }, { status: 401 }) }
  }
  return { session, error: null }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```powershell
npm test
```

Expected: `2 test suites passed, 6 tests passed`

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: add session config and auth helpers"
```

---

### Task 5: Auth API routes

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/chorister-login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/api/session/route.ts`

- [ ] **Step 1: Create `app/api/auth/login/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import { sessionOptions, type SessionData } from "@/lib/session"

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ detail: "Invalid password" }, { status: 401 })
  }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.isAdmin = true
  await session.save()

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Create `app/api/auth/chorister-login/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { sessionOptions, type SessionData } from "@/lib/session"

export async function POST(req: NextRequest) {
  const { chorister_id, pin } = await req.json()

  if (!chorister_id || !pin) {
    return NextResponse.json({ detail: "Chorister ID and PIN required" }, { status: 400 })
  }

  const chorister = await db.chorister.findUnique({
    where: { id: Number(chorister_id) },
  })

  if (!chorister || !chorister.pinHash || !chorister.hasPortalAccess) {
    return NextResponse.json({ detail: "Invalid credentials" }, { status: 401 })
  }

  const valid = await bcrypt.compare(String(pin), chorister.pinHash)
  if (!valid) {
    return NextResponse.json({ detail: "Invalid credentials" }, { status: 401 })
  }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.isAdmin = false
  session.choristerId = chorister.id
  session.choristerName = chorister.name
  await session.save()

  return NextResponse.json({ ok: true, name: chorister.name })
}
```

- [ ] **Step 3: Create `app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from "next/server"
import { getIronSession } from "iron-session"
import { cookies } from "next/headers"
import { sessionOptions } from "@/lib/session"

export async function POST() {
  const session = await getIronSession(await cookies(), sessionOptions)
  session.destroy()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Create `app/api/session/route.ts`**

```ts
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"

export async function GET() {
  const session = await getSession()
  return NextResponse.json({
    isAdmin: !!session.isAdmin,
    choristerId: session.choristerId ?? null,
    choristerName: session.choristerName ?? null,
  })
}
```

- [ ] **Step 5: Verify routes compile**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat: add auth API routes (login, chorister-login, logout, session)"
```

---

### Task 6: Login page

**Files:**
- Create: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Create `app/(auth)/login/page.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Music } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const router = useRouter()
  const [adminPassword, setAdminPassword] = useState("")
  const [choristerId, setChoristerId] = useState("")
  const [choristerPin, setChoristerPin] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword }),
    })
    setLoading(false)
    if (res.ok) {
      router.push("/")
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.detail ?? "Invalid password")
    }
  }

  async function handleChoristerLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const res = await fetch("/api/auth/chorister-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chorister_id: Number(choristerId), pin: choristerPin }),
    })
    setLoading(false)
    if (res.ok) {
      router.push("/")
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.detail ?? "Invalid credentials")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <Music className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Choir Time Table</CardTitle>
          <CardDescription>Sign in to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="admin">
            <TabsList className="w-full mb-6">
              <TabsTrigger value="admin" className="flex-1">Admin</TabsTrigger>
              <TabsTrigger value="chorister" className="flex-1">Chorister</TabsTrigger>
            </TabsList>

            <TabsContent value="admin">
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    placeholder="Enter admin password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full h-12" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in as Admin"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="chorister">
              <form onSubmit={handleChoristerLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="chorister-id">Chorister ID</Label>
                  <Input
                    id="chorister-id"
                    type="number"
                    placeholder="Your ID number"
                    value={choristerId}
                    onChange={(e) => setChoristerId(e.target.value)}
                    required
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chorister-pin">PIN</Label>
                  <Input
                    id="chorister-pin"
                    type="password"
                    placeholder="Your PIN"
                    value={choristerPin}
                    onChange={(e) => setChoristerPin(e.target.value)}
                    required
                    inputMode="numeric"
                    autoComplete="current-password"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full h-12" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify the page compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
git add -A
git commit -m "feat: add login page with admin and chorister tabs"
```

---

### Task 7: Theme and shell components

**Files:**
- Create: `components/app/ThemeProvider.tsx`
- Create: `components/app/ThemeToggle.tsx`
- Create: `components/app/Header.tsx`
- Create: `components/app/BottomNav.tsx`
- Create: `components/app/Sidebar.tsx`
- Create: `components/app/AppShell.tsx`

- [ ] **Step 1: Create `components/app/ThemeProvider.tsx`**

```tsx
"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ThemeProviderProps } from "next-themes"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

- [ ] **Step 2: Create `components/app/ThemeToggle.tsx`**

```tsx
"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  )
}
```

- [ ] **Step 3: Create `components/app/Header.tsx`**

```tsx
import { Music } from "lucide-react"
import { ThemeToggle } from "./ThemeToggle"

type Props = { userName: string }

export function Header({ userName }: Props) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <Music className="h-5 w-5 text-primary flex-shrink-0" />
        <span className="font-semibold flex-1 truncate">Choir Time Table</span>
        <span className="text-sm text-muted-foreground truncate max-w-[100px]">{userName}</span>
        <ThemeToggle />
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Create `components/app/BottomNav.tsx`**

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Music, Calendar, Wallet, Users, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"

const ALL_NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home, adminOnly: false },
  { href: "/songs", label: "Songs", icon: Music, adminOnly: false },
  { href: "/roster", label: "Roster", icon: Calendar, adminOnly: false },
  { href: "/dues", label: "Dues", icon: Wallet, adminOnly: false },
  { href: "/choristers", label: "People", icon: Users, adminOnly: true },
  { href: "/analytics", label: "Analytics", icon: BarChart3, adminOnly: true },
] as const

type Props = { isAdmin: boolean }

export function BottomNav({ isAdmin }: Props) {
  const pathname = usePathname()
  const items = ALL_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden safe-area-inset-bottom">
      <div className="flex h-16">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium min-h-[48px] transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 5: Create `components/app/Sidebar.tsx`**

```tsx
"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, Music, Calendar, Wallet, Users, BarChart3, LogOut, Music2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./ThemeToggle"

const ALL_NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home, adminOnly: false },
  { href: "/songs", label: "Songs", icon: Music, adminOnly: false },
  { href: "/roster", label: "Roster", icon: Calendar, adminOnly: false },
  { href: "/dues", label: "Dues", icon: Wallet, adminOnly: false },
  { href: "/choristers", label: "Choristers", icon: Users, adminOnly: true },
  { href: "/analytics", label: "Analytics", icon: BarChart3, adminOnly: true },
] as const

type Props = { isAdmin: boolean; userName: string }

export function Sidebar({ isAdmin, userName }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const items = ALL_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-background min-h-screen shrink-0">
      <div className="flex items-center gap-3 p-6 border-b">
        <Music2 className="h-6 w-6 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">Choir Time Table</p>
          <p className="text-xs text-muted-foreground truncate">{userName}</p>
        </div>
        <ThemeToggle />
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[48px]",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground w-full min-h-[48px] transition-colors"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 6: Create `components/app/AppShell.tsx`**

```tsx
import { getSession } from "@/lib/auth"
import { Header } from "./Header"
import { BottomNav } from "./BottomNav"
import { Sidebar } from "./Sidebar"

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const isAdmin = !!session.isAdmin
  const userName = session.choristerName ?? (isAdmin ? "Admin" : "Guest")

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={isAdmin} userName={userName} />
      <div className="flex flex-col flex-1 min-w-0">
        <Header userName={userName} />
        <main className="flex-1 p-4 pb-24 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav isAdmin={isAdmin} />
    </div>
  )
}
```

- [ ] **Step 7: Verify all components compile**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "feat: add AppShell, Header, BottomNav, Sidebar, ThemeProvider"
```

---

### Task 8: Root layout, app layout, and home placeholder

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/page.tsx`

- [ ] **Step 1: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { ThemeProvider } from "@/components/app/ThemeProvider"
import "./globals.css"

export const metadata: Metadata = {
  title: "Choir Time Table",
  description: "Monthly choir roster planning",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={GeistSans.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

Note: if `geist` isn't installed, install it: `npm install geist`

- [ ] **Step 2: Create `app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation"
import { getSession, checkIsAuth } from "@/lib/auth"
import { AppShell } from "@/components/app/AppShell"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!checkIsAuth(session)) {
    redirect("/login")
  }
  return <AppShell>{children}</AppShell>
}
```

- [ ] **Step 3: Create `app/(app)/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Monthly Roster</h1>
      <p className="text-muted-foreground">Roster view coming in Sub-project 2.</p>
    </div>
  )
}
```

- [ ] **Step 4: Install geist font if needed**

```powershell
npm install geist
```

- [ ] **Step 5: Run dev server and manually verify**

```powershell
npm run dev
```

Open `http://localhost:3000` in a browser:
- [ ] Unauthenticated visit to `/` redirects to `/login`
- [ ] Login page renders with Admin / Chorister tabs
- [ ] Admin login with correct password → redirects to `/`, shows shell
- [ ] Bottom nav visible on mobile viewport (DevTools → toggle device toolbar)
- [ ] Sidebar visible on desktop viewport (> 768px width)
- [ ] Theme toggle switches dark/light mode
- [ ] Sign out button calls logout and redirects to `/login`

- [ ] **Step 6: Run tests**

```powershell
npm test
```

Expected: 6 tests pass.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat: wire up root layout, app route group, and home placeholder"
```

---

### Task 9: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

Create a new GitHub repository called `chorister-next` (via github.com or `gh repo create`):

```powershell
gh repo create chorister-next --public --source=. --remote=origin --push
```

Or manually:
```powershell
git remote add origin https://github.com/<your-username>/chorister-next.git
git push -u origin main
```

- [ ] **Step 2: Create Vercel project**

Go to [vercel.com](https://vercel.com) → Add New → Project → Import `chorister-next`.

- [ ] **Step 3: Add Neon storage integration**

In the new Vercel project → Storage → Connect → select the existing Neon database (the same one the Python app uses). This auto-injects `POSTGRES_URL` and related env vars.

- [ ] **Step 4: Add remaining environment variables**

Vercel dashboard → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `SESSION_SECRET` | 32+ char random string |
| `ADMIN_PASSWORD` | Copy from existing deployment |

`DATABASE_URL` is NOT needed — Prisma will use `POSTGRES_URL` injected by Neon. Add to `prisma/schema.prisma` datasource:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("POSTGRES_URL")
  directUrl = env("POSTGRES_URL_NON_POOLING")
}
```

Update the schema, regenerate, and push:
```powershell
npx prisma generate
git add prisma/schema.prisma
git commit -m "chore: use POSTGRES_URL for Vercel Neon integration"
git push
```

- [ ] **Step 5: Verify deployment**

Open the Vercel deployment URL. Run through the same checklist as Task 8 Step 5 on the live URL:
- [ ] `/` → redirects to `/login`
- [ ] Admin login works → home page renders
- [ ] Chorister login works (use an existing chorister ID + PIN from the DB)
- [ ] Mobile layout correct on phone
- [ ] Desktop sidebar correct in wide viewport
- [ ] Theme toggle works
- [ ] Sign out works

- [ ] **Step 6: Final commit**

```powershell
git add -A
git commit -m "chore: production-ready foundation deployed to Vercel"
git push
```
