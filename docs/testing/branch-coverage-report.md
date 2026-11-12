# Branch coverage report

Executed 2026-11-11T04:04:32.854Z. Node v26.12.1; Linux 7.2.11-arch1-1 x64. Source revision: `27e6e1586cc3de32a600e0ed01a29cfd327003ac`. The exact tested source is identified by the hashes in [source-manifest.json](evidence/source-manifest.json); the evidence commit follows it.

Coverage includes only files matched by `src/**` and visible to Node’s built-in instrumentation in each workspace. Dependencies, tests and scripts are excluded. Vite SSR loads JSX through a transform that is not represented here; component test passes do not imply JSX coverage. Files outside the measured set are listed explicitly. Percentages use covered/total counts per metric; they are not averages of file percentages. Node/V8 line coverage is its own line metric, not statement coverage.

These are Node/V8 branch counters (including defaults, callbacks and guards), not a claim of exhaustive business-path coverage. Multiple counters can share one line.

| File / scope | Covered / branches | Branch coverage |
| --- | --- | --- |
| **server measured total** | 724/767 | 94.39% |
| `server/src/app.js` | 15/15 | 100.00% |
| `server/src/config/database.js` | 6/7 | 85.71% |
| `server/src/config/env.js` | 6/8 | 75.00% |
| `server/src/database/definitions.js` | 8/8 | 100.00% |
| `server/src/database/models.js` | 46/60 | 76.67% |
| `server/src/database/seed.js` | 11/11 | 100.00% |
| `server/src/database/setup.js` | 7/8 | 87.50% |
| `server/src/modules/auth/permissions.js` | 12/12 | 100.00% |
| `server/src/modules/auth/routes.js` | 23/24 | 95.83% |
| `server/src/modules/auth/sessions.js` | 21/22 | 95.45% |
| `server/src/modules/inventory/routes.js` | 10/10 | 100.00% |
| `server/src/modules/inventory/service.js` | 76/76 | 100.00% |
| `server/src/modules/products/routes.js` | 22/22 | 100.00% |
| `server/src/modules/products/service.js` | 60/60 | 100.00% |
| `server/src/modules/purchases/routes.js` | 13/13 | 100.00% |
| `server/src/modules/purchases/service.js` | 161/167 | 96.41% |
| `server/src/modules/reports/routes.js` | 5/5 | 100.00% |
| `server/src/modules/reports/service.js` | 52/55 | 94.55% |
| `server/src/modules/sales/routes.js` | 7/7 | 100.00% |
| `server/src/modules/sales/service.js` | 66/74 | 89.19% |
| `server/src/modules/shared/errors.js` | 2/2 | 100.00% |
| `server/src/modules/shared/passwords.js` | 7/10 | 70.00% |
| `server/src/modules/shared/references.js` | 21/24 | 87.50% |
| `server/src/modules/suppliers/routes.js` | 14/14 | 100.00% |
| `server/src/modules/suppliers/service.js` | 49/49 | 100.00% |
| `server/src/modules/users/routes.js` | 4/4 | 100.00% |
| **client measured total** | 32/34 | 94.12% |
| `client/src/api.js` | 32/34 | 94.12% |

## Uncovered branches

| File | Uncovered counters | Source lines | Explanation / residual gap |
| --- | --- | --- | --- |
| `server/src/config/database.js` | 1 | 12 | Ping exception after readyState is connected; disconnected readiness and successful real ping are covered. |
| `server/src/config/env.js` | 2 | 12, 14 | Alternate host/client-origin defaults while the local environment supplies values. |
| `server/src/database/models.js` | 14 | 88, 91, 97, 99, 129, 130, 134, 139, 142, 143, 154, 155, 163 | Some alternatives in duplicate/missing product references, invalid line/aggregate money, missing item arrays, received-state consistency, receipt audit-ID cardinality and re-saving an existing receipt are unexecuted. |
| `server/src/database/setup.js` | 1 | 15 | Existing-collection validation/collMod migration branch; fresh collection creation and already-recorded migration replay are covered. |
| `server/src/modules/auth/routes.js` | 1 | 17 | Missing request-body fallback; malformed credential values are covered. |
| `server/src/modules/auth/sessions.js` | 1 | 13 | Cookie with matching name and empty token fallback. |
| `server/src/modules/purchases/service.js` | 6 | 44, 116, 128, 131, 199 | Missing required order fields, updating an absent order, cancelling with additional edits, changing supplier on edit and the orderNumber history-filter alternative remain unexecuted. |
| `server/src/modules/reports/service.js` | 3 | 24, 28, 52 | Safe-integer overflow guards for aggregated money/units; normal stored totals and date/filter validation are covered. |
| `server/src/modules/sales/service.js` | 8 | 15, 22, 70, 80, 83, 118, 120, 124 | Some alternatives in malformed/duplicate lines, direct-service actor validity, missing stock row, unsafe monetary total and invalid history dates remain unexecuted; rollback/concurrent retry scenarios pass. |
| `server/src/modules/shared/passwords.js` | 3 | 18, 20, 22 | Malformed stored scrypt formats and unsupported parameter branches; valid hash and wrong-password paths are covered. |
| `server/src/modules/shared/references.js` | 3 | 4, 13, 21 | Invalid ObjectId reference, missing required reference deferred to schema validation, and rejected pipeline-update alternatives remain unexecuted. |
| `client/src/api.js` | 2 | 20, 94 | Successful currentUser response and default purchases.list filter argument are not directly exercised. Many wrapper functions also lack direct unit tests, reflected separately in function/line coverage. |

LCOV branch counters and source line locations are retained in [lcov.info](evidence/lcov.info). Browser workflow evidence is separate and does not increase these unit/integration coverage percentages.
