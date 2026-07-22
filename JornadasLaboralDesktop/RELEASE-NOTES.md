# Jornadas Laborales Desktop v1.0.0

**Release Date:** 2025-07-22

---

## What's New

### Desktop Application
- Full Tauri 2 desktop application with native Windows support
- NSIS installer + MSI installer + portable executable
- System tray integration (minimize to tray)
- Auto-start backend sidecar on application launch
- Health check with automatic restart on crash
- Dynamic frontend URL resolution (no hardcoded ports)

### Import Center (Generic/Reusable)
- Import from **CSV**, **Excel (.xlsx)**, and **ODS** files
- Upload → Preview → Execute workflow with confirmation dialog
- Dry-run mode to test without writing data
- Full rollback support (reverse import + undo file uploads)
- Import history with audit trail
- Employee name → ID resolution
- Duplicate detection (same date + employee)
- Generic module system: supports any import type

### Security Hardening (Production Ready)
- Path traversal protection in file reads and backup restore
- Command injection prevention in system commands
- XSS fixes across frontend (HTML escaping in dynamic content)
- CORS configurable via `CORS_ORIGINS` environment variable
- Logout validates JWT before blacklisting
- File upload size limit (10MB)
- Tauri filesystem scope restricted to app data directories
- TLS certificate validation enforced (no `danger_accept_invalid_certs`)

### Backend Improvements
- SQLite database (WAL mode for performance)
- Configurable CORS origins
- Upload endpoint returns proper error codes (400 on missing file)
- Work session import calculates `totalMinutes` and `ordinaryMinutes`

### Code Quality
- All ESLint errors resolved
- TypeScript type checking passes
- Clean build (backend + frontend + Rust)

---

## Artifacts

| File | Size | Description |
|------|------|-------------|
| `Jornadas Laborales_1.0.0_x64-setup.exe` | ~2.3 MB | NSIS installer (recommended) |
| `Jornadas Laborales_1.0.0_x64_en-US.msi` | ~3.4 MB | MSI installer (enterprise/GPO) |
| `jornadas-laboral-desktop.exe` | ~6.4 MB | Portable executable |

---

## Requirements

- **OS:** Windows 10/11 (x64)
- **Runtime:** Embedded (no additional runtime required)
- **Space:** ~50 MB installed
- **Dependencies:** Node.js 18+ (bundled with app for backend)

---

## Installation

### NSIS Installer (Recommended)
1. Run `Jornadas Laborales_1.0.0_x64-setup.exe`
2. Follow the wizard
3. Launch from Start Menu or Desktop shortcut

### MSI Installer (Enterprise)
```cmd
msiexec /i "Jornadas Laborales_1.0.0_x64_en-US.msi"
```

### Portable
1. Extract `jornadas-laboral-desktop.exe` to any folder
2. Run the executable directly

---

## Configuration

Create a `.env` file in the application directory or set environment variables:

```env
# Database
DATABASE_URL="file:./data/jornadas.db"

# CORS (comma-separated origins)
CORS_ORIGINS="http://localhost:3000"

# Backend Port (optional, auto-selected if not set)
PORT=3000

# JWT Secret (required for production)
JWT_SECRET="your-secret-key"
```

---

## Known Issues

- Backend startup takes ~5 seconds on first launch
- Import history is stored in app data directory

---

## Upgrade Notes

This is the initial release. No upgrade path needed.

---

## Credits

Built with:
- [Tauri 2](https://tauri.app/) - Desktop framework
- [NestJS](https://nestjs.com/) - Backend API
- [Prisma](https://www.prisma.io/) - Database ORM
- [SQLite](https://sqlite.org/) - Local database

---

## Support

For issues and feedback, contact the development team.
