# Verification evidence

## Issue #8 — 2026-10-29

Environment: Arch Linux; Node.js 26.12.1; npm 12.2.1; AUR `mongodb-bin` 8.3.9; project replica set `techzone-dev` on loopback port 27018.

| Check | Observed result |
| --- | --- |
| `npm run db:start` | Started isolated database and elected writable primary |
| `npm run lint` | Passed |
| `npm test` | 4 passed, 0 failed, 0 skipped; includes real database readiness |
| `npm run build` | React/Tailwind production build passed |
| `npm run dev` | React on 5173 and API on 5000 started |
| `GET http://127.0.0.1:5173/` | React HTML served |
| `GET http://127.0.0.1:5173/api/ready` | HTTP 200, `{"status":"ready"}` through frontend proxy |

This is foundation verification, not completed authentication, inventory, or transaction workflow testing. Browser interaction/cross-browser checks and teammate reproduction remain to be performed during review/integration. PR commits identify the tested implementation.

Cross-platform follow-up: replaced Unix-only MongoDB `--fork` with Node-managed detached startup and project PID tracking, removed shell-dependent test globs, and added native Windows PowerShell/macOS/Linux cloning, PATH, configuration, validation, shutdown and troubleshooting instructions to README. Native CI checks are added under #12; only actually executed results are recorded.
