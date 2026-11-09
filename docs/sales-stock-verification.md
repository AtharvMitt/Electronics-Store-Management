# Automatic inventory updates after sales — Story #18

Owner: ofsadug · Sprint 2 · 3 points · Epic #4.

The behavior requested in #18 is already implemented on `main`: the sales work in #35 calls the shared stock service from #11, and the merged #38 API workflow verifies the integrated result. This story verifies that implementation rather than introducing a second deduction path. The verification baseline is `4dc6b3e`, including the merged supplier/purchase, permission-regression and end-to-end work.

## Acceptance checklist and evidence

| #18 acceptance criterion | Existing implementation and executed evidence |
| --- | --- |
| Successful sales deduct correct quantities | `server/src/modules/sales/service.js`: `recordSale` creates the sale and calls `applyStockChange` with negative sold quantities and the same MongoDB session. `server/tests/sales-reports.test.js`, `TC-SALE-01/02: authorized sale captures details, deducts stored stock and is retrievable`, checks quantity 5 → 3, exact price/total, actor and SALE source history. `server/tests/end-to-end.test.js`, step 6, verifies a two-product sale leaves exactly 2 units of each product. |
| Failed sales do not deduct stock | `sales-reports.test.js`, `invalid quantities, unknown fields and insufficient stock reject without partial records`, checks unchanged stock and sale/history counts after invalid multi-line sales. `failed audit writes roll back sale records and every stock deduction` forces an audit failure, verifies unchanged stock/records/history, and then retries successfully. End-to-end step 7 independently reads unchanged stock after rejected multi-line sales. |
| Insufficient stock blocks the sale | The sales service checks stored availability and the stock service guards the conditional decrement. The sales invalid-input test checks HTTP 409 and no sale/history changes; end-to-end steps 2 and 7 reject zero-stock and excessive-quantity sales. |
| Updated stock is visible | End-to-end step 6 obtains fresh stored quantities through `GET /api/inventory`; step 9 compares inventory reports with those quantities. `client/src/Sales.jsx` calls `onInventoryChange` after success, refreshes sale history and available product quantities, and `main.jsx` updates inventory/stock/report consumers. `client/tests/inventory-sales-reports-ui.test.js`, `sale form retries a committed request with the same idempotency key`, verifies the callback and refreshed rendered history. |
| Retries do not cause duplicate deductions | `sales-reports.test.js` verifies sequential and concurrent same-key retries return the original sale with one stock deduction and one source history event. End-to-end step 6 retries the same two-product sale and verifies the original sale ID and unchanged final quantities. The frontend retry test preserves the original key after a lost response. |

## Requirements and boundaries

Verified SRS references: FR-SALE-002/003/005, FR-INV-001, BR-002/007/008/012, NFR-004/009, SRS §§13.1/14.4. FR-SALE-003 prevents insufficient-stock completion; FR-SALE-005 specifies deduction after completion. NFR-004 covers retry safety and NFR-009 covers atomic related writes. API permissions, actor attribution, safe integer quantities and append-only stock history are reused from the existing modules.

The sale, all stock deductions and their inventory events share one transaction. An uncertain HTTP response is retried with the same `Idempotency-Key`; it is not submitted as a new sale. This verification does not replace #26's additional service-level consistency, later-write failure and concurrency tests.

## Reproduction and observed validation

With the documented MongoDB replica set running and TEST_MONGODB_URI configured, run from the repository root:

```bash
npm ci
npm run lint
npm test
npm run build
git diff --check
```

On Arch Linux, Node.js 26.12.1 and the local MongoDB 8.3 replica set, the complete baseline suite passed: **92 backend tests and 20 frontend tests**, zero failures/skips. Lint, production build and diff checks passed. The tests create/drop isolated test databases; application data and seed definitions are unchanged. This branch adds only the checklist/evidence record and traceability entry; it adds no application code, tests, migration or dependency.

The PR should use `Closes #18`. Keep #18 open until the verification is reviewed and merged; passing local tests or pushing this branch alone does not satisfy the repository Definition of Done. GitHub Actions runs the existing checks when the PR is opened.
