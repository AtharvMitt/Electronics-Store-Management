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

## Issue #24 — 2026-10-29

Full suite: 16 passing tests (4 foundation, 12 schema), 0 skipped, against the local MongoDB 8.3 replica set. Schema setup also applied successfully through `npm run db:setup`. The seed CLI was executed against the isolated test database without printing credentials. The new tests create/drop only their uniquely generated test database.

Coverage includes replayable schema setup, unique indexes, direct database rejection of invalid stock/prices/statuses, invalid references on create/update, seeded role/account/stock boundaries, salted password verification, seed replay preserving existing data, append-only history, protected historical references, and rollback after a forced multi-document transaction failure. The first schema run identified Mongoose automatic collection creation racing setup; disabling automatic creation resolved it.

Login/UI, concurrent stock business operations, purchase/sale retry semantics, and end-to-end permission behavior are not implemented or claimed by these checks.

Cross-platform follow-up: replaced Unix-only MongoDB `--fork` with Node-managed detached startup and project PID tracking, removed shell-dependent test globs, and added native Windows PowerShell/macOS/Linux cloning, PATH, configuration, validation, shutdown and troubleshooting instructions to README. Native CI checks are added under #12; only actually executed results are recorded.

## Issue #12 — 2026-10-29

The Linux CI workflow passed on commit `d0afd3e`: https://github.com/AtharvMitt/Electronics-Store-Management/actions/runs/40869627836 (PR run) and https://github.com/AtharvMitt/Electronics-Store-Management/actions/runs/40869621423 (push run). Both lint/build and real MongoDB API tests passed. Earlier failures and the supported-kernel runner fix remain visible in commit/run history.

The complete CI branch then passed **all four checks** on `a533eb2`: [run 40871621952](https://github.com/AtharvMitt/Electronics-Store-Management/actions/runs/40871621952). This includes native Windows 2025 and macOS 15 install/start/test/lint/build/stop checks, not just Linux containers. The macOS installation requires trust for MongoDB's official Homebrew tap including its database-tools dependency; README and CI were corrected from the observed failures.

The full schema implementation passed **all four checks** on `0355864`: [PR run 40871635802](https://github.com/AtharvMitt/Electronics-Store-Management/actions/runs/40871635802). All 16 API/schema tests passed with no skips in the Linux, Windows and macOS database jobs. Each native job used the actual portable project MongoDB startup/shutdown helper. Native Windows/macOS build and lint checks also passed. Browser interaction and cross-browser UI testing remain feature/integration work.

## Issue #6 — 2026-10-30

Environment: Windows 11; Node.js 24.13.0; MongoDB Community Server 8.3.11; project replica set `techzone-dev` on loopback port 27018.

| Check | Observed result |
| --- | --- |
| `npm run db:setup` | Applied `001-initial-inventory-foundation, 002-authentication-sessions` |
| `npm run lint` | Passed |
| `npm test` | 25 passed, 0 failed, 0 skipped (4 foundation, 12 schema, 9 auth) |
| `npm run build` | React/Tailwind production build passed |
| Browser, wrong password | "Invalid email or password." shown; password field cleared; no session |
| Browser, seeded sales account | Logged in; header shows name, role and Log out; session survives reload; cookie not readable from page JavaScript |
| Browser, Log out | Returned to login form; `GET /api/auth/me` then returned 401 |

Role permissions (#7), user management screens, login rate limiting and HTTPS deployment are not implemented or claimed by these checks.
