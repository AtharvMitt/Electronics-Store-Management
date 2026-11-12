# Code coverage report

Executed 2026-11-11T04:04:32.854Z. Node v26.12.1; Linux 7.2.11-arch1-1 x64. Source revision: `27e6e1586cc3de32a600e0ed01a29cfd327003ac`. The exact tested source is identified by the hashes in [source-manifest.json](evidence/source-manifest.json); the evidence commit follows it.

Coverage includes only files matched by `src/**` and visible to Node’s built-in instrumentation in each workspace. Dependencies, tests and scripts are excluded. Vite SSR loads JSX through a transform that is not represented here; component test passes do not imply JSX coverage. Files outside the measured set are listed explicitly. Percentages use covered/total counts per metric; they are not averages of file percentages. Node/V8 line coverage is its own line metric, not statement coverage.

| File / scope | Covered / lines | Line coverage | Covered / functions | Function coverage |
| --- | --- | --- | --- | --- |
| **server measured total** | 1598/1616 | 98.89% | 200/202 | 99.01% |
| `server/src/app.js` | 44/44 | 100.00% | 5/5 | 100.00% |
| `server/src/config/database.js` | 17/19 | 89.47% | 3/3 | 100.00% |
| `server/src/config/env.js` | 16/16 | 100.00% | 1/1 | 100.00% |
| `server/src/database/definitions.js` | 180/180 | 100.00% | 3/3 | 100.00% |
| `server/src/database/models.js` | 163/170 | 95.88% | 27/27 | 100.00% |
| `server/src/database/seed.js` | 49/49 | 100.00% | 2/2 | 100.00% |
| `server/src/database/setup.js` | 33/36 | 91.67% | 2/2 | 100.00% |
| `server/src/modules/auth/permissions.js` | 54/54 | 100.00% | 5/5 | 100.00% |
| `server/src/modules/auth/routes.js` | 51/51 | 100.00% | 6/6 | 100.00% |
| `server/src/modules/auth/sessions.js` | 53/53 | 100.00% | 7/7 | 100.00% |
| `server/src/modules/inventory/routes.js` | 34/34 | 100.00% | 3/3 | 100.00% |
| `server/src/modules/inventory/service.js` | 95/95 | 100.00% | 8/8 | 100.00% |
| `server/src/modules/products/routes.js` | 54/54 | 100.00% | 13/13 | 100.00% |
| `server/src/modules/products/service.js` | 100/100 | 100.00% | 18/18 | 100.00% |
| `server/src/modules/purchases/routes.js` | 23/23 | 100.00% | 6/6 | 100.00% |
| `server/src/modules/purchases/service.js` | 206/209 | 98.56% | 30/30 | 100.00% |
| `server/src/modules/reports/routes.js` | 13/13 | 100.00% | 4/4 | 100.00% |
| `server/src/modules/reports/service.js` | 81/81 | 100.00% | 13/13 | 100.00% |
| `server/src/modules/sales/routes.js` | 23/23 | 100.00% | 4/4 | 100.00% |
| `server/src/modules/sales/service.js` | 129/131 | 98.47% | 14/14 | 100.00% |
| `server/src/modules/shared/errors.js` | 8/8 | 100.00% | 1/1 | 100.00% |
| `server/src/modules/shared/passwords.js` | 25/25 | 100.00% | 2/2 | 100.00% |
| `server/src/modules/shared/references.js` | 49/50 | 98.00% | 8/10 | 80.00% |
| `server/src/modules/suppliers/routes.js` | 24/24 | 100.00% | 6/6 | 100.00% |
| `server/src/modules/suppliers/service.js` | 56/56 | 100.00% | 6/6 | 100.00% |
| `server/src/modules/users/routes.js` | 18/18 | 100.00% | 3/3 | 100.00% |
| **client measured total** | 85/100 | 85.00% | 9/28 | 32.14% |
| `client/src/api.js` | 85/100 | 85.00% | 9/28 | 32.14% |

## Unmeasured source files

| Source file | Coverage limitation |
| --- | --- |
| `server/src/index.js` | Server startup entry point is not imported by tests. |
| `client/src/InventoryListing.jsx` | Component DOM tests pass, but transformed JSX has no Node coverage data. |
| `client/src/LoginForm.jsx` | No component/unit tests for this file and no Node coverage data; browser smoke is separate evidence. |
| `client/src/ProductCatalogue.jsx` | Component DOM tests pass, but transformed JSX has no Node coverage data. |
| `client/src/Purchases.jsx` | Component DOM tests pass, but transformed JSX has no Node coverage data. |
| `client/src/Reports.jsx` | Component DOM tests pass, but transformed JSX has no Node coverage data. |
| `client/src/Sales.jsx` | Component DOM tests pass, but transformed JSX has no Node coverage data. |
| `client/src/StockAdjustments.jsx` | Component DOM tests pass, but transformed JSX has no Node coverage data. |
| `client/src/Suppliers.jsx` | Component DOM tests pass, but transformed JSX has no Node coverage data. |
| `client/src/UserList.jsx` | No component/unit tests for this file and no Node coverage data; browser smoke is separate evidence. |
| `client/src/main.jsx` | No component/unit tests for this file and no Node coverage data; browser smoke is separate evidence. |

Raw LCOV: [backend](evidence/server.lcov), [frontend](evidence/client.lcov), [combined, repository-relative paths](evidence/lcov.info). Raw event data includes individual line/function counts in the test result JSON files.
