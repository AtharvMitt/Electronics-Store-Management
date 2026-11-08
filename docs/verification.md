# Verification evidence

## Stories #15 and #16 — suppliers, purchase orders and receipts

Environment: Arch Linux, Node.js 26.12.1, MongoDB 8.3 replica set on loopback port 27018. New tests create/drop only uniquely named `techzone_test_suppliers_*`, `techzone_test_purchases_*` and `techzone_test_purchase_upgrade_*` databases. Existing application data and seed definitions are unchanged.

| Check | Observed result |
| --- | --- |
| `npm ci` | Locked installation passed; zero audit vulnerabilities reported |
| `npm test` | 75 backend/database tests and 20 frontend interaction tests passed; zero failed/skipped |
| `npm run lint` | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| Automated Brave/Chromium browser smoke | Supplier creation/edit/deactivation, active selection, exact order totals, partial/full receipts, stock/alert/adjustment/sale availability refresh, over-receipt rejection, stable supplier snapshots, Sales read-only controls and backend 403 passed; no uncaught page exceptions |

New coverage verifies all five roles and unauthenticated requests, required/optional supplier fields, persistence, unknown/invalid purchase fields and references, date boundaries, exact safe-integer costs/totals, draft/order/cancel transitions, no stock change on order creation, correctly targeted partial/full receipts, receipt history, over-receipt and stock limits, concurrent same-key retries, conflicting keys across different orders/products, and failure rollback. Forced second-line audit and receipt-persistence errors leave order quantities, stock, receipt records and inventory history unchanged, then permit a successful retry.

The migration-upgrade test constructs the actual 001–003 collections/validators/indexes with an existing record, applies only 004/005, confirms preservation and repeatability, and checks durable receipt-key/history indexes. The existing #11 purchase-source fixture now conforms to the new validator without bypassing constraints or weakening assertions. No new package or seed change is needed. [PR #36](https://github.com/AtharvMitt/Electronics-Store-Management/pull/36) links the implementation, exact head and remote checks.

React tests exercise supplier mutations/read-only roles, active selection, exact costs, history filters, order editing/cancellation, receipt input validation, lost-response retries with locked original content/key, and saved-write/failed-refresh recovery. Automated browser verification used a separate temporary test database and application ports, then removed that database. Human peer review and Firefox/Edge verification remain pending. Existing CI jobs run the same root commands on Linux and native Windows/macOS; remote results must be checked for the actual PR head and are linked in the PR.

## Issue #9 — 2026-11-01

Environment: Arch Linux, Node.js 26.12.1, existing local MongoDB replica set on 127.0.0.1:27018. Tests use a generated `techzone_test_products_<random>` database and remove only that database.

| Check | Observed result |
| --- | --- |
| `npm test` | 39 backend tests and 4 React DOM interaction tests passed; 0 failed, 0 skipped |
| `npm run lint` | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |

Eight new database/API tests cover CRUD persistence, required/type/numeric validation, duplicate identifiers, missing/invalid references, authentication and role denial on every endpoint, product retirement/history preservation, protected category deletion, product/stock rollback and concurrent category deletion/reference creation. Four new React DOM tests cover creation, integer price conversion, editing, permission visibility, refresh, deactivation and deletion errors. Tests run through `npm test` and the existing four CI jobs; no workflow checks are weakened.

Local sandbox network/process restrictions prevented direct MongoDB startup and npm download; checks were run with authorized elevated access against the already-running local replica set. Browser/cross-browser manual verification and peer review remain pending. Project 3 returned null to the ofsadug API token, so board fields/status could not be verified or changed. Original issue ownership, points and Epic are preserved. Remote CI evidence will be linked in the PR after execution; no CI pass is inferred from local results.

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

## Issue #7 — 2026-10-30

Same environment as #6 above.

| Check | Observed result |
| --- | --- |
| `npm run lint` | Passed |
| `npm test` | 31 passed, 0 failed, 0 skipped (4 foundation, 12 schema, 9 auth, 6 permissions) |
| `npm run build` | React/Tailwind production build passed |
| Browser, seeded sales account | Cards list only "Record sales" and "Sales reports"; no Users panel; `GET /api/users` returned 403 |
| Browser, seeded admin account | All 11 actions listed; Users panel showed all 6 seeded accounts |

At this 2026-10-30 #7 verification baseline, feature routes for products, inventory, suppliers, purchases, sales and reports did not exist yet; their owners added `requirePermission` in their feature work. User create/edit/deactivate screens (FR-AUTH-006) are not part of #7.

## Issue #11 — 2026-11-01

Environment: Arch Linux, Node.js 26.12.1, local MongoDB replica set on 127.0.0.1:27018. Tests generate/drop only `techzone_test_inventory_<random>`; no application database reset.

| Check | Observed result |
| --- | --- |
| `npm ci` | Clean locked install passed |
| `npm test` | 42 backend + 4 React DOM tests passed; 0 failed, 0 skipped |
| `npm run lint` | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |

Eleven new real database/API tests verify correct product/actor, increases/decreases, zero confirmation, exact depletion, safe integer bounds, malformed fields, unauthorized roles, missing/inactive product/stock, persistence via a new read, audit details, failure rollback, six concurrent increments and competing decrements, standalone service use, caller-owned transaction rollback, abort after caught audit failure, source references and source/stock/history rollback together. Four React tests cover signed adjustments and selected-product targeting, component reload, permission visibility, validation/insufficient-stock feedback, and saved-write/failed-refresh recovery without resubmission.

Tests required authorized execution outside local sandbox network/process restrictions. Existing CI jobs run the same root command with real MongoDB and both workspaces; no checks/tests were weakened. Browser/cross-browser manual review and integrated Sprint 2 flows remain pending. No migration or dependency on #9 is required.

`npm audit` reported six moderate findings through existing development lint dependencies (minimatch/eslint/react plugin); those locked versions match origin/main. No new test-tool package appeared in the audit findings. No forced dependency downgrade/major change was applied. Remote CI must be checked for the exact pushed commit; local results do not imply remote success.

## Issues #10, #19, #17 and #20 — 2026-11-05

Environment: Windows; Node.js 24.11.0; MongoDB Community Server 8.2 replica set on 127.0.0.1:27018. Tests generated unique database names and dropped only those databases.

| Check | Observed result |
| --- | --- |
| `npm test` | 57 backend tests and 11 frontend tests passed; 0 failed, 0 skipped |
| `npm run lint` | Passed |
| `npm run build` | Vite production build passed |
| `git diff --check` | Passed |

New backend coverage checks stored inventory quantities, product/category search, category and low-stock filters, invalid/empty results, threshold equality and stock-change warnings; sale permissions, multi-line validation, exact minor-unit totals, insufficient-stock rejection, transaction retrieval, concurrent idempotent retries and audit-failure rollback; report permissions, date boundaries, empty results and totals against stored transactions. Frontend tests exercise filter/clear actions, low-stock status, sale entry/history refresh, report date filters and empty states. Migration 003 and direct MongoDB validators/indexes are covered in schema tests. These are automated integration/component checks; no manual browser or teammate review is claimed.
