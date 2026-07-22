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
| Linting     | ESLint + Prettier                      |

## Project Structure

```
param_healthcare_task/
├── backend/
│   ├── index.ts                          # Fastify server entry
│   ├── src/
│   │   ├── config/
│   │   │   ├── supabase.ts               # Supabase client init
│   │   │   └── db/dbConfig.ts            # DB connection check
│   │   ├── controllers/
│   │   │   ├── doctor.controller.ts      # Soft-delete overrides
│   │   │   ├── shift-type.controller.ts
│   │   │   ├── roster-month.controller.ts
│   │   │   ├── doctor-leave.controller.ts
│   │   │   ├── roster-assignment.controller.ts
│   │   │   ├── roster-generator.controller.ts  # Generation + validation
│   │   │   └── health.controller.ts
│   │   ├── helper/
│   │   │   ├── rest.controller.ts        # Generic CRUD base class
│   │   │   └── response-formatter.ts     # Unified response format
│   │   ├── router/index.ts               # Route registration
│   │   ├── services/
│   │   │   └── roster-generator.service.ts  # Core scheduling algorithm
│   │   └── types/roster.types.ts
│   ├── index.ts                          # Server entry point
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ui/                       # shadcn/ui components
│   │   │       ├── alert-dialog.tsx
│   │   │       ├── button.tsx
│   │   │       ├── data-table.tsx
│   │   │       ├── dropdown-menu.tsx
│   │   │       ├── skeleton.tsx
│   │   │       ├── tooltip.tsx
│   │   │       └── ...
│   │   ├── das/                          # Data access layer
│   │   │   ├── doctor.das.ts
│   │   │   ├── leave.das.ts
│   │   │   ├── shift.das.ts
│   │   │   └── roster.das.ts
│   │   ├── lib/
│   │   │   ├── api.ts                    # HTTP client + all endpoints
│   │   │   └── toast.ts                  # Toast notification system
│   │   ├── routes/
│   │   │   └── __mainLayout/
│   │   │       ├── roster.tsx            # Main roster grid
│   │   │       ├── doctors.tsx           # Doctor management
│   │   │       ├── leaves.tsx            # Leave management
│   │   │       ├── shifts.tsx            # Shift type management
│   │   │       └── dashboard.tsx
│   │   └── types/
│   │       └── roster.types.ts
│   └── vite.config.ts
├── supabase/
│   └── duty-doctor-roster-schema.sql     # Full DB schema + seed data
└── backend/.env                          # Supabase credentials (gitignored)
```

## Setup

### Prerequisites

- Node.js 22+
- A Supabase project (or local Supabase instance)

### 1. Database Setup

Run `supabase/duty-doctor-roster-schema.sql` in the Supabase SQL Editor. This creates all tables, enums, and seed data.

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

## API Endpoints

All endpoints return a unified response format:
```json
{ "status": "success|fail", "data": [...], "message": "...", "pagination": {...} }
```

### CRUD (Generic — via `RestController` base class)

| Method | Endpoint                    | Description              |
|--------|-----------------------------|--------------------------|
| GET    | `/doctors`                  | List doctors (active)    |
| POST   | `/doctors`                  | Create doctor            |
| GET    | `/doctors/:id`              | Get doctor by ID/slug    |
| PUT    | `/doctors/:id`              | Update doctor            |
| DELETE | `/doctors/:id`              | Soft-delete (is_active=false) |
| GET    | `/shift-types`              | List shift types         |
| POST   | `/shift-types`              | Create shift type        |
| PUT    | `/shift-types/:id`          | Update shift type        |
| DELETE | `/shift-types/:id`          | Delete shift type        |
| GET    | `/doctor-leaves`            | List leaves              |
| POST   | `/doctor-leaves`            | Create leave             |
| PUT    | `/doctor-leaves/:id`        | Update leave             |
| DELETE | `/doctor-leaves/:id`        | Delete leave             |
| GET    | `/roster-months`            | List roster months       |
| POST   | `/roster-months`            | Create roster month      |
| PUT    | `/roster-months/:id`        | Update roster month      |
| DELETE | `/roster-months/:id`        | Delete roster month      |
| GET    | `/roster-assignments`       | List assignments         |
| POST   | `/roster-assignments`       | Create assignment        |
| PUT    | `/roster-assignments/:id`   | Update assignment        |
| DELETE | `/roster-assignments/:id`   | Delete assignment        |

### Roster Generation

| Method | Endpoint               | Description                                      |
|--------|------------------------|--------------------------------------------------|
| POST   | `/generate-roster`     | Generate monthly roster with constraint logic     |
| POST   | `/manual-assignment`   | Create/update assignment with validation          |
| POST   | `/validate-assignment` | Validate a proposed assignment                    |

#### POST `/generate-roster`

```json
{ "year": 2026, "month": 6, "overwriteManual": false }
```

Response:
```json
{
  "status": "success",
  "data": [{
    "rosterMonth": { "id": "...", "year": 2026, "month": 6, "generated_at": "..." },
    "assignmentsCreated": 155,
    "assignmentsSkipped": 0,
    "warnings": []
  }]
}
```

## Frontend Features

### Pages

| Route     | Page        | Description                                    |
|-----------|-------------|------------------------------------------------|
| `/`       | Dashboard   | Overview                                       |
| `/roster` | Roster      | Monthly roster grid with assign/drop controls  |
| `/doctors`| Doctors     | CRUD for doctor profiles + soft-delete         |
| `/leaves` | Leaves      | CRUD for leave records                         |
| `/shifts` | Shifts      | CRUD for shift type definitions                |

### UI Components

- **DataTable** — Sortable, paginated table with skeleton loading
- **DropdownMenu** — "..." action menu (Edit/Delete) on each row
- **AlertDialog** — Confirmation dialog before destructive actions
- **Skeleton** — Loading placeholders for all data tables
- **Toast** — Notification system for success/error feedback

### Doctors Page
- Create, edit, and soft-delete doctors
- Gender-based shift filtering (male doctors can't take OBGYN)
- Shift selection as toggle chips
- Weekly off selection

### Leaves Page
- Create, edit, and delete leave records
- Doctor and date selection
- Optional reason field
- Sorted by date

### Shifts Page
- Shift type management (Morning, Day, OBGYN, Afternoon, Night)
- Time configuration (starts_at, ends_at)
- Minimum doctor count per shift
- Female-only flag for OBGYN
- Retention priority ordering

### Roster Page
- Month/year navigation (defaults to June)
- Visual calendar grid with shift assignments
- Color-coded shifts per type
- Manual assignment via per-cell dropdown
- Warning indicators for constraint violations
- Manual override badges (amber ring + label)
- "Auto-generate" button with overwrite confirmation
- Two-day view for Moonsighting adjustment
- Reduced staffing fallback display

## Scheduling Algorithm

The algorithm iterates through each day of the month and assigns doctors to shifts. It processes doctors in priority order based on availability (fewest available days first).

### Constraint Priority

1. **Gender restrictions** — OBGYN shift restricted to female doctors only
2. **Weekly offs** — Mandatory, cannot be overridden
3. **Approved leave** — Blocks all shift assignment for that doctor
4. **One shift per day** — A doctor can work only one shift per day
5. **Maximum 6 shifts per week** — Hard cap per doctor per ISO week
6. **Rohan's fixed nights** — 4 nights/week (Mon–Thu), plus 1 Morning + 1 Afternoon/week
7. **Imran's restrictions** — Day Shift only (except max 2 nights/month)
8. **Post-night recovery** — Day after a night shift gets afternoon only or off (except Rohan)
9. **No consecutive nights** — Banned for everyone except Rohan
10. **Equal night distribution** — Nights split equally among Meera, Aditya, Priya, Kavya
11. **Equal OBGYN distribution** — OBGYN duty split equally among Meera, Priya, Kavya
12. **Leftover doctors** — Unassigned doctors placed on Day Shift

### Reduced Staffing Fallback

| Condition                  | Action                    | Shifts Kept               |
|---------------------------|---------------------------|---------------------------|
| 2 doctors unavailable     | Drop OBGYN Shift          | Morning, Day, Afternoon, Night |
| 3+ doctors unavailable    | Drop OBGYN + Day Shift    | Morning, Afternoon, Night |

If only 1 doctor is unavailable, all 5 shifts proceed normally. The algorithm checks actual doctor availability (active + not on leave + not weekly off) for each day.

## Manual Overrides

- **Visual indicator**: Manual overrides show with an amber ring + "Manual" label
- **Persistence**: Saved immediately to the database, survive page refresh
- **Re-generation**: Manual overrides are preserved when `overwriteManual=false` (default)
- **Overwrite mode**: When `overwriteManual=true`, all manual overrides are cleared and re-generated
- **Warning dialog**: If manual overrides exist, a confirmation dialog appears before re-generation

## Validation

When making manual edits, the system validates:

- Gender restrictions (OBGYN is female-only)
- Doctor eligibility for the selected shift type
- Weekly off conflicts
- Leave conflicts
- One shift per day rule
- Maximum shifts per week (6)
- Post-night recovery rule
- Consecutive night shift ban
- Maximum nights per month (Imran: 2)

Violations show as toast notifications (red for errors, amber for warnings).

## Backend Architecture

- **Fastify 5** — High-performance Node.js HTTP framework
- **Supabase JS Client v2** — Type-safe database access via PostgREST
- **Generic RestController** — Base class providing CRUD for all entities with:
  - Automatic pagination, sorting, search
  - Standardized success/fail response format
  - PostgreSQL error code handling (42501, 42P01, 23505, 23503)
- **Soft-delete** — Doctors use `is_active` flag instead of hard delete
- **Roster Generator Service** — Pure TypeScript constraint satisfaction engine

## Staff Names

All staff names are fictional per the original brief:

| Doctor              | Weekly Off |
|-------------------|-----------|
| Dr. Meera Kapoor  | Wednesday  |
| Dr. Rohan Khanna  | Friday     |
| Dr. Aditya Nair   | Thursday   |
| Dr. Priya Sharma  | Tuesday    |
| Dr. Imran Siddiqui| Sunday     |
| Dr. Kavya Menon   | Saturday   |
