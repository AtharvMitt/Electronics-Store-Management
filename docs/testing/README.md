# Testing and quality assurance

Delivery baseline: `82ef87a` (12 November 2026). Documentation status: 16 November 2026.

## Specifications and evidence

| Document | Location |
| --- | --- |
| Software Requirements Specification | [Markdown](../specifications/software-requirements-specification.md) / [PDF](../specifications/software-requirements-specification.pdf) |
| Software Architecture and Design | [Markdown](../specifications/software-architecture-design.md) / [PDF](../specifications/software-architecture-design.pdf) |
| Software Test Plan | [Markdown](../specifications/software-test-plan.md) / [PDF](../specifications/software-test-plan.pdf) |
| Test case catalogue | [66 cases](test-cases.md); [area files](test-cases/) |
| Test procedures and additional traceability | [Fixtures, expected results, E2E-01–06 and remaining requirements](test-procedures.md) |
| Required reports | [Unit Test](unit-test-report.md), [System Validation](system-validation-report.md), [Code Coverage](code-coverage-report.md), [Branch Coverage](branch-coverage-report.md) |
| Recorded execution | [JSON and LCOV](evidence/); [evidence provenance](evidence/README.md) |
| Original submissions | [Historical PDFs](../archive/README.md) |

## Recorded results

The committed Linux run on 11 November passed **106 backend tests, 24 frontend tests and 7 Chromium browser checks**. There were no failed or skipped test-runner cases. These 130 executable tests are different from the 66 documented acceptance scenarios.

Current case dispositions are **60 PASS, 2 PARTIAL, 1 DEFERRED and 3 N/A**. Of the passes, 56 have automated assertions, two are recorded static reviews, one is suite execution and one is the completed peer-review/CI check. The original run's 59-pass disposition preceded the peer approval of TC-NFR-10. No absent feature or unrun browser check is counted as passed.

[PR #43](https://github.com/AtharvMitt/Electronics-Store-Management/pull/43) was approved by Annamalai (`therealannaa`) and merged on 12 November. [PR #44](https://github.com/AtharvMitt/Electronics-Store-Management/pull/44) was approved by AtharvMitt and merged the same day. It fixes Windows coverage execution and applies a 15-second volume-test allowance when `NODE_V8_COVERAGE` is set; normal runs retain 5 seconds. Its four [CI jobs](https://github.com/AtharvMitt/Electronics-Store-Management/actions/runs/43186995293) passed. The PR records a successful Windows run; its raw output is not part of the committed Linux evidence.

## Test locations and commands

| Location | Purpose |
| --- | --- |
| `server/tests/` | 13 files: authentication, permissions, foundation/schema, products, inventory, suppliers, purchases, sales/reports, stock consistency, API end-to-end and NFR tests |
| `client/tests/` | 6 files: API client and product, inventory, supplier, purchase, sale/report DOM tests |
| `scripts/qa-browser.mjs` | Separate Chromium workflow automation |
| `scripts/qa-review.mjs` | Lint/build/whitespace, module and client-secret checks |
| `docs/testing/test-cases/` | Four area mappings: auth/security (15), products/stock (14), inventory/sales/reports (14), purchases/common/NFR (23) |

`npm test` runs both workspaces. `npm run test:coverage` records unit/integration coverage. Browser and review scripts run separately. Environment and report-refresh instructions are in [Test Plan §5](../specifications/software-test-plan.md).

## Acceptance limitations

| Item | Delivered state |
| --- | --- |
| FR-AUTH-006: user administration | Read-only Team page; no account mutation API/UI |
| FR-INV-006: inventory history filters | Audit records exist; no general product/date history API/UI |
| FR-REP-003: purchase report | Filtered purchase history and per-order totals; no aggregate report endpoint/screen |
| NFR-007: browser support | Chromium tested; Firefox and Edge execution not recorded |
| NFR-003: trained-user usability | Search and stock share one page; no separate trained-user acceptance record |
| NFR-002, SEC-005, SEC-010 | Availability window and deployed HTTPS/database privileges not validated in the local environment |

Peer approval of the implementation and QA does not waive unmet requirements. Video submission and sprint review records are listed in [Sprint 1](../sprints/sprint-1.md) and [Sprint 2](../sprints/sprint-2.md).
