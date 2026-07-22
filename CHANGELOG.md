# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-07-22

### Added
- Tauri 2 desktop application with native Windows support
- NSIS installer + MSI installer + portable executable
- System tray integration with minimize-to-tray
- Backend sidecar with health check and auto-restart
- Dynamic port selection for backend API
- Import Center with CSV/Excel/ODS support
- Upload → Preview → Execute workflow
- Dry-run mode for safe testing
- Full rollback support with undo
- Import history with audit trail
- Employee name resolution to ID
- Duplicate detection on same date + employee
- Generic module system for extensible imports
- Configurable CORS via `CORS_ORIGINS` env var
- Path traversal protection in file operations
- Command injection prevention in system calls
- XSS protection with HTML escaping
- Logout JWT validation
- File upload size limit (10MB)
- Tauri filesystem scope restriction
- TLS certificate validation enforcement
- SQLite database with WAL mode
- Work session totalMinutes/ordinaryMinutes calculation
- Clean ESLint with zero errors
- TypeScript type checking passes

### Fixed
- Path traversal in `readFileFromPath` (backend)
- Path traversal in `restoreBackup` (backend)
- Command injection in `open_in_explorer` (Tauri)
- XSS in `renderResumen`, audit, timeline, exportAuditPDF (frontend)
- Upload endpoint returns 400 on missing file
- Logout validates JWT before blacklisting
- CORS origins now configurable
- File system scope restricted from `**` to app data
- TLS certificate validation enforced
- Work session import now calculates time correctly

### Security
- All security issues from production readiness review resolved
- 15 security issues identified and fixed
- Path traversal, XSS, command injection, CORS, JWT validation all hardened

---

## [0.3.0] - 2025-07-21

### Added
- Complete Import Center with upload, preview, execute, rollback, and history
- Architecture Plan V2 for sidecar architecture

---

## [0.2.0] - 2025-07-20

### Added
- Initial sidecar architecture implementation

---

## [0.1.0] - 2025-07-19

### Added
- Initial version of the labor control system
