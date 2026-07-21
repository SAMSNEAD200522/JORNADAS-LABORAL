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

1. **Offline-first:** Full functionality without network connectivity
2. **Zero-config:** SQLite embedded, no server setup required
3. **Single binary:** One `.exe` file for Windows distribution
4. **Data sovereignty:** All data stays on the local machine
5. **Backward compatible:** Same labor engine logic as web version
6. **Graceful degradation:** Online features (sync, backup upload) optional

### 2.2 Application Layers

```
┌─────────────────────────────────────────────┐
│              Tauri Window                    │
│  ┌───────────────────────────────────────┐  │
│  │         Frontend (Vite + TS)          │  │
│  │  ┌─────────┐ ┌─────────┐ ┌────────┐  │  │
│  │  │ Pages   │ │Components│ │ Services│  │  │
│  │  └────┬────┘ └────┬────┘ └───┬────┘  │  │
│  │       └───────────┼──────────┘        │  │
│  │              Tauri IPC Bridge          │  │
│  └───────────────────┬───────────────────┘  │
├──────────────────────┼──────────────────────┤
│              Tauri Rust Backend             │
│  ┌───────────────────┼───────────────────┐  │
│  │         Command Layer (IPC)           │  │
│  │  ┌──────┐ ┌──────┐ ┌──────────────┐  │  │
│  │  │ Auth │ │ Data │ │   Engine     │  │  │
│  │  │ Cmds │ │ Cmds │ │   Commands   │  │  │
│  │  └──┬───┘ └──┬───┘ └──────┬───────┘  │  │
│  │     └────────┼─────────────┘          │  │
│  │         Service Layer                 │  │
│  │  ┌──────┐ ┌──────┐ ┌──────────────┐  │  │
│  │  │ Auth │ │ Data │ │   Engine     │  │  │
│  │  │ Svc  │ │ Svc  │ │   Service    │  │  │
│  │  └──┬───┘ └──┬───┘ └──────┬───────┘  │  │
│  │     └────────┼─────────────┘          │  │
│  │         Data Access Layer             │  │
│  │  ┌──────────────────────────────┐     │  │
│  │  │   Diesel ORM + SQLite        │     │  │
│  │  └──────────────────────────────┘     │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 2.3 Technology Mapping (Web → Desktop)

| Web Component | Desktop Equivalent | Rationale |
|---------------|-------------------|-----------|
| NestJS (Node.js) | Tauri Rust commands | Native performance, smaller binary |
| Prisma ORM | Diesel ORM | Rust-native, compile-time query checks |
| PostgreSQL | SQLite (embedded) | Zero-config, single-file database |
| Vanilla JS SPA | Vite + TypeScript + React | Type safety, component reuse |
| JWT auth | Local session + PIN | No network, no tokens needed |
| Express static serve | Tauri asset protocol | Built-in asset serving |
| Docker | Tauri bundler | Native Windows installer |
| SheetJS CDN | xlsx Rust crate or TS lib | Embedded export capability |
| helmet | Tauri CSP config | Native content security |
| Rate limiter | Not needed | No network exposure |

---

## 3. Tauri Architecture

### 3.1 Tauri 2.x Configuration

```toml
# src-tauri/Cargo.toml (key dependencies)
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
diesel = { version = "2", features = ["sqlite", "r2d2"] }
chrono = { version = "0.4", features = ["serde"] }
bcrypt = "0.15"
uuid = { version = "1", features = ["v4"] }
xlsxwriter = "0.3"
log = "0.4"
env_logger = "0.11"
```

### 3.2 IPC Command Layer

All frontend-to-backend communication goes through Tauri's IPC bridge using `#[tauri::command]` functions:

```
Commands (grouped by domain):
├── auth
│   ├── login(email, password) → AuthResult
│   ├── logout() → void
│   ├── get_current_user() → Option<User>
│   └── change_password(old, new) → void
├── employees
│   ├── create_employee(dto) → Employee
│   ├── list_employees(query) → PaginatedResult<Employee>
│   ├── get_employee(id) → Employee
│   ├── update_employee(id, dto) → Employee
│   └── toggle_employee_status(id) → Employee
├── schedules
│   ├── create_schedule(dto) → Schedule
│   ├── list_schedules() → Vec<Schedule>
│   ├── get_schedule(id) → Schedule
│   ├── update_schedule(id, dto) → Schedule
│   └── ... (CRUD + day management)
├── work_config
│   ├── create_config(dto) → WorkConfig
│   ├── list_configs() → Vec<WorkConfig>
│   └── ... (CRUD + distributions)
├── work_sessions
│   ├── create_session(dto) → WorkSession (triggers engine)
│   ├── list_sessions(query) → PaginatedResult<WorkSession>
│   ├── update_session(id, dto) → WorkSession (re-triggers)
│   ├── void_session(id, reason) → WorkSession
│   ├── recalculate_session(id) → WorkSession
│   ├── set_compensatory(id, decision) → WorkSession
│   └── generate_audit_trace(id) → AuditTrace
├── reports
│   ├── weekly_report(year, week, filters) → Report
│   ├── monthly_report(year, month, filters) → Report
│   └── range_report(start, end, filters) → Report
├── holidays
│   ├── create_holiday(dto) → Holiday
│   ├── list_holidays() → Vec<Holiday>
│   └── delete_holiday(id) → void
├── users
│   ├── create_user(dto) → User
│   ├── list_users(query) → PaginatedResult<User>
│   └── ... (CRUD + password reset)
├── audit
│   └── list_audit_logs(query) → PaginatedResult<AuditLog>
├── import
│   ├── import_excel(file_path) → ImportResult
│   └── validate_import(file_path) → ValidationResult
├── backup
│   ├── create_backup(path) → BackupResult
│   ├── restore_backup(path) → void
│   └── list_backups() → Vec<BackupInfo>
└── system
    ├── get_health() → SystemHealth
    ├── get_diagnostics() → Diagnostics
    └── get_version() → String
```

### 3.3 State Management

```rust
// Tauri managed state
pub struct AppState {
    pub db_pool: SqlitePool,           // Connection pool
    pub config: AppConfig,              // Runtime configuration
    pub current_session: Mutex<Option<UserSession>>,  // Active user
}
```

### 3.4 Frontend Architecture (Tauri + Vite + React)

```
src/
├── main.tsx                    # React entry point
├── App.tsx                     # Root component + router
├── tauri/                      # Tauri API bindings
│   └── commands.ts             # Typed IPC wrapper functions
├── contexts/
│   ├── AuthContext.tsx          # Auth state + provider
│   └── AppContext.tsx           # Global app state
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── EmployeesPage.tsx
│   ├── SchedulesPage.tsx
│   ├── WorkConfigPage.tsx
│   ├── WorkSessionsPage.tsx
│   ├── HistoryPage.tsx
│   ├── ReportsPage.tsx
│   ├── HolidaysPage.tsx
│   └── UsersPage.tsx
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── PageContainer.tsx
│   ├── common/
│   │   ├── DataTable.tsx
│   │   ├── SearchInput.tsx
│   │   ├── Pagination.tsx
│   │   ├── Modal.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── Badge.tsx
│   │   └── Loader.tsx
│   ├── employees/
│   │   ├── EmployeeForm.tsx
│   │   └── EmployeeTable.tsx
│   ├── work-sessions/
│   │   ├── SessionForm.tsx
│   │   ├── SessionTable.tsx
│   │   ├── VoidDialog.tsx
│   │   ├── CompensatoryDialog.tsx
│   │   └── AuditTraceViewer.tsx
│   ├── reports/
│   │   ├── ReportFilters.tsx
│   │   └── ReportTable.tsx
│   └── dashboard/
│       ├── StatCard.tsx
│       └── RecentActivity.tsx
├── hooks/
│   ├── useDebounce.ts
│   ├── usePagination.ts
│   └── useExport.ts
├── lib/
│   ├── constants.ts
│   ├── types.ts                # Shared TypeScript types
│   └── utils.ts
└── styles/
    └── globals.css
```

---

## 4. Database Strategy

### 4.1 SQLite Schema (Diesel Migrations)

The schema mirrors the original PostgreSQL/Prisma schema but adapted for SQLite:

- All `TEXT` fields remain `TEXT`
- JSON fields (`oldValues`, `newValues`) stored as `TEXT` (JSON strings)
- `BOOLEAN` stored as `INTEGER` (0/1)
- `DATETIME` stored as `TEXT` (ISO 8601)
- Enums stored as `TEXT` with CHECK constraints where applicable
- Auto-incrementing `INTEGER PRIMARY KEY` for all IDs

### 4.2 Migration Strategy

1. Diesel manages schema migrations via `diesel migration run`
2. Initial migration creates all tables, indexes, and seed data
3. Seed data: 3 users, 2 workConfigs, 7 distributions each, 3 employees, 18 Colombian holidays (2026)
4. Migrations run automatically on application startup
5. Backup of database created before any migration runs

### 4.3 Connection Management

```rust
// Connection pool configuration
SqliteConnectionManager::file("jornadas.db")
    .with_flags(SQLITE_OPEN_READ_WRITE | SQLITE_OPEN_CREATE)
    .with_init("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")
```

- WAL mode for concurrent reads
- Foreign keys enforced
- Busy timeout prevents lock contention
- Connection pool size: 5 (adequate for single-user desktop)

### 4.4 Data Access Pattern

```
Command Layer → Service Layer → Repository (Diesel) → SQLite
```

Each domain module follows:
- `commands.rs` - Tauri IPC commands (thin, validation only)
- `service.rs` - Business logic (labor engine integration, rules)
- `repository.rs` - Database queries (Diesel)
- `models.rs` - Diesel queryable structs
- `dto.rs` - Input/output serialization structs

---

## 5. Enterprise Improvements

### 5.1 Security Hardening

| Improvement | Web | Desktop | Priority |
|-------------|-----|---------|----------|
| PIN/Password lock | JWT tokens | Local bcrypt PIN | P0 |
| Database encryption | PostgreSQL TLS | SQLCipher (AES-256) | P1 |
| Auto-lock on idle | None | Screen lock after 5min | P1 |
| Session timeout | 8h JWT | Configurable auto-lock | P1 |
| File system ACL | Docker volumes | Windows ACL on DB file | P2 |
| Audit trail integrity | Regular table | Append-only + hash chain | P2 |

### 5.2 Data Integrity

| Improvement | Implementation |
|-------------|---------------|
| Hash chain audit | Each AuditLog record hashes previous, creating tamper-evident chain |
| Backup verification | SHA-256 checksum on backup creation/restore |
| Constraint validation | Application-level + DB-level constraints |
| Idempotent operations | All writes are idempotent (upsert patterns) |

### 5.3 Performance

| Target | Metric |
|--------|--------|
| Cold start | < 2 seconds to interactive |
| Page navigation | < 200ms |
| Labor engine (1000 sessions) | < 5 seconds |
| Report generation (monthly) | < 3 seconds |
| Excel export (1000 rows) | < 2 seconds |
| Database file size | < 100MB for 5 years data |
| Memory usage | < 200MB steady state |

### 5.4 Reliability

| Feature | Implementation |
|---------|---------------|
| Auto-backup | Daily backup to configurable path |
| Crash recovery | WAL mode + backup-before-migration |
| Data validation | Input validation at IPC boundary |
| Error boundaries | React error boundary + Rust panic handler |

---

## 6. Architecture Decision Records

### ADR-001: Tauri over Electron

**Status:** Accepted

**Context:** Need to port web app to desktop.

**Decision:** Use Tauri 2.x with Rust backend.

**Rationale:**
- Binary size: ~5MB (Tauri) vs ~150MB (Electron)
- Memory: ~30MB (Tauri) vs ~150MB (Electron)
- Security: Tauri has fine-grained IPC, no Node.js attack surface
- Performance: Rust backend is faster for labor engine calculations
- Native SQLite: Diesel ORM with compile-time query checking

**Consequences:** Team must learn Rust basics. Smaller ecosystem than Node.js. Build tooling less mature on Windows.

### ADR-002: SQLite over PostgreSQL

**Status:** Accepted

**Context:** Desktop app must work offline without server.

**Decision:** Embed SQLite via Diesel ORM.

**Rationale:**
- Zero configuration required
- Single file database is easy to backup/move
- WAL mode provides good concurrency for single-user
- Diesel provides type-safe queries at compile time
- SQLite handles the expected data volume (thousands of employees, millions of sessions) without issue

**Consequences:** No concurrent multi-user access. No network queries. Migration from existing PostgreSQL data required.

### ADR-003: React + TypeScript over Vanilla JS

**Status:** Accepted

**Context:** Need structured frontend for complex UI.

**Decision:** React 18 with TypeScript and Vite.

**Rationale:**
- Type safety catches errors at compile time
- Component architecture maps well to Tauri's page structure
- Rich ecosystem for data tables, forms, charts
- Vite provides fast dev server and build
- React's state management handles complex UI state (pagination, filters, modals)

**Consequences:** Larger bundle than vanilla JS (~50KB gzipped). Build step required.

### ADR-004: Session-based auth instead of JWT

**Status:** Accepted

**Context:** Desktop app has no network, JWT blacklisting is unnecessary.

**Decision:** In-memory session with bcrypt password verification.

**Rationale:**
- No network = no token transmission = no JWT needed
- Session stored in Tauri managed state (Rust `Mutex<Option<UserSession>>`)
- Password verified on login via bcrypt
- Auto-lock clears session after configurable idle timeout
- Simpler than JWT refresh/blacklist flow

**Consequences:** User must re-enter password after app restart. No "remember me" without additional persistence.

### ADR-005: Keep labor engine logic identical

**Status:** Accepted

**Context:** Must produce same classification results as web version.

**Decision:** Port labor engine minute-by-minute algorithm from TypeScript to Rust, maintaining identical logic.

**Rationale:**
- Legal compliance requires identical classification
- Rust performance benefits engine (1000+ sessions)
- Unit tests from web version can be adapted to verify equivalence
- Constants, timezone handling (Bogota UTC-5), and bucket logic must match exactly

**Consequences:** Engine cannot be "improved" during port without explicit approval. Changes must be tracked separately.

### ADR-006: React over Vue/Svelte

**Status:** Accepted

**Context:** Need component framework for frontend.

**Decision:** React 18 with TypeScript.

**Rationale:**
- Largest ecosystem for components (data tables, modals, forms)
- TypeScript integration is mature
- Team familiarity
- Good Tauri community support

**Consequences:** Larger initial bundle than Svelte. More boilerplate than Vue.

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
  - JornadasLaboralDesktop-Setup-x64.exe  (~5-8 MB)
  - JornadasLaboralDesktop.exe             (portable, ~5 MB)
```

### 8.2 Distribution

| Channel | Description |
|---------|------------|
| USB drive | Primary distribution for government offices |
| Internal network share | IT department deploys from shared folder |
| Auto-update | Tauri updater plugin for future versions (optional) |

### 8.3 Build Pipeline

```
1. cargo build --release        (Rust backend)
2. vite build                   (React frontend)
3. tauri build                  (Bundle everything)
4. Code sign (if certificate available)
5. NSIS installer generation
6. SHA-256 checksum generation
7. Package README + license
```

### 8.4 Versioning

- Semantic versioning: `MAJOR.MINOR.PATCH`
- Build number embedded in binary
- Database schema version tracked in `GlobalConfig` table
- Migration compatibility: app must handle DB versions N-1 through N

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
| S3 | SQL injection prevention (Diesel ORM) | P0 | Compile-time checked queries |
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
| Cold start to interactive | < 2s | Time from launch to first paint |
| Page navigation | < 200ms | React route transition |
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
| R1 | Diesel migration from Prisma schema introduces bugs | Medium | High | Port schema carefully, run equivalent tests |
| R2 | Labor engine port produces different results | Low | Critical | Bit-identical unit test comparison |
| R3 | SQLite performance degrades with large datasets | Low | Medium | WAL mode, proper indexes, periodic VACUUM |
| R4 | Tauri Windows build issues | Medium | Medium | Test build early, maintain CI |
| R5 | User data loss during migration | Low | Critical | Backup-before-migrate strategy |
| R6 | Team unfamiliar with Rust | High | Medium | Minimal Rust surface area, focus on commands only |
| R7 | React bundle too large for Tauri | Low | Low | Code splitting, lazy loading |
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
| Unit (TS) | React components, hooks, utils | Vitest | 80%+ |
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
| P1 | Core labor engine ported and tested | 1 | Pending |
| P2 | Employee CRUD (backend services + IPC) | 1 | Pending |
| P2b | Employee CRUD (UI page) | 2 | Pending |
| P3 | Schedule CRUD (backend services + IPC) | 1 | Pending |
| P3b | Schedule CRUD (UI page) | 2 | Pending |
| P4 | Work config CRUD (backend services + IPC) | 1 | Pending |
| P4b | Work config CRUD (UI page) | 2 | Pending |
| P5 | Work session CRUD with engine (backend services + IPC) | 1 | Pending |
| P5b | Work session CRUD (UI page) | 2 | Pending |
| P6 | Authentication (PIN/password) | 1 | Pending |
| P7 | SQLite database with migrations | 1 | Pending |
| P8 | Basic UI shell (layout, navigation) | 1 | Pending |
| P9 | Holiday management | 2 | Pending |
| P10 | Reports (weekly, monthly, range) | 2 | Pending |
| P11 | User management | 2 | Pending |
| P12 | Audit log viewer | 2 | Pending |
| P13 | Excel import | 2 | Pending |
| P14 | Excel export | 2 | Pending |
| P15 | Dashboard with widgets | 3 | Pending |
| P16 | Backup/restore | 3 | Pending |
| P17 | Diagnostics | 3 | Pending |
| P18 | History page | 3 | Pending |
| P19 | NSIS installer | 4 | Pending |
| P20 | Auto-lock on idle | 4 | Pending |
| P21 | Auto-backup | 4 | Pending |
| P22 | Code signing | 5 | Pending |
| P23 | Multi-company prep | 5 | Pending |
| P24 | Plugin system | 5 | Pending |

---

## 25. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Scaffold the Tauri project, port the labor engine, implement core data models.

| Task | Files | Priority |
|------|-------|----------|
| Initialize Tauri 2.x project (with CSP in tauri.conf.json) | `JornadasLaboralDesktop/src-tauri/` | P0 |
| Configure Vite + React + TypeScript | `JornadasLaboralDesktop/package.json`, `vite.config.ts` | P0 |
| Set up Diesel with SQLite | `src-tauri/migrations/`, `src-tauri/src/db/` | P0 |
| Create all database migrations | Diesel migration files | P0 |
| Port schema (all 10 models) | `src-tauri/src/models/` | P0 |
| Port constants | `src-tauri/src/engine/constants.rs` | P0 |
| Port labor engine (Rust) | `src-tauri/src/engine/service.rs` | P0 |
| Port audit engine | `src-tauri/src/engine/audit.rs` | P0 |
| Implement auth service | `src-tauri/src/services/auth.rs` | P0 |
| Implement all IPC commands | `src-tauri/src/commands/` | P0 |
| Create React app shell | `src/App.tsx`, layout components | P0 |
| Create login page | `src/pages/LoginPage.tsx` | P0 |
| Create basic sidebar navigation | `src/components/layout/Sidebar.tsx` | P0 |
| Seed data script | `src-tauri/src/db/seed.rs` | P1 |
| Unit tests for engine | `src-tauri/src/engine/tests/` | P0 |
| Verify builds pass | `cargo build`, `npm run build` | P0 |
| Run all tests | `cargo test`, `npm test` | P0 |

**Exit Criteria:** Application launches, shows login, engine produces correct results, all tests pass.

### Phase 2: Feature Parity (Weeks 3-4)

| Task | Files |
|------|-------|
| Employee CRUD page | `EmployeesPage.tsx` |
| Schedule CRUD page | `SchedulesPage.tsx` |
| Work config CRUD page | `WorkConfigPage.tsx` |
| Work sessions page | `WorkSessionsPage.tsx` |
| Reports page | `ReportsPage.tsx` |
| Holidays page | `HolidaysPage.tsx` |
| Users management page | `UsersPage.tsx` |
| Audit log page | `AuditLogPage.tsx` |
| Excel import | Import components + commands |
| Excel export | Export utilities |

### Phase 3: Polish (Weeks 5-6)

| Task | Files |
|------|-------|
| Dashboard with widgets | `DashboardPage.tsx` |
| History page | `HistoryPage.tsx` |
| Backup/restore (with encrypted archive option) | Backup commands + UI |
| Diagnostics panel | Diagnostics components |
| Error handling improvements | Error boundaries, notifications |
| Auto-lock on idle | Security module |

### Phase 4: Packaging & Distribution (Week 7)

| Task | Files |
|------|-------|
| NSIS installer configuration | `tauri.conf.json` |
| Code signing setup | Build scripts |
| Auto-update configuration | Tauri updater |
| Release build pipeline | CI/CD scripts |
| User documentation | README, user guide |

### Phase 5: Enterprise Features (Weeks 8-10)

| Task | Files |
|------|-------|
| Multi-company schema | Migrations |
| Company management UI | Components |
| Plugin system | Plugin framework |
| Advanced reporting | Report components |
| Database encryption (SQLCipher) | DB configuration |

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

*Document validated for internal consistency. All sections reference compatible technologies (Tauri 2.x, Diesel 2.x, React 18, SQLite). Implementation phases align with production readiness items. Performance targets are achievable with stated technology choices.*
