# System validation report

Executed 2026-11-11T04:04:32.854Z. Node v26.12.1; Linux 7.2.11-arch1-1 x64. Source revision: `27e6e1586cc3de32a600e0ed01a29cfd327003ac`. The exact tested source is identified by the hashes in [source-manifest.json](evidence/source-manifest.json); the evidence commit follows it.

All **65 original unique TC IDs** are retained. **TC-PUR-06** is added for FR-PUR-006, which the original table skipped: **66 cases total**. The repeated TC-SEC-03 in the original functional/security sections counts once. NFR case numbers differ from requirement numbers: TC-NFR-08 = NFR-009; TC-NFR-09 = NFR-010.

Case dispositions: **PASS: 59**; **N/A: 3**; **PARTIAL: 3**; **DEFERRED: 1**. PASS means the documented revised scenario passed. PARTIAL/DEFERRED identify unmet baseline scope; N/A identifies a deployment/operating context that is absent. They are not passes.

The ordered `server/tests/end-to-end.test.js` workflow has 12 passing steps: setup → zero-stock rejection → supplier/order → partial/full receipt and over-receipt rejection → adjustment → sale/retry → failed-sale rollback → low-stock boundary → report reconciliation → audit reconciliation → retirement → logout.

| Use case | Workflow | Result | Evidence / deviation |
| --- | --- | --- | --- |
| UC-01 | Authenticate / logout | PASS | auth.test.js; browser login/logout |
| UC-02 | Manage users / roles | PARTIAL | Role persistence/permissions and read-only Team screen exist; user creation/edit/deactivation UI/API is deferred. |
| UC-03 | Manage products/categories | PASS | products.test.js; products-ui.test.js |
| UC-04 | Manage inventory | PARTIAL | Listing/adjustment/low stock/audit persistence pass; general history product/date browsing is deferred (TC-INV-06). |
| UC-05 | Manage suppliers | PASS | suppliers.test.js; suppliers-ui.test.js; browser supplier creation |
| UC-06 | Create purchase order | PASS | purchases.test.js; purchases-ui.test.js; browser order |
| UC-07 | Receive purchase | PASS | partial/full/over-receipt/retry/rollback; browser stock refresh |
| UC-08 | Record sale | PASS | sales-reports.test.js; stock-consistency.test.js; browser sale |
| UC-09 | View reports | PARTIAL | Inventory/low stock/sales reports pass; purchase aggregate reporting is absent (TC-REP-03). |

## Executed browser checks

Executed by `scripts/qa-browser.mjs` using Chromium 156.0.8078.73, 1440×1000 and 390×844 windows, generated accounts and an isolated temporary database. These are real browser automation checks, not a claim that a person ran the manual matrix. All 7 checks passed. [Raw browser results](evidence/browser-results.json).

| Browser action / observed assertion | Result |
| --- | --- |
| TC-AUTH-01: browser login and role navigation | PASS |
| TC-PUR-01, TC-COM-03: supplier form saves and refreshes purchase selection | PASS |
| TC-PUR-03, TC-PUR-05, TC-PUR-06, TC-PUR-07: order and receipt update visible stock | PASS |
| TC-SALE-01, TC-SALE-04, TC-SALE-05: browser sale updates inventory and reports | PASS |
| TC-COM-04: browser search empty state and clear | PASS |
| TC-NFR-06: Chromium mobile-width navigation smoke (partial browser matrix) | PASS |
| TC-AUTH-04: browser logout removes workspace | PASS |

## Manual checks still required

| TC | Owner | Steps / expected result | Current result |
| --- | --- | --- | --- |
| TC-NFR-06 | Atharv; teammate on required browsers | On Firefox and Edge: login; create supplier/order; receive goods and verify stock; sell and verify stock/report total; clear search; logout. Record browser version, OS, date and actual result. | PENDING for Firefox and Edge; Chromium desktop/mobile-width checks passed. |
| TC-NFR-10 | One teammate per module | Review four area mappings and revised SRS/SAD/STP against implementation; record reviewer, date and remaining defects. | PENDING peer review; lint/build/whitespace checks passed. |
| TC-NFR-02 | Atharv if hosted | Define operating window; monitor requests and uptime; exclude planned maintenance; require >=99%. | N/A: no hosted operating window. |
| TC-SEC-05 / TC-SEC-10 | Annamalai if deployed | Inspect HTTPS/certificate/cookie network behavior and deployed database user privileges. | N/A: production deployment absent. |

## Local NFR measurements

The response-time test excludes login/fixture setup and sends 100 warmed reads sequentially across five routes. The volume test starts with 10000 products and 100000 audit events and measures three operations with a separate 5000 ms usability budget. Measurements below are from the recorded run, in milliseconds; they are not production benchmarks.

```json
[
  {
    "workload": "small-data local reads, concurrency 1",
    "samples": 100,
    "withinTarget": 100,
    "p95Ms": 8.609065999999984,
    "maxMs": 11.061216000000059
  },
  {
    "products": 10000,
    "initialAuditRecords": 100000,
    "measurements": [
      {
        "operation": "SKU search",
        "durationMs": 445.0458600000002
      },
      {
        "operation": "inventory report, 10000 rows",
        "durationMs": 742.1875490000002
      },
      {
        "operation": "stock adjustment",
        "durationMs": 34.694743999999446
      }
    ]
  }
]
```

## Per-case execution record

| TC ID | Requirement | Result | Evidence / procedure |
| --- | --- | --- | --- |
| TC-AUTH-01 | FR-AUTH-001 | PASS (automated) | server/tests/auth.test.js; scripts/qa-browser.mjs |
| TC-AUTH-02 | FR-AUTH-002 | PASS (automated) | server/tests/auth.test.js |
| TC-AUTH-03 | FR-AUTH-003 / SEC-009 | PASS (automated) | server/tests/auth.test.js |
| TC-AUTH-04 | FR-AUTH-004 | PASS (automated) | server/tests/auth.test.js; scripts/qa-browser.mjs |
| TC-AUTH-05 | FR-AUTH-005 | PASS (automated) | server/tests/permissions.test.js |
| TC-SEC-01 | SEC-001 | PASS (automated) | server/tests/auth.test.js; client/tests/api.test.js |
| TC-SEC-02 | SEC-002 | PASS (automated) | server/tests/schema.test.js; server/tests/auth.test.js |
| TC-SEC-03 | SEC-003 | PASS (automated) | server/tests/permissions.test.js; server/tests/permission-regression.test.js |
| TC-SEC-04 | SEC-004 | PASS (automated) | server/tests/permissions.test.js |
| TC-SEC-05 | SEC-005 | N/A (production deployment absent) | server/src/modules/auth/sessions.js; production check requires HTTPS URL, certificate and network inspection. |
| TC-SEC-06 | SEC-006 | PASS (automated) | server/tests/products.test.js; server/tests/suppliers.test.js |
| TC-SEC-07 | SEC-007 | PASS (review) | docs/testing/evidence/security-review.json; scripts/qa-review.mjs |
| TC-SEC-08 | SEC-008 | PASS (automated) | server/tests/auth.test.js |
| TC-SEC-09 | SEC-009 | PASS (automated) | server/tests/auth.test.js |
| TC-SEC-10 | SEC-010 | N/A (production deployment absent) | Requires deployed application DB user and privilege inspection. |
| TC-INV-01 | FR-INV-001 | PASS (automated) | server/tests/inventory.test.js |
| TC-INV-04 | FR-INV-004 / BR-003 | PASS (automated) | server/tests/inventory.test.js; server/tests/end-to-end.test.js |
| TC-SALE-01 | FR-SALE-001 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-SALE-02 | FR-SALE-002 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-SALE-03 | FR-SALE-003 / BR-008 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-SALE-04 | FR-SALE-004 / BR-011 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-SALE-05 | FR-SALE-005 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-SALE-06 | FR-SALE-006 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-SALE-07 | FR-SALE-007 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-REP-01 | FR-REP-001 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-REP-02 | FR-REP-002 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-REP-03 | FR-REP-003 | PARTIAL (baseline gap) | server/tests/purchases.test.js (TC-PUR-09); client/tests/purchases-ui.test.js; dedicated reporting remains unimplemented. |
| TC-REP-04 | FR-REP-004 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-REP-05 | FR-REP-005 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-PROD-01 | FR-PROD-001 | PASS (automated) | server/tests/products.test.js |
| TC-PROD-02 | FR-PROD-002 / BR-001 | PASS (automated) | server/tests/products.test.js |
| TC-PROD-03 | FR-PROD-003 | PASS (automated) | server/tests/products.test.js |
| TC-PROD-04 | FR-PROD-004 | PASS (automated) | server/tests/products.test.js |
| TC-PROD-05 | FR-PROD-005 | PASS (automated) | server/tests/inventory.test.js |
| TC-PROD-06 | FR-PROD-006 / BR-009 | PASS (automated) | server/tests/products.test.js |
| TC-INV-02 | FR-INV-002 | PASS (automated) | server/tests/inventory.test.js |
| TC-INV-03 | FR-INV-003 / BR-002 | PASS (automated) | server/tests/inventory.test.js |
| TC-INV-05 | FR-INV-005 | PASS (automated) | server/tests/end-to-end.test.js |
| TC-INV-06 | FR-INV-006 | DEFERRED (baseline gap) | Code inspection: server/src/modules/inventory/routes.js exposes listing and adjustments only. |
| TC-NFR-08 | NFR-009 | PASS (automated) | server/tests/stock-consistency.test.js |
| TC-NFR-09 | NFR-010 | PASS (automated) | client/tests/purchases-ui.test.js |
| TC-BR-03 | BR-003 | PASS (automated) | server/tests/inventory.test.js |
| TC-BR-08 | BR-008 | PASS (automated) | server/tests/sales-reports.test.js |
| TC-PUR-01 | FR-PUR-001 | PASS (automated) | server/tests/suppliers.test.js |
| TC-PUR-02 | FR-PUR-002 / BR-009 | PASS (automated) | server/tests/purchases.test.js; server/tests/suppliers.test.js |
| TC-PUR-03 | FR-PUR-003 / BR-004 | PASS (automated) | server/tests/purchases.test.js |
| TC-PUR-04 | FR-PUR-004 / BR-005 | PASS (automated) | server/tests/purchases.test.js |
| TC-PUR-05 | FR-PUR-005 / BR-011 | PASS (automated) | server/tests/purchases.test.js |
| TC-PUR-06 | FR-PUR-006 | PASS (automated) | server/tests/purchases.test.js |
| TC-PUR-07 | FR-PUR-007 / BR-006 | PASS (automated) | server/tests/purchases.test.js |
| TC-PUR-08 | FR-PUR-008 | PASS (automated) | server/tests/purchases.test.js |
| TC-PUR-09 | FR-PUR-009 | PASS (automated) | server/tests/purchases.test.js; client/tests/purchases-ui.test.js |
| TC-COM-01 | FR-COM-001 | PASS (automated) | server/tests/products.test.js |
| TC-COM-02 | FR-COM-002 | PASS (automated) | client/tests/purchases-ui.test.js; client/tests/api.test.js |
| TC-COM-03 | FR-COM-003 | PASS (automated) | client/tests/purchases-ui.test.js |
| TC-COM-04 | FR-COM-004 | PASS (automated) | client/tests/suppliers-ui.test.js; scripts/qa-browser.mjs |
| TC-COM-05 | FR-COM-005 | PASS (automated) | server/tests/purchases.test.js; server/tests/products.test.js |
| TC-NFR-01 | NFR-001 | PASS (automated) | server/tests/non-functional.test.js; diagnostics in evidence/server-results.json |
| TC-NFR-02 | NFR-002 | N/A (operating window absent) | Needs uptime monitor, start/end times, planned-maintenance exclusions and downtime log. |
| TC-NFR-03 | NFR-004 | PASS (automated) | server/tests/purchases.test.js; server/tests/stock-consistency.test.js; client/tests/api.test.js |
| TC-NFR-04 | NFR-005 | PASS (review) | docs/specifications/software-architecture-design.md; scripts/qa-review.mjs |
| TC-NFR-05 | NFR-006 | PASS (suite execution) | evidence/server-results.json; evidence/client-results.json |
| TC-NFR-06 | NFR-007 | PARTIAL (browser matrix pending) | scripts/qa-browser.mjs; follow manual matrix in system-validation-report.md on Firefox and Edge. |
| TC-NFR-07 | NFR-008 | PASS (automated) | server/tests/non-functional.test.js; diagnostics in evidence/server-results.json |
| TC-NFR-10 | NFR-011 | PARTIAL (peer review pending) | docs/testing/evidence/quality-checks.json; teammate review still required. |
| TC-NFR-11 | NFR-012 | PASS (automated) | server/tests/inventory.test.js; server/tests/end-to-end.test.js |

## Defect and release disposition

No application test failures occurred in this run. Baseline gaps remain: user-management mutations (FR-AUTH-006), inventory-history filtering (FR-INV-006), and dedicated purchase reporting (FR-REP-003). They are documented in the revised specifications; no faculty approval or baseline compliance waiver is claimed. Earlier stock retry defect/fix evidence remains in [stock consistency](../stock-consistency.md). QA harness selector/root corrections were verified by rerunning the browser workflow.

The report package is reviewable, but full baseline acceptance remains open until these scope decisions and outstanding manual/peer reviews are resolved. Sprint videos remain Atharv’s pending deliverables.
