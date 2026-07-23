# Duty Doctor Roster — Param Healthcare

A web application that auto-generates a monthly hospital duty roster for 6 doctors across 5 daily shifts, respecting a comprehensive set of scheduling constraints — with an editable UI backed by Supabase (PostgreSQL), and manual-override support that survives re-generation.

## Tech Stack

| Layer        | Technology                              |
|-------------|----------------------------------------|
| Backend     | Node.js + TypeScript (Fastify 5)       |
| Database    | Supabase (PostgreSQL) via PostgREST    |
| Frontend    | React 19 + TypeScript (TanStack Router)|
| UI          | shadcn/ui (Radix primitives) + Tailwind CSS v4 |
| Build       | Vite 7 (frontend), tsx (backend)       |
| Tables      | TanStack React Table v8                |
| Icons       | Lucide React                           |
| Dates       | date-fns                               |

---

## 1. Scheduling Algorithm & Constraint Priority

### Overview

The algorithm (`backend/src/services/roster-generator.service.ts` — 732 lines) is a **greedy, day-by-day constraint satisfaction engine**. It iterates through each day of the month in chronological order, assigns shifts to doctors, and tracks state (night counts, weekly shift counts, consecutive nights) to enforce constraints.

### Algorithm Flow

```
For each day of the month:
  1. Reset weekly shift counters on Monday
  2. Update consecutive-night tracking from the previous day
  3. Evaluate reduced-staffing mode (drop low-priority shifts)
  4. Assign Rohan's fixed 4 nights (Mon–Thu)
  5. Assign Rohan's 1 Morning + 1 Afternoon per week
  6. For each shift (night → morning → afternoon → obgyn → day):
     a. Filter available doctors against ALL constraints
     b. Pick the best candidate (different strategy per shift type)
  7. Fallback: assign unassigned doctors to Day shift
```

### Shift Processing Order (Retention Priority)

Shifts are processed in strict order — higher-priority shifts get first pick of available doctors:

| Priority | Shift      | Strategy                        |
|----------|-----------|---------------------------------|
| 1 (highest) | Night     | Equal distribution among pool   |
| 2        | Morning   | Minimise weekly shifts          |
| 3        | Afternoon | Minimise weekly shifts          |
| 4        | OBGYN     | Equal distribution among females|
| 5 (lowest)  | Day       | Fallback for unassigned doctors |

### Doctor Selection Strategies

- **`pickBestDoctorForNight`** — Prefers doctors from `NIGHT_DISTRIBUTION_SLUGS` (Meera, Aditya, Priya, Kavya), sorts by fewest nights assigned so far this month, then by fewest total nights
- **`pickBestDoctorForObgyn`** — Among `OBGYN_ELIGIBLE_SLUGS` (Meera, Priya, Kavya), picks the one with fewest OBGYN assignments this month
- **`pickDoctorForOtherShift`** — Picks the doctor with the fewest shifts this week to ensure even workload distribution

### Rohan's Fixed Schedule (Hardcoded Rules)

- 4 night shifts per week (Monday–Thursday)
- 1 Morning shift + 1 Afternoon shift per week
- Exempt from post-night recovery and consecutive-night bans

### Imran's Restrictions

- Only `day` and `night` shifts allowed
- Maximum 2 nights per month
- `sunday` is weekly off

### Constraint Priority (from highest to lowest)

```
1.  Gender restriction       — OBGYN is female-only
2.  Weekly off               — Mandatory day off per doctor
3.  Approved leave           — Blocks all shifts for that date
4.  Max 1 shift/day          — Per doctor
5.  Max 6 shifts/week        — Per doctor, per ISO week
6.  Rohan's fixed schedule   — 4 nights + 1 morning + 1 afternoon/week
7.  Imran's restrictions     — Day-only (2 nights max/month)
8.  Post-night recovery      — Next day = afternoon or off (except Rohan)
9.  No consecutive nights    — Banned for all except Rohan
10. Equal night distribution — Split among Meera, Aditya, Priya, Kavya
11. Equal OBGYN distribution — Split among Meera, Priya, Kavya
12. Leftover → Day shift     — Unassigned doctors go to Day
```

---

## 2. API Design & Data Model

### Data Model

The database consists of 5 tables (defined in `supabase/duty-doctor-roster-schema.sql`):

```
doctors
├── id              UUID (PK)
├── slug            TEXT UNIQUE (e.g. 'meera', 'rohan')
├── name            TEXT
├── gender          ENUM (male | female)
├── weekly_off      ENUM (sunday..saturday)
├── allowed_shifts  TEXT[] (which shift types this doctor can work)
├── max_nights_per_month  INT (NULL = unlimited)
├── notes           TEXT
├── is_active       BOOLEAN (soft-delete flag)
└── created_at      TIMESTAMPTZ

shift_types
├── id              TEXT PK ('morning' | 'day' | 'obgyn' | 'afternoon' | 'night')
├── name            TEXT
├── starts_at       TIME (e.g. '08:00')
├── ends_at         TIME (e.g. '14:00')
├── min_doctors     INT (always 1)
├── female_only     BOOLEAN (true only for obgyn)
├── retention_priority INT (1=night .. 5=obgyn)
└── created_at      TIMESTAMPTZ

roster_months
├── id              UUID (PK)
├── year            INT (>= 2020)
├── month           INT (1-12)
├── generated_at    TIMESTAMPTZ (NULL until first generation)
├── created_at      TIMESTAMPTZ
└── UNIQUE (year, month)

doctor_leaves
├── id              UUID (PK)
├── doctor_id       UUID → doctors.id (CASCADE)
├── leave_date      DATE
├── reason          TEXT
├── created_at      TIMESTAMPTZ
└── UNIQUE (doctor_id, leave_date)

roster_assignments   ← Core roster output
├── id                  UUID (PK)
├── roster_month_id     UUID → roster_months.id (CASCADE)
├── assignment_date     DATE
├── shift_type_id       TEXT → shift_types.id
├── doctor_id           UUID → doctors.id (SET NULL)
├── is_shift_active     BOOLEAN (false = dropped shift)
├── source              TEXT ('generated' | 'manual' | 'cleared')
├── is_manual_override  BOOLEAN
├── override_note       TEXT
├── updated_at          TIMESTAMPTZ
├── created_at          TIMESTAMPTZ
└── UNIQUE (roster_month_id, assignment_date, shift_type_id)
```

### API Design Patterns

**Unified response format** — Every endpoint returns a consistent envelope:

```json
{
  "status": "success|fail",
  "data": [...],
  "message": "...",
  "pagination": { "count": 10, "current_page": 1, "total_page_count": 5, "total_record_count": 50 }
}
```

**Generic RestController** — A base class (`backend/src/helper/rest.controller.ts`) provides CRUD for all 5 entities with:
- Automatic pagination (`page`, `page_count` query params)
- Column sorting (prefix `-` for descending)
- Full-text search on configurable fields
- PostgreSQL error code handling (23505=duplicate, 23503=foreign key, 42501=permission, 42P01=missing table)
- Hooks: `preSave()`, `postSave()` for entity-specific logic

**Entity-specific overrides:**
- `DoctorController` overrides `delete` to soft-delete (`is_active = false`)
- `DoctorController.getById` filters `is_active = true`
- Each controller specifies its own `tableName`, `lookupID`, `orderBy`, and `searchFields`

### API Endpoints

| Method | Endpoint               | Description                            |
|--------|------------------------|----------------------------------------|
| GET    | `/ping`                | Health check                           |
| GET    | `/health`              | Detailed health (DB per-table status)  |
| CRUD   | `/doctors`             | Doctor management (soft-delete)        |
| CRUD   | `/shift-types`         | Shift type CRUD                        |
| CRUD   | `/roster-months`       | Roster month container CRUD            |
| CRUD   | `/doctor-leaves`       | Leave records CRUD                     |
| CRUD   | `/roster-assignments`  | Assignment CRUD                        |
| POST   | `/generate-roster`     | Run scheduling algorithm               |
| POST   | `/manual-assignment`   | Single assignment with validation      |
| POST   | `/validate-assignment` | Preview constraint violations           |

---

## 3. How Rule Conflicts and Shortages Are Handled

### Conflict Detection (Manual Assignments)

When a user manually assigns a doctor (`POST /manual-assignment` or `POST /validate-assignment`), `validateManualAssignment()` checks ALL constraints and returns warnings:

- **Hard errors** — "not eligible", "not allowed", "maximum reached" (shown as errors)
- **Soft warnings** — Leave conflicts, weekly off, post-night recovery (shown as warnings)

The assignment is saved regardless of conflicts — the warnings inform the user.

### Reduced Staffing Fallback

The `shouldDropShiftsForDay()` function counts unavailable doctors for each day considering ALL constraints:

| Unavailable Doctors | Action                    | Shifts Kept                    |
|--------------------|---------------------------|--------------------------------|
| 0-1                | All shifts proceed        | Morning, Day, OBGYN, Afternoon, Night |
| 2                  | Drop OBGYN                | Morning, Day, Afternoon, Night |
| 3+                 | Drop OBGYN + Day          | Morning, Afternoon, Night      |

When a shift is dropped, an `AssignmentResult` with `doctorId: null` and `isShiftActive: false` is created, and a warning is emitted.

### Manual Override Preservation

- **Default (`overwriteManual: false`)** — Re-generation preserves all manual overrides; only generated assignments are replaced
- **Overwrite mode (`overwriteManual: true`)** — Clears all assignments (including manual) and regenerates from scratch
- A confirmation dialog warns users when manual overrides exist before allowing overwrite

### Conflict Resolution During Generation

When no eligible doctor is found for a shift, an `AssignmentResult` with `doctorId: null` and `source: 'cleared'` is created and a warning is recorded. These gaps are visible in the UI for manual intervention.

---

## 4. Testing Strategy

### Current Status

No automated tests exist yet. The test script in `package.json` is a placeholder.

### Recommended Testing Approach

**Unit Tests** (Vitest):
- `roster-generator.service.ts` — The core algorithm should be tested in isolation:
  - Each constraint individually (gender, weekly off, leave, night cap, recovery, consecutive nights)
  - Reduced-staffing fallback thresholds (2 vs 3 unavailable)
  - Manual override preservation vs overwrite mode
  - Edge cases: month boundaries, week boundaries, all doctors on leave
- `response-formatter.ts` — Format correctness
- `rest.controller.ts` — Error handling paths

**Integration Tests** (Supertest + Fastify):
- Each CRUD endpoint (200, 201, 400, 404, 409 responses)
- Roster generation lifecycle: create month → generate → verify constraints
- Manual assignment validation (valid and invalid cases)
- Soft-delete flow (listing excludes inactive, get-by-id on inactive returns 404)

**Frontend Tests** (Vitest + React Testing Library):
- Data table rendering (loading, empty, populated states)
- Roster grid edit modal (validation display, save flow)
- Doctor CRUD form validation (gender-based shift filtering)
- Toast notification system

**E2E Tests** (Playwright):
- Complete workflow: create doctor → set leave → generate roster → verify assignments → manually override → regenerate preserving overrides

---

## 5. Code Structure & Architecture

```
param_healthcare_task/
│
├── backend/                          # Fastify API server
│   ├── index.ts                      # Server entry point
│   ├── tsconfig.json
│   ├── package.json
│   ├── .env                          # Supabase credentials (gitignored)
│   └── src/
│       ├── config/
│       │   ├── supabase.ts           # Supabase client initialization
│       │   └── db/dbConfig.ts        # Connection health check
│       ├── types/
│       │   └── roster.types.ts       # All TypeScript types & constants
│       ├── helper/
│       │   ├── rest.controller.ts    # Generic CRUD base class (pagination, search, error handling)
│       │   └── response-formatter.ts # Unified success/fail response builder
│       ├── router/
│       │   └── index.ts              # Route registration, CRUD builder
│       ├── controllers/
│       │   ├── health.controller.ts       # DB health per table
│       │   ├── doctor.controller.ts       # Doctor CRUD (soft-delete override)
│       │   ├── shift-type.controller.ts   # Shift type CRUD
│       │   ├── roster-month.controller.ts # Roster month CRUD
│       │   ├── doctor-leave.controller.ts # Leave CRUD
│       │   ├── roster-assignment.controller.ts # Assignment CRUD
│       │   └── roster-generator.controller.ts  # Generation + manual assignment + validation
│       └── services/
│           └── roster-generator.service.ts # Core scheduling algorithm (732 lines)
│
├── frontend/                         # React SPA
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│   ├── package.json
│   ├── .env                          # VITE_API_URL
│   └── src/
│       ├── main.tsx                  # App bootstrap
│       ├── routeTree.gen.ts          # Auto-generated by TanStack Router
│       ├── index.css                 # Tailwind + shadcn theme variables
│       ├── lib/
│       │   ├── api.ts                # HTTP client with typed endpoints
│       │   ├── toast.ts              # Toast notification system
│       │   └── utils.ts              # cn() helper
│       ├── types/
│       │   └── roster.types.ts       # Shared types (mirrors backend)
│       ├── das/                      # Data Access Service (enrichment layer)
│       │   ├── doctor.das.ts         # Doctor display enrichment
│       │   ├── leave.das.ts          # Leave + doctor join enrichment
│       │   └── shift.das.ts          # Shift allocation matrix builder
│       ├── components/
│       │   ├── theme-provider.tsx    # Light/dark mode with keyboard shortcut
│       │   ├── toaster.tsx           # Global toast stack
│       │   └── ui/                   # shadcn/ui primitives (14 components)
│       ├── layout/
│       │   ├── HeaderLayout.tsx      # Top bar with sidebar trigger + dark mode toggle
│       │   └── Menulayout.tsx        # Sidebar with nav items
│       └── routes/
│           ├── __root.tsx            # Root layout (ThemeProvider + Toaster)
│           ├── __mainLayout.tsx      # Sidebar + header layout
│           └── __mainLayout/
│               ├── index.tsx         # Redirect to /roster
│               ├── roster.tsx        # Main roster grid (679 lines)
│               ├── doctors.tsx       # Doctor CRUD table
│               ├── leaves.tsx        # Leave CRUD table
│               └── shifts.tsx        # Monthly shift overview grid
│
└── supabase/
    └── duty-doctor-roster-schema.sql # Full schema + seed data (154 lines)
```

### Architecture Layers

**Backend:**
```
Router (Fastify) → Controllers → RestController Base (CRUD) / Service (Roster Generator) → Supabase JS Client → PostgreSQL
```

**Frontend:**
```
Pages → DAS Layer (enrichment) → API Layer (typed fetch) → Backend REST API
```

**Key Design Decisions:**
- **Generic RestController** — Eliminates repetitive CRUD code across 5 entities; each controller specifies only `tableName`, `lookupID`, `searchFields`, and any override methods
- **DAS Layer** — Separates data fetching from presentation logic; components never call `fetch()` directly
- **No ORM** — Direct PostgREST queries via Supabase JS client for full control over SQL
- **Manual override flag** — Each assignment tracks its source (`generated`/`manual`/`cleared`) and `is_manual_override` boolean, enabling selective preservation during re-generation

---

## 6. Commit History

The project has **3 commits** on a single branch:

| # | Commit | Message |
|---|--------|---------|
| 1 | `81608b6` | Initial commit |
| 2 | `3682f68` | Add initial schema and seed data for Duty Doctor Roster (65 files, 20,037 insertions) |
| 3 | `16fbd52` | Remove Duty Doctor Roster Task Breakdown PDF file from the repository (39 files, 3,993 insertions, 578 deletions) |

The second commit contains the full application — backend (Fastify server, controllers, services, router, types, config), frontend (React app with TanStack Router, shadcn/ui components, DAS layer, pages), and database schema. The third commit removes task specification PDFs and `.DS_Store` artifacts.

---

## Setup

### Prerequisites

- Node.js 22+
- A Supabase project (or local Supabase instance)

### 1. Database Setup

Run `supabase/duty-doctor-roster-schema.sql` in the Supabase SQL Editor. This creates all tables, enums, and seed data (6 doctors, 5 shift types, 4 leave days).

### 2. Backend

```bash
cd backend
cp .env.example .env   # Set SUPABASE_URL, SUPABASE_SECRET_KEY, PORT
npm install
npm run dev             # Starts on port 4000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # Set VITE_API_URL=http://localhost:4000
npm install
npm run dev             # Starts on port 5173
```

## Environment Variables

### Backend (`backend/.env`)

| Variable            | Description                          |
|--------------------|--------------------------------------|
| `PORT`              | Server port (default: 4000)          |
| `SUPABASE_URL`      | Supabase project URL                 |
| `SUPABASE_SECRET_KEY` | Supabase service role API key       |

### Frontend (`frontend/.env`)

| Variable        | Description                          |
|----------------|--------------------------------------|
| `VITE_API_URL`  | Backend API URL (default: localhost:4000) |

---

## Staff Names

All staff names are fictional per the original brief:

| Doctor              | Weekly Off | Slug      | Gender | Allowed Shifts                    | Notes                               |
|-------------------|-----------|-----------|--------|-----------------------------------|-------------------------------------|
| Dr. Meera Kapoor  | Wednesday  | meera     | Female | All 5                             | Post-night recovery                 |
| Dr. Rohan Khanna  | Friday     | rohan     | Male   | Morning, Afternoon, Night         | Exempt from recovery; consecutive nights allowed |
| Dr. Aditya Nair   | Thursday   | aditya    | Male   | All 5                             | Post-night recovery                 |
| Dr. Priya Sharma  | Tuesday    | priya     | Female | All 5                             | Post-night recovery                 |
| Dr. Imran Siddiqui| Sunday     | imran     | Male   | Day, Night (max 2 nights/month)   | Day shift preferred                 |
| Dr. Kavya Menon   | Saturday   | kavya     | Female | All 5                             | Post-night recovery                 |
