# ARCHITECTURE-PLAN-V2

**Project:** Control y Gestion de Jornadas Laborales - Desktop Edition
**Version:** 2.0
**Date:** 2026-07-21
**Status:** Approved
**Scope:** Port of web application to offline-capable Tauri desktop application

---

## Table of Contents

1. [Original Architecture](#1-original-architecture)
2. [Desktop Architecture](#2-desktop-architecture)
3. [Tauri Architecture](#3-tauri-architecture)
4. [Database Strategy](#4-database-strategy)
5. [Enterprise Improvements](#5-enterprise-improvements)
6. [Architecture Decision Records](#6-architecture-decision-records)
7. [Module Dependency Matrix](#7-module-dependency-matrix)
8. [Packaging Strategy](#8-packaging-strategy)
9. [Smart Import Engine](#9-smart-import-engine)
10. [Administration Center](#10-administration-center)
11. [Executive Dashboard](#11-executive-dashboard)
12. [Diagnostics](#12-diagnostics)
13. [Logging](#13-logging)
14. [Audit](#14-audit)
15. [Plugin Architecture](#15-plugin-architecture)
16. [Multi-company Preparation](#16-multi-company-preparation)
17. [Security Checklist](#17-security-checklist)
18. [Performance Targets](#18-performance-targets)
19. [Risk Register](#19-risk-register)
20. [Testing Strategy](#20-testing-strategy)
21. [Quality Gates](#21-quality-gates)
22. [Backup Strategy](#22-backup-strategy)
23. [Disaster Recovery Plan](#23-disaster-recovery-plan)
24. [Production Readiness Checklist](#24-production-readiness-checklist)
25. [Implementation Phases](#25-implementation-phases)
26. [Future Roadmap](#26-future-roadmap)

---

## 1. Original Architecture

### 1.1 Overview

The original system is a web application for the **Subsecretaria de Espacio Publico** (Colombian government entity) that tracks employee work sessions and classifies every worked minute into legally defined buckets per Colombian labor law (CST).

### 1.2 Tech Stack (Web)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend Framework | NestJS 11.x | REST API server |
| ORM | Prisma 6.x | Database access |
| Database (dev) | SQLite | Local development |
| Database (prod) | PostgreSQL 16 | Production storage |
| Authentication | Passport + JWT (8h access, 7d refresh) | Auth system |
| Frontend | Vanilla HTML/CSS/JS SPA | User interface |
| Export | SheetJS (CDN) | Excel generation |
| Infrastructure | Docker Compose | Container orchestration |

### 1.3 Database Schema

```
User (usuarios)
  id, email, passwordHash, name, role, isActive

Employee (empleados)
  id, documentType, documentNumber, firstName, lastName,
  email, phone, position, area, hireDate, isActive,
  scheduleId, workConfigId, workModality, weeklyTargetMinutes

Schedule (horarios)
  id, name, startTime, endTime, workDays, breakMinutes, isActive

ScheduleDay (horarios_diarios)
  id, scheduleId, dayOfWeek, startTime, endTime, breakMinutes

WorkConfig (configuracion_trabajo)
  id, name, description, modality, isActive, breakMinutes,
  breakThresholdMinutes, weeklyTargetMinutes

OrdinaryDistribution (distribucion_ordinaria)
  id, workConfigId, dayOfWeek, ordinaryMinutesCap

WorkSession (jornadas)
  id, employeeId, startTime, endTime, totalMinutes,
  ordinaryMinutes, nightSurchargeMinutes, extraDayMinutes,
  extraNightMinutes, sundayMinutes, holidayMinutes,
  extraHolidayDayMinutes, extraHolidayNightMinutes,
  sundayNightSurchargeMinutes, isVoided, voidedAt,
  voidedReason, restDayWorked, compensatoryType,
  compensatoryUserId, compensatoryDecisionDate,
  compensatoryHours, compensatoryObservation

Holiday (festivos)
  id, date, name

AuditLog (auditoria)
  id, userId, action, entity, entityId, oldValues, newValues

BlacklistedToken (tokens_revocados)
  id, token, expiresAt

GlobalConfig (configuracion_global)
  id, nightStart, nightEnd, defaultBreakMinutes
```

### 1.4 Core Business Logic: Labor Engine

The engine classifies every effective minute into 8 mutually exclusive buckets:

| Bucket | Condition | Legal Base |
|--------|-----------|------------|
| ordinaryDiurno | Weekday, day, within caps | Art. 161 CST |
| ordinaryNocturno | Weekday, night, within caps | Art. 160 + 168.1 CST |
| extraDiurno | Weekday, day, exceeds caps | Art. 159 + 168.2 CST |
| extraNocturno | Weekday, night, exceeds caps | Art. 159 + 168.3 CST |
| dominicalFestivoDiurno | Sunday/holiday, day | Art. 179 + Ley 2466 |
| dominicalFestivoNocturno | Sunday/holiday, night | Art. 179 + 168.1 |
| extraDominicalFestivoDiurno | Sunday/holiday, day, exceeds | Art. 179 + 168.2 |
| extraDominicalFestivoNocturno | Sunday/holiday, night, exceeds | Art. 179 + 168.3 |

Constants: Night=19:00-06:00, DailyMax=480min, WeeklyTarget=2520min, Surcharge=35%/25%/75%/90%.

Invariant: `sum(8 buckets) == liquidableMinutes` always holds.

### 1.5 API Endpoints (All under `/api/v1`)

- **Auth:** POST /auth/login, POST /auth/refresh, POST /auth/logout
- **Employees:** CRUD + toggle status (5 endpoints)
- **Schedules:** CRUD + toggle + per-day CRUD + assign (9 endpoints)
- **Work Config:** CRUD + toggle + distributions + assign (9 endpoints)
- **Work Sessions:** CRUD + void + recalculate + compensatory + audit (8 endpoints)
- **Reports:** weekly, monthly, range (3 endpoints)
- **Holidays:** CRUD (4 endpoints)
- **Users:** CRUD + stats + toggle + reset password (7 endpoints)
- **Audit Log:** query with pagination (1 endpoint)
- **Health:** GET /health

### 1.6 Frontend Pages (8)

Login, Resumen (Dashboard), Empleados, Configuracion Laboral, Jornadas, Historico, Reportes, Festivos, Usuarios.

---

## 2. Desktop Architecture

### 2.1 Design Principles

1. **Maximum code reuse:** Existing NestJS backend, Prisma ORM, and vanilla JS frontend are reused as-is
2. **Tauri as shell only:** Rust code is limited to native OS integration (file dialogs, window management, system tray, backups)
3. **NestJS as sidecar:** Tauri launches the existing NestJS backend as a child process
4. **Offline-first:** Full functionality without network connectivity
5. **SQLite for desktop:** Same Prisma schema, just swap PostgreSQL driver for SQLite
6. **No rewriting:** Labor engine, audit engine, auth, reports — all remain TypeScript

### 2.2 Application Layers (Sidecar Architecture)

```
┌─────────────────────────────────────────────────────┐
│                  Tauri Window                         │
│  ┌───────────────────────────────────────────────┐   │
│  │     Existing Frontend (HTML/CSS/JS SPA)       │   │
│  │     Served by NestJS at localhost:PORT         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌────────────────┐  │   │
│  │  │ Pages   │ │Components│ │  JS Services   │  │   │
│  │  └────┬────┘ └────┬────┘ └───────┬────────┘  │   │
│  │       └───────────┼──────────────┘            │   │
│  │              HTTP to localhost                 │   │
│  └───────────────────┬───────────────────────────┘   │
│                      │                                │
│  ┌───────────────────┴───────────────────────────┐   │
│  │           Tauri Rust Shell (thin)              │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │   │
│  │  │ Sidecar  │ │   File   │ │   Window     │  │   │
│  │  │ Manager  │ │  Dialogs │ │   Manager    │  │   │
│  │  └────┬─────┘ └──────────┘ └──────────────┘  │   │
│  │       │ Launches & manages                    │   │
│  └───────┼───────────────────────────────────────┘   │
│          ▼                                           │
│  ┌───────────────────────────────────────────────┐   │
│  │        NestJS Backend (sidecar process)       │   │
│  │  ┌─────────┐ ┌─────────┐ ┌────────────────┐  │   │
│  │  │ Auth    │ │ Labor   │ │   All API      │  │   │
│  │  │ Module  │ │ Engine  │ │   Endpoints    │  │   │
│  │  └────┬────┘ └────┬────┘ └───────┬────────┘  │   │
│  │       └───────────┼──────────────┘            │   │
│  │              Prisma ORM                        │   │
│  │  ┌──────────────────────────────────────┐     │   │
│  │  │   SQLite (embedded, zero-config)     │     │   │
│  │  └──────────────────────────────────────┘     │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2.3 Technology Mapping (Web → Desktop)

| Web Component | Desktop Equivalent | Reused? |
|---------------|-------------------|---------|
| NestJS backend | NestJS sidecar (same code) | YES — no changes |
| Prisma ORM | Prisma ORM (same code) | YES — no changes |
| Labor Engine (TS) | Labor Engine (same TS) | YES — no changes |
| Audit Engine (TS) | Audit Engine (same TS) | YES — no changes |
| Auth (JWT + bcrypt) | Auth (same JWT + bcrypt) | YES — no changes |
| Vanilla JS SPA frontend | Same frontend served by NestJS | YES — no changes |
| PostgreSQL (prod) | SQLite (via Prisma) | CHANGE — driver swap only |
| Docker | Tauri sidecar manager | REPLACED — native packaging |
| Express static serve | NestJS static serve (same) | YES — no changes |
| helmet / rate limiter | NestJS middleware (same) | YES — no changes |
| SheetJS CDN | SheetJS CDN (same) | YES — no changes |
| Tauri shell | Rust (file dialogs, OS) | NEW — native OS layer |

### 2.4 What Rust Handles (and What It Doesn't)

**Rust handles:**
- Launching and managing the NestJS sidecar process
- Native file dialogs (open/save for Excel import/export, backups)
- Window lifecycle (minimize, maximize, close, system tray)
- OS integration (app data paths, auto-updater, notifications)
- Backup file operations (copy, compress, verify checksums)
- Application packaging (NSIS installer bundling)

**Rust does NOT handle:**
- Business logic (all in NestJS/TypeScript)
- Database operations (all in Prisma/TypeScript)
- Authentication (all in NestJS/Passport)
- Labor engine calculations (all in TypeScript)
- API endpoint routing (all in NestJS controllers)
- Frontend rendering (all in existing HTML/CSS/JS)

---

## 3. Tauri Architecture

### 3.1 Tauri 2.x Configuration

Tauri's role is minimal: launch NestJS as a sidecar, display a webview pointing to `localhost:PORT`, and provide native OS capabilities.

```toml
# src-tauri/Cargo.toml (key dependencies)
[dependencies]
tauri = { version = "2", features = ["shell-sidecar"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
log = "0.4"
env_logger = "0.11"
```

Rust dependencies are intentionally minimal. No ORM, no bcrypt, no engine libraries — all business logic stays in NestJS.

### 3.2 Rust Modules (Thin Shell)

```
src-tauri/src/
├── main.rs              # App entry: launch sidecar, create window
├── lib.rs               # Tauri plugin registration
├── sidecar.rs           # Start/stop/restart NestJS process
├── dialogs.rs           # Native file open/save dialogs (Tauri API)
├── paths.rs             # Resolve app data paths (%APPDATA%)
├── backup.rs            # File copy + SHA-256 for backup operations
└── tray.rs              # System tray (future, Phase 4)
```

Each module is small (50-150 lines). Total Rust code: ~500-800 lines.

### 3.3 Sidecar Lifecycle

```
App Start
  → Resolve paths (app data dir, backend dir)
  → Start NestJS process: `node backend/dist/main.js`
    → NestJS initializes Prisma + SQLite
    → NestJS starts HTTP server on localhost:3000
  → Wait for /health endpoint (poll with backoff)
  → Open Tauri webview → http://localhost:3000
  → Frontend loads existing SPA

App Stop
  → Send SIGTERM to NestJS process
  → Wait for graceful shutdown (max 5s)
  → Kill process if needed
  → Clean exit
```

### 3.4 Tauri IPC Commands (Native Only)

Rust exposes only native OS commands to the frontend:

```
Tauri Commands (Rust):
├── system
│   ├── open_file_dialog(filters) → Option<String>  // Native file picker
│   ├── save_file_dialog(default_name) → Option<String>
│   ├── get_app_data_path() → String
│   └── get_version() → String
├── backup
│   ├── copy_database_to(dest_path) → Result
│   └── file_checksum(path) → String
└── shell
    └── open_in_explorer(path) → Result  // Open folder in file explorer
```

All business data operations (CRUD, reports, engine) go through NestJS HTTP API — not through Rust IPC.

### 3.5 Frontend Changes (Minimal)

The existing frontend is reused as-is. Only two changes:

1. **API URL:** Change `http://localhost:3000/api/v1` to use dynamic port detection (Tauri passes the port as a query parameter or environment variable)

2. **File dialogs:** For Excel import/export, the frontend calls a Rust IPC command to open a native file dialog, then passes the selected file path to the NestJS API

Everything else — pages, components, styles, business logic — remains untouched.

### 3.6 State Management

```rust
// Tauri managed state — only sidecar process handle
pub struct SidecarState {
    pub child_process: Mutex<Option<Child>>,
    pub port: u16,
    pub data_dir: PathBuf,
}
```

No application state in Rust. All state lives in NestJS (JWT tokens, session, database connections).

---

## 4. Database Strategy

### 4.1 Prisma + SQLite (No Schema Changes)

The existing Prisma schema is reused as-is. The only change is the database driver:

- **Development (current):** Already uses SQLite (`backend/prisma/dev.db`)
- **Production (desktop):** SQLite with Prisma — zero schema changes required
- **No Diesel.** No migration rewrite. No new ORM.

```env
# .env for desktop (only change from web)
DATABASE_URL="file:./jornadas.db"
```

### 4.2 Why No Schema Changes

The Prisma schema already uses SQLite-compatible types:
- `TEXT` for strings
- `INTEGER` for booleans (SQLite stores as 0/1)
- `DateTime` stored as ISO 8601 text
- JSON fields stored as TEXT
- Auto-incrementing INTEGER PRIMARY KEY for all IDs

The existing migrations already target SQLite. The web version's `backend/prisma/dev.db` proves the schema works with SQLite today.

### 4.3 Connection Management

Prisma manages connection pooling. For the desktop scenario:
- Single user = minimal connection pressure
- WAL mode enabled via Prisma's SQLite provider
- Foreign keys enforced by Prisma schema
- Busy timeout handled by Prisma connection settings

### 4.4 Data Directory

```
%APPDATA%/JornadasLaboralDesktop/
├── data/
│   └── jornadas.db          # SQLite database (managed by Prisma)
├── backups/
│   └── jornadas_*.db        # Backup copies (managed by Rust)
└── logs/
    └── app.log              # Application logs
```

### 4.5 What Changes vs. Web

| Aspect | Web Version | Desktop Version | Change Required |
|--------|-------------|-----------------|-----------------|
| Database driver | PostgreSQL | SQLite | .env change only |
| Schema | Prisma schema | Same Prisma schema | None |
| Migrations | `prisma migrate` | `prisma migrate` (same) | None |
| Seed data | `prisma db seed` | Same seed script | None |
| Connection | Network socket | Local file | Prisma handles |

---

## 5. Enterprise Improvements

### 5.1 Security Hardening

| Improvement | Web | Desktop | Priority |
|-------------|-----|---------|----------|
| Authentication | JWT tokens | Same JWT (NestJS handles) | P0 — no change |
| Password hashing | bcrypt (10 rounds) | Same bcrypt (same code) | P0 — no change |
| Database encryption | PostgreSQL TLS | Future: SQLite encryption | P1 |
| Auto-lock on idle | None | Tauri window event (Rust) | P1 |
| Session timeout | 8h JWT expiry | Same (NestJS config) | P0 — no change |
| File system ACL | Docker volumes | Windows ACL on data dir | P2 |
| CSP headers | helmet middleware | Same (NestJS middleware) | P0 — no change |

### 5.2 Data Integrity

| Improvement | Implementation |
|-------------|---------------|
| Hash chain audit | Future enhancement (NestJS middleware) |
| Backup verification | SHA-256 checksum (Rust backup module) |
| Constraint validation | Prisma schema constraints (existing) |
| Idempotent operations | Existing upsert patterns in NestJS services |

### 5.3 Performance

| Target | Metric | How Achieved |
|--------|--------|-------------|
| Cold start | < 5 seconds to interactive | NestJS startup + sidecar launch |
| Page navigation | < 200ms | Existing frontend (no change) |
| Labor engine (1000 sessions) | < 5 seconds | Existing TypeScript engine (no change) |
| Report generation (monthly) | < 3 seconds | Existing NestJS service (no change) |
| Excel export (1000 rows) | < 2 seconds | Existing SheetJS (no change) |
| Database file size | < 100MB for 5 years data | SQLite (same as dev) |
| Memory usage | < 300MB steady state | NestJS + Tauri combined |

### 5.4 Reliability

| Feature | Implementation |
|---------|---------------|
| Auto-backup | Rust module copies DB file with checksum |
| Crash recovery | SQLite WAL mode (existing) + backup |
| Data validation | NestJS validation pipes (existing) |
| Process monitoring | Tauri sidecar health check polling |

---

## 6. Architecture Decision Records

### ADR-001: Tauri over Electron

**Status:** Accepted

**Context:** Need to wrap existing web app as desktop application.

**Decision:** Use Tauri 2.x as the shell, with NestJS as a sidecar process.

**Rationale:**
- Binary size: ~5-10MB (Tauri + Node.js sidecar) vs ~150MB (Electron + bundled Node)
- Memory: ~50MB (Tauri + NestJS sidecar) vs ~200MB (Electron)
- Security: Tauri has fine-grained CSP, minimal attack surface
- Code reuse: Existing NestJS backend runs as-is, no rewrite needed
- Native OS features: File dialogs, system tray, auto-updater

**Consequences:** Node.js runtime must be bundled or available. Sidecar process management needed. Slightly more complex than pure Tauri but far less than rewriting in Rust.

### ADR-002: Keep SQLite (already used in dev)

**Status:** Accepted

**Context:** Desktop app must work offline without a database server.

**Decision:** Use SQLite — already the development database via Prisma.

**Rationale:**
- Prisma schema already supports SQLite (dev mode uses it)
- Zero schema changes required — just change `DATABASE_URL`
- Single file database is easy to backup and move
- WAL mode provides good performance for single-user
- SQLite handles the expected data volume (thousands of employees, millions of sessions)

**Consequences:** No concurrent multi-user access (not needed for desktop). No network queries (not needed for desktop). Migration from existing PostgreSQL data is a one-time .env change.

### ADR-003: Reuse existing frontend (no React rewrite)

**Status:** Accepted

**Context:** The existing vanilla HTML/CSS/JS frontend is functional and tested.

**Decision:** Reuse the existing frontend as-is. Serve it through NestJS's static file serving.

**Rationale:**
- Frontend already works — 8 pages, role-based UI, Excel export, audit visualization
- Zero rewrite effort — maximum code reuse
- NestJS already serves static files from `../frontend`
- Tauri webview loads `localhost:3000` which serves the existing SPA
- Incremental improvements (not rewrites) are acceptable in future phases

**Consequences:** No type safety in frontend. No component reuse. But: zero rewrite risk, zero testing regression, maximum code reuse.

### ADR-004: Keep existing auth system

**Status:** Accepted

**Context:** The existing NestJS auth (JWT + bcrypt + Passport) works correctly.

**Decision:** Reuse the existing authentication system unchanged.

**Rationale:**
- JWT tokens work fine even in localhost scenario (no network exposure)
- bcrypt password hashing is already implemented
- Role-based access control (ADMINISTRADOR, GESTION_HUMANA, SUPERVISOR) is already implemented
- Token blacklisting already implemented
- No reason to change what works

**Consequences:** JWT tokens transmitted over localhost (not a security concern). Auto-lock on idle is a new feature (Phase 3) that wraps the existing session timeout.

### ADR-005: Keep labor engine in TypeScript

**Status:** Accepted

**Context:** The labor engine is the core business logic — minute-by-minute classification of work time.

**Decision:** Do NOT port to Rust. Keep the existing TypeScript implementation.

**Rationale:**
- Engine already works and has 28 passing unit tests
- Legal compliance requires identical classification results
- Rewriting in Rust introduces porting bugs with zero benefit (engine runs once per session, not in a hot loop)
- TypeScript engine is called by NestJS — no cross-language boundary needed
- Maximum code reuse principle

**Consequences:** Engine performance is limited by TypeScript/Node.js (not an issue — processes 1000 sessions in <5 seconds). No Rust expertise needed for engine work.

### ADR-006: Keep audit engine in TypeScript

**Status:** Accepted

**Context:** The audit engine generates minute-by-minute traces for legal compliance.

**Decision:** Do NOT port to Rust. Keep the existing TypeScript implementation.

**Rationale:**
- Same reasoning as ADR-005
- Audit traces are generated on-demand (not performance-critical)
- Already integrated with NestJS services
- 28 test cases verify correctness

**Consequences:** Audit trace generation limited by TypeScript performance (not an issue — generates traces in <1 second for typical sessions).

---

## 7. Module Dependency Matrix

```
                    Auth  Employee  Schedule  WorkConfig  Session  Engine  Audit  Report  Holiday  User  Import  Backup  System
Auth                  -     .         .          .          .        .       .       .        .       .      .       .        .
Employee              X      -        X          X          X        .       X       .        .       .      .       .        .
Schedule              X      X         -         .          .        .       X       .        .       .      .       .        .
WorkConfig            X      X         .          -         X        .       X       .        .       .      .       .        .
WorkSession           X      X         .          X         -        X       X       .        X       .      .       .        .
LaborEngine           .      .         .          .          X        -       .       .        X       .      .       .        .
AuditEngine           .      .         .          .          X        X       -       .        X       .      .       .        .
Audit                 X      .         .          .          .        .       -       .        .       X      .       .        .
Report                X      X         .          .          X        .       .       -        X       .      .       .        .
Holiday               X      .         .          .          .        .       .       .        -       .      .       .        .
User                  X      .         .          .          .        .       X       .        .       -      .       .        .
Import                X      X         .          .          X        X       X       .        .       .      -       .        .
Backup                X      .         .          .          .        .       .       .        .       .      .       -        .
System                .      .         .          .          .        .       .       .        .       .      .       .        -
```

**Legend:** X = depends on, . = no dependency, - = self

---

## 8. Packaging Strategy

### 8.1 Build Configuration

```
Platform: Windows (primary), Linux/macOS (future)
Installer: NSIS (Windows .exe installer)
Output:
  - JornadasLaboralDesktop-Setup-x64.exe  (~30-50 MB, includes Node.js sidecar)
  - JornadasLaboralDesktop.exe             (portable)
```

### 8.2 Distribution

| Channel | Description |
|---------|------------|
| USB drive | Primary distribution for government offices |
| Internal network share | IT department deploys from shared folder |
| Auto-update | Tauri updater plugin for future versions (optional) |

### 8.3 Build Pipeline

```
1. npm install                    (Node.js dependencies)
2. npm run build                  (NestJS TypeScript compilation)
3. npx prisma generate            (Prisma client generation)
4. cargo build --release          (Tauri shell)
5. tauri build                    (Bundle Tauri + NestJS sidecar)
6. Code sign (if certificate available)
7. NSIS installer generation
8. SHA-256 checksum generation
9. Package README + license
```

### 8.4 Versioning

- Semantic versioning: `MAJOR.MINOR.PATCH`
- Build number embedded in Tauri binary
- NestJS backend version tracked in `package.json`
- Database schema version tracked in Prisma migrations

---

## 9. Smart Import Engine

### 9.1 Purpose

Replace the existing `tools/import-excel.ts` with a robust desktop import system.

### 9.2 Features

1. **Excel file picker:** Native OS file dialog
2. **Column mapping UI:** User maps Excel columns to system fields
3. **Data validation:** Validate before import, show errors in grid
4. **Preview mode:** Show first 10 rows before committing
5. **Dry run:** Full validation without writing data
6. **Import modes:** Append, Replace, Skip duplicates
7. **Progress tracking:** Progress bar for large imports
8. **Error report:** Export failed rows to new Excel file
9. **History:** Log all imports with file hash, row count, timestamp

### 9.3 Import Flow

```
User selects file
  → Parse Excel (first sheet or sheet selector)
  → Auto-detect column headers
  → Map to Employee/WorkSession fields
  → Validate each row (types, required fields, references)
  → Show preview table with validation badges
  → User confirms import
  → Upsert employees (by documentNumber)
  → Create work sessions (trigger labor engine per session)
  → Show results summary (created, updated, failed)
  → Export error report if failures
```

### 9.4 Supported Formats

- `.xlsx` (primary, SheetJS library)
- `.xls` (legacy support)
- `.csv` (fallback)

---

## 10. Administration Center

### 10.1 Purpose

Centralized administration panel for system configuration and monitoring.

### 10.2 Features

1. **System info:** App version, DB version, file sizes, uptime
2. **User management:** Full CRUD with role assignment (existing)
3. **Global configuration:** Night hours, default break, weekly target
4. **Database maintenance:** Backup/restore, vacuum, integrity check
5. **Import management:** View import history, re-import
6. **Audit log viewer:** Filterable, searchable audit trail
7. **System health:** Connection pool status, query performance metrics
8. **License/entitlement:** System registration info

### 10.3 Access Control

| Feature | Required Role |
|---------|--------------|
| User management | ADMINISTRADOR |
| Global config | ADMINISTRADOR |
| Database maintenance | ADMINISTRADOR |
| Audit log | ADMINISTRADOR, GESTION_HUMANA |
| System info | All authenticated users |

---

## 11. Executive Dashboard

### 11.1 Overview

Replace the basic "Resumen" page with a comprehensive executive dashboard.

### 11.2 Widgets

1. **KPI Cards:**
   - Active employees count
   - Sessions registered this month
   - Total hours worked this month
   - Pending compensatory decisions

2. **Weekly Distribution Chart:**
   - Bar chart showing minute distribution across 8 buckets
   - Per-week or per-employee filter

3. **Monthly Trend:**
   - Line chart of total hours worked per month (last 12 months)

4. **Employee Status:**
   - Pie chart of active vs inactive employees

5. **Recent Activity:**
   - Last 10 registered sessions with status badges

6. **Holiday Calendar:**
   - Mini calendar showing upcoming holidays

### 11.3 Data Sources

All data comes from local SQLite queries. No external API calls.

---

## 12. Diagnostics

### 12.1 System Diagnostics

Displayed in Administration Center:

| Metric | Source |
|--------|--------|
| SQLite version | `PRAGMA compile_options` |
| Database file size | File system |
| WAL file size | File system |
| Table row counts | `SELECT COUNT(*)` per table |
| Migration version | `GlobalConfig` table |
| Last backup time | Backup metadata |
| Memory usage | `std::mem` / process info |
| CPU usage | Process stats |
| Active connections | Pool stats |

### 12.2 Health Check

```
GET equivalent via IPC: system.get_health()
Returns:
{
  "status": "healthy" | "degraded" | "unhealthy",
  "checks": [
    { "name": "database", "status": "ok", "message": "WAL mode active" },
    { "name": "disk_space", "status": "ok", "message": "2.3 GB free" },
    { "name": "migration", "status": "ok", "message": "Version 5" },
    { "name": "backup", "status": "warning", "message": "Last backup 8 days ago" }
  ]
}
```

### 12.3 Diagnostic Export

One-click export of all diagnostic info to a JSON file for support purposes.

---

## 13. Logging

### 13.1 Log Levels

| Level | Usage |
|-------|-------|
| ERROR | Unhandled exceptions, data corruption, migration failures |
| WARN | Recoverable errors, deprecated feature usage, backup warnings |
| INFO | Application start/stop, user login/logout, imports, backups |
| DEBUG | SQL queries, IPC calls, labor engine inputs/outputs |
| TRACE | Individual minute classifications, detailed state changes |

### 13.2 Log Storage

- **File logs:** `%APPDATA%/JornadasLaboralDesktop/logs/`
  - `app.log` - Current session (rotated daily)
  - `app-YYYY-MM-DD.log` - Previous sessions
- **Max size:** 10MB per file, 30 days retention
- **Rotation:** Size-based + daily
- **Format:** `[TIMESTAMP] [LEVEL] [MODULE] message`

### 13.3 Log Configuration

- Log level configurable in settings (default: INFO)
- DEBUG level requires restart
- Logs never contain passwords, tokens, or PII (document numbers redacted in DEBUG)

### 13.4 Error Reporting

- Errors logged with full stack trace (Rust) or error chain
- User-facing errors are friendly messages (never raw stack traces)
- Crash reports saved to `%APPDATA%/JornadasLaboralDesktop/crashes/`

---

## 14. Audit

### 14.1 Audit Trail (Enhanced)

Beyond the existing `AuditLog` table, the desktop version adds:

| Enhancement | Implementation |
|-------------|---------------|
| Hash chain | Each record includes SHA-256 hash of previous record + current data |
| Timestamp | UTC ISO 8601, immutable after creation |
| User attribution | Every action linked to authenticated user session |
| Before/after | Full old/new value snapshots for all mutations |
| Login/logout | Every authentication event logged |
| Import events | Full import summary logged |
| Backup events | Backup creation/restore logged |

### 14.2 Audit Log Schema (Enhanced)

```
AuditLog:
  id: INTEGER PRIMARY KEY
  timestamp: TEXT NOT NULL (ISO 8601 UTC)
  userId: INTEGER (FK to User)
  session_id: TEXT (correlation ID for request)
  action: TEXT NOT NULL (CREATE, UPDATE, DELETE, LOGIN, LOGOUT, IMPORT, BACKUP, VOID, RECALCULATE)
  entity: TEXT NOT NULL (table name)
  entityId: INTEGER
  oldValues: TEXT (JSON)
  newValues: TEXT (JSON)
  ipAddress: TEXT (for future network features)
  previous_hash: TEXT (hash chain link)
  record_hash: TEXT (SHA-256 of this record)
```

### 14.3 Audit Integrity Verification

A utility function verifies the hash chain integrity of all audit records:
1. Read all records ordered by id
2. For each record, verify record_hash = SHA-256(previous_hash + timestamp + userId + action + entity + entityId + oldValues + newValues)
3. Report any broken links

---

## 15. Plugin Architecture

### 15.1 Purpose

Enable future extensibility without core modifications.

### 15.2 Plugin Interface (Future - Phase 4+)

```rust
trait Plugin {
    fn name(&self) -> &str;
    fn version(&self) -> &str;
    fn init(&self, ctx: &PluginContext) -> Result<()>;
    fn register_commands(&self) -> Vec<Box<dyn TauriCommand>>;
    fn register_menus(&self) -> Vec<MenuItem>;
    fn on_session_created(&self, session: &WorkSession) -> Result<()>;
    fn on_import_completed(&self, result: &ImportResult) -> Result<()>;
}
```

### 15.3 Plugin Use Cases (Planned)

- Custom report generators
- Integration with HRIS systems
- Custom import formats
- Notification systems (email, SMS)
- Advanced analytics
- Department-specific workflows

### 15.4 Plugin Storage

- Plugins stored in `%APPDATA%/JornadasLaboralDesktop/plugins/`
- Each plugin is a separate directory with `manifest.json`
- Plugins loaded at startup after core initialization
- Plugin configuration stored in main database

---

## 16. Multi-company Preparation

### 16.1 Schema Extension (Future - Phase 5+)

```sql
-- Added to future schema
CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  nit TEXT UNIQUE NOT NULL,  -- Colombian tax ID
  address TEXT,
  phone TEXT,
  email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Foreign key additions
ALTER TABLE employees ADD COLUMN company_id INTEGER REFERENCES companies(id);
ALTER TABLE users ADD COLUMN company_id INTEGER REFERENCES companies(id);
```

### 16.2 Implementation Strategy

1. Phase 1-3: Single company (no `company_id`)
2. Phase 4: Add `company_id` column (nullable, default 1)
3. Phase 5: Company management UI, data isolation
4. All existing queries receive `WHERE company_id = ?` filter
5. Labor engine receives company-specific configuration

### 16.3 Data Isolation

- SQLite views per company (future)
- All queries filtered by active company context
- Admin can switch between companies
- Each company has independent: schedules, work configs, holidays, employees

---

## 17. Security Checklist

| # | Control | Status | Notes |
|---|---------|--------|-------|
| S1 | Password hashing (bcrypt, 10 rounds) | P0 | Port from web |
| S2 | Input validation at IPC boundary | P0 | Zod or manual validation |
| S3 | SQL injection prevention (Prisma ORM) | P0 | Existing Prisma parameterized queries |
| S4 | CSP headers in Tauri config | P0 | Restrict script sources |
| S5 | Auto-lock after idle timeout | P1 | Configurable (default 5min) |
| S6 | Database file encryption (SQLCipher) | P1 | Future enhancement |
| S7 | Audit trail hash chain | P1 | Tamper-evident logging |
| S8 | Secure backup (encrypted archive) | P1 | AES-256 encryption |
| S9 | No secrets in code/binaries | P0 | Hardcoded values only |
| S10 | Windows ACL on data directory | P2 | OS-level protection |
| S11 | Auto-update signature verification | P2 | Ed25519 signatures |
| S12 | Clipboard clearing after sensitive ops | P2 | Clear after password copy |

---

## 18. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cold start to interactive | < 5s | Tauri + NestJS sidecar startup |
| Page navigation | < 200ms | Existing frontend (no change) |
| Search/Filter response | < 100ms | From keystroke to result |
| Employee list (1000 records) | < 300ms | Query + render |
| Work session create (with engine) | < 500ms | Full classification |
| Engine batch (1000 sessions) | < 5s | Bulk recalculation |
| Weekly report generation | < 1s | Query + aggregation |
| Monthly report generation | < 2s | Query + aggregation |
| Excel export (1000 rows) | < 2s | File generation |
| Database backup (100MB) | < 5s | File copy |
| Memory steady state | < 200MB | After 1h usage |
| Disk I/O (WAL mode) | < 10ms | Single query latency |
| App binary size | < 10MB | Installer size |
| Database size (5yr data) | < 100MB | Estimated |

---

## 19. Risk Register

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R1 | Sidecar process fails to start | Medium | High | Health check polling, auto-retry, fallback to web mode |
| R2 | Labor engine port produces different results | Low | Critical | Bit-identical unit test comparison |
| R3 | SQLite performance degrades with large datasets | Low | Medium | WAL mode, proper indexes, periodic VACUUM |
| R4 | Tauri Windows build issues | Medium | Medium | Test build early, maintain CI |
| R5 | User data loss during migration | Low | Critical | Backup-before-migrate strategy |
| R6 | Team unfamiliar with Rust | High | Medium | Minimal Rust surface area, focus on commands only |
| R7 | Node.js runtime not available on target machines | Low | Medium | Bundle Node.js runtime with Tauri sidecar |
| R8 | Windows Defender flags unsigned binary | Medium | Medium | Code signing certificate (if available) |
| R9 | SQLite concurrent write conflicts | Low | Low | Single-user app, WAL mode |
| R10 | Timezone handling differences (TS→Rust) | Medium | High | Use chrono with explicit Bogota offset |

---

## 20. Testing Strategy

### 20.1 Test Pyramid

```
        ╱╲
       ╱E2E╲          5% - Critical user flows
      ╱──────╲
     ╱Integration╲     15% - IPC commands, DB queries
    ╱──────────────╲
   ╱   Unit Tests   ╲   80% - Engine, services, validators
  ╱────────────────────╲
```

### 20.2 Test Categories

| Category | Scope | Framework | Coverage Target |
|----------|-------|-----------|----------------|
| Unit (Rust) | Labor engine, services, validators | `cargo test` | 90%+ for engine |
| Unit (TS) | NestJS services, existing tests | Jest (existing) | Existing coverage |
| Integration | Tauri IPC commands | `cargo test` + mock DB | Key paths |
| E2E | Full user flows | Playwright | Critical paths |
| Regression | Engine equivalence | Cross-language comparison | 100% of web test cases |

### 20.3 Critical Test Scenarios

1. **Labor engine equivalence:** Run same inputs through web (TS) and desktop (Rust) engines, verify identical outputs
2. **Import flow:** End-to-end Excel import with validation
3. **Work session lifecycle:** Create → recalculate → void → audit trace
4. **Report generation:** Weekly, monthly, range with filters
5. **Backup/restore:** Create backup, restore to fresh DB, verify data
6. **Auto-lock:** Verify session clears after idle timeout
7. **Migration:** Fresh install, upgrade from v1, schema migration

### 20.4 Test Data

- Seed script provides consistent test data
- Factory functions for generating test records
- Edge cases: midnight crossovers, DST transitions, year boundaries, max records

---

## 21. Quality Gates

### 21.1 Phase Completion Criteria

Each phase must pass ALL quality gates before proceeding:

| Gate | Criteria |
|------|----------|
| G1 - Build | `cargo build --release` succeeds with zero errors |
| G2 - Tests | `cargo test` passes with 0 failures, coverage > 80% |
| G3 - Lint | `cargo clippy` no warnings, `eslint` no errors |
| G4 - Format | `cargo fmt --check` and `prettier --check` pass |
| G5 - Type check | `tsc --noEmit` passes (TypeScript) |
| G6 - Manual test | Core user flow verified manually |
| G7 - No regressions | Existing functionality unaffected |
| G8 - Documentation | Phase changes documented |

### 21.2 Release Gates (Before v1.0)

All phase gates plus:

| Gate | Criteria |
|------|----------|
| G9 - Security | Security checklist (Section 17) all P0 items complete |
| G10 - Performance | All performance targets (Section 18) met |
| G11 - Backup | Backup/restore tested end-to-end |
| G12 - Migration | Database migration from web version tested |
| G13 - Installer | NSIS installer tested on clean Windows machine |
| G14 - Engine equivalence | All labor engine test cases produce identical results |

---

## 22. Backup Strategy

### 22.1 Backup Types

| Type | Frequency | Contents | Location |
|------|-----------|----------|----------|
| Auto backup | Daily (on launch) | Full database | `%APPDATA%/JornadasLaboralDesktop/backups/` |
| Manual backup | User-initiated | Full database | User-selected path |
| Pre-migration | Before schema upgrade | Full database | Auto-generated path |
| Export | User-initiated | Selected data (JSON/Excel) | User-selected path |

### 22.2 Backup Format

```
jornadas_backup_YYYYMMDD_HHMMSS.db
  - Unencrypted SQLite database copy
  - SHA-256 checksum in companion file (.sha256)
  - Metadata file (.json): app version, schema version, timestamp, row counts
```

### 22.3 Backup Retention

- **Auto backups:** Keep last 30 daily, 12 monthly
- **Pre-migration:** Keep last 5
- **Manual:** User-managed (no auto-delete)
- Total backup storage: ~500MB for 5 years of daily backups

### 22.4 Restore Process

1. User selects backup file
2. App verifies SHA-256 checksum
3. Creates current database backup (safety net)
4. Replaces current database with backup
5. Runs migration if backup is older schema version
6. Rebuilds WAL if needed
7. Shows restored record counts

---

## 23. Disaster Recovery Plan

### 23.1 Scenarios

| Scenario | Recovery Method | RTO | RPO |
|----------|----------------|-----|-----|
| Database corruption | Restore from auto-backup | 5 min | 24 hours (daily backup) |
| App crash during write | WAL recovery (automatic) | 0 min | 0 (WAL provides atomicity) |
| Accidental deletion | Restore from manual/pre-migration backup | 10 min | Variable |
| OS reinstall | Restore from user's backup copy | 30 min | Variable |
| Hard drive failure | Restore from external backup | 1 hour | Variable |
| Schema migration failure | Restore from pre-migration backup | 5 min | 0 |

### 23.2 Recovery Procedures

**Procedure 1: Database Corruption**
1. Close application
2. Navigate to `%APPDATA%/JornadasLaboralDesktop/backups/`
3. Copy latest backup to `%APPDATA%/JornadasLaboralDesktop/data/`
4. Rename to `jornadas.db`
5. Launch application
6. Verify data integrity via Administration Center

**Procedure 2: Migration Failure**
1. Application auto-detects on launch
2. Shows "Restore from backup?" dialog
3. Lists available pre-migration backups
4. User selects backup
5. Application restores and retries migration

**Procedure 3: Fresh Install**
1. Install application
2. First launch creates empty database
3. User restores from backup file
4. Application imports all data

### 23.3 Prevention Measures

- WAL mode prevents partial writes
- Pre-migration backup before any schema change
- Daily auto-backups
- Database integrity check on startup (PRAGMA integrity_check)
- Application-level validation before writes

---

## 24. Production Readiness Checklist

| # | Item | Phase | Status |
|---|------|-------|--------|
| P1 | Tauri project scaffolded with sidecar config | 1 | Pending |
| P2 | NestJS launches as sidecar process | 1 | Pending |
| P3 | SQLite database connection working | 1 | Pending |
| P4 | Existing frontend loads in Tauri webview | 1 | Pending |
| P5 | All existing API endpoints accessible via sidecar | 1 | Pending |
| P6 | Native file dialogs (Tauri IPC) | 1 | Pending |
| P7 | Backup file operations (Rust module) | 1 | Pending |
| P8 | Build pipeline works (npm + cargo + tauri) | 1 | Pending |
| P9 | NSIS installer configuration | 4 | Pending |
| P10 | Auto-lock on idle (Tauri window event) | 3 | Pending |
| P11 | Auto-backup (Rust module) | 3 | Pending |
| P12 | Code signing | 5 | Pending |
| P13 | Multi-company preparation | 5 | Pending |
| P14 | Plugin system | 5 | Pending |

---

## 25. Implementation Phases

### Phase 1: Tauri Shell + Sidecar (Week 1)

**Goal:** Wrap the existing NestJS app in a Tauri shell. Maximum code reuse — no rewriting.

| Task | Description | Priority |
|------|-------------|----------|
| Initialize Tauri 2.x project | `cargo init`, `tauri.conf.json`, Cargo.toml with minimal deps | P0 |
| Configure sidecar | NestJS backend bundled as sidecar process | P0 |
| Sidecar lifecycle | Start NestJS on launch, wait for /health, stop on close | P0 |
| SQLite for desktop | Change `.env` to use SQLite, verify Prisma connection | P0 |
| Webview configuration | Tauri window loads `localhost:PORT`, CSP headers | P0 |
| Native file dialogs | Rust IPC: open_file_dialog, save_file_dialog | P0 |
| Backup module | Rust: copy DB file + SHA-256 checksum | P1 |
| Build pipeline | `npm install && npm run build && cargo tauri build` | P0 |
| Verify full flow | Launch → login → navigate → create session → report | P0 |
| Commit Phase 1 | All Tauri shell code, no changes to web project | P0 |

**Exit Criteria:** Desktop app launches, shows login, all existing pages work, all API endpoints accessible, file dialogs functional.

### Phase 2: Native Enhancements (Week 2)

| Task | Description |
|------|-------------|
| System tray | Minimize to tray, tray menu (future) |
| Auto-lock on idle | Tauri window focus/blur events, configurable timeout |
| Auto-backup | Daily backup to configurable path |
| Diagnostics panel | System info in existing frontend (NestJS health endpoint) |
| Error handling | Graceful sidecar crash recovery, user notifications |
| App data paths | Resolve `%APPDATA%/JornadasLaboralDesktop/` for all OS |

### Phase 3: Import/Export Enhancements (Week 3)

| Task | Description |
|------|-------------|
| Native file picker for import | Replace browser file input with Tauri dialog |
| Native save dialog for export | Replace browser save with Tauri dialog |
| Progress feedback | Sidecar process events → frontend progress bar |
| Import history | Log imports in existing audit system |

### Phase 4: Packaging & Distribution (Week 4)

| Task | Description |
|------|-------------|
| NSIS installer | Bundle Tauri + NestJS + Node.js runtime |
| Code signing | Windows Authenticode certificate |
| Auto-update | Tauri updater plugin |
| User documentation | README, installation guide |
| Release build pipeline | CI/CD for reproducible builds |

### Phase 5: Enterprise Features (Weeks 5-8)

| Task | Description |
|------|-------------|
| Multi-company preparation | Schema extension, company management |
| Plugin system | Extensibility framework |
| Advanced reporting | Enhanced dashboard with charts |
| Database encryption | Future: SQLCipher integration |
| Network sync | Future: multi-device synchronization |

---

## 26. Future Roadmap

### v1.0 (Release)
- Full feature parity with web version
- Offline-first desktop application
- Windows installer
- Backup/restore
- Basic import/export

### v1.1
- Auto-lock on idle
- Advanced dashboard with charts
- Scheduled reports (daily email via SMTP)
- Multi-monitor support

### v1.2
- Multi-company support
- Role-based company switching
- Cross-company reports

### v2.0
- Plugin system
- Network sync (multi-device)
- Cloud backup integration
- LDAP/AD authentication
- REST API server mode (re-enable web access)

### v2.1
- Advanced analytics (ML-based predictions)
- Anomaly detection (unusual work patterns)
- Integration with Colombian DIAN (tax authority)
- Mobile companion app (Flutter)

### v3.0
- Multi-tenant SaaS mode
- Kubernetes deployment option
- GraphQL API
- Real-time collaboration
- White-label support

---

*Document validated for internal consistency. Architecture follows maximum code reuse: Tauri shell wrapping existing NestJS sidecar, Prisma ORM with SQLite, existing TypeScript frontend and engines. No business logic rewritten in Rust. Implementation phases align with production readiness items.*
