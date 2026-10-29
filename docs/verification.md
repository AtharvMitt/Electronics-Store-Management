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
