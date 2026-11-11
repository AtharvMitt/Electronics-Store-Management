# Unit test report

Executed 2026-11-11T04:04:32.854Z. Node v26.12.1; Linux 7.2.11-arch1-1 x64. Source revision: `27e6e1586cc3de32a600e0ed01a29cfd327003ac`. The exact tested source is identified by the hashes in [source-manifest.json](evidence/source-manifest.json); the evidence commit follows it.

Command: `npm run test:coverage` (Node built-in test runner and coverage; no coverage dependency). Backend checks include unit, service, HTTP integration, real database transactions and the ordered end-to-end workflow. Frontend checks include direct API-client unit tests and React/jsdom component tests. Counts below are test-runner cases, not test-plan cases.

| Suite | Tests | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| Backend | 106 | 106 | 0 | 0 |
| Frontend | 24 | 24 | 0 | 0 |

| Test file | Passed | Failed |
| --- | --- | --- |
| `client/tests/api.test.js` | 4 | 0 |
| `client/tests/inventory-sales-reports-ui.test.js` | 3 | 0 |
| `client/tests/inventory-ui.test.js` | 4 | 0 |
| `client/tests/products-ui.test.js` | 4 | 0 |
| `client/tests/purchases-ui.test.js` | 6 | 0 |
| `client/tests/suppliers-ui.test.js` | 3 | 0 |
| `server/tests/auth.test.js` | 9 | 0 |
| `server/tests/end-to-end.test.js` | 12 | 0 |
| `server/tests/foundation.test.js` | 4 | 0 |
| `server/tests/inventory.test.js` | 12 | 0 |
| `server/tests/non-functional.test.js` | 2 | 0 |
| `server/tests/permission-regression.test.js` | 5 | 0 |
| `server/tests/permissions.test.js` | 6 | 0 |
| `server/tests/products.test.js` | 8 | 0 |
| `server/tests/purchases.test.js` | 14 | 0 |
| `server/tests/sales-reports.test.js` | 5 | 0 |
| `server/tests/schema.test.js` | 13 | 0 |
| `server/tests/stock-consistency.test.js` | 12 | 0 |
| `server/tests/suppliers.test.js` | 4 | 0 |

Tests create unique `techzone_test_*` databases and drop only their own database. This run used MongoDB 8.3.9, isolated replica set `techzone-qa` on loopback port 27019. It did not reset the application database. Authentication uses generated test passwords.

Raw evidence: [backend results](evidence/server-results.json), [frontend results](evidence/client-results.json), [environment/provenance](evidence/run.json), [quality checks](evidence/quality-checks.json).
