# Sprint 2 — 5–9 November 2026

## Goal and delivered work

Integrate suppliers, purchase receipts, sales, inventory updates and reports, and verify the store workflow across roles. Inventory search/low-stock work carried over from Sprint 1 was integrated with sales/reporting on 6 November.

| Area / stories | Owner | Integrated evidence |
| --- | --- | --- |
| Inventory/search #10, low stock #19, sales #17, reports #20 | Avaneesh | [PR #35](https://github.com/AtharvMitt/Electronics-Store-Management/pull/35), merged 6 November, `da9cdd2` |
| Suppliers #15 and orders/receipts #16 | Atharv | [PR #36](https://github.com/AtharvMitt/Electronics-Store-Management/pull/36), merged 9 November, `c42a67a` |
| Permission regression #25 | Annamalai | [PR #37](https://github.com/AtharvMitt/Electronics-Store-Management/pull/37), merged 9 November, `77d58e0` |
| API end-to-end workflow #21 | Annamalai | [PR #38](https://github.com/AtharvMitt/Electronics-Store-Management/pull/38), merged 9 November, `4dc6b3e` |
| Sale-to-stock verification #18 | Apurv | [PR #39](https://github.com/AtharvMitt/Electronics-Store-Management/pull/39), merged 9 November, `c551fba` |
| Stock consistency/retry correction #26 | Apurv | [PR #40](https://github.com/AtharvMitt/Electronics-Store-Management/pull/40), merged 9 November, `b119fbf` |
| Store navigation and responsive pages #13/#23 | Atharv | [PR #42](https://github.com/AtharvMitt/Electronics-Store-Management/pull/42), merged 9 November, `4ee0af8` |

## Verification and scope

The ordered API workflow covers product setup, stock rejection, order/partial/full receipt, adjustment, sale/retry, rollback, low-stock boundaries, reports, audit reconciliation, retirement and logout. Service tests prove later-write rollback and concurrent retry behavior. The sale-item version-key defect was reproduced and fixed under #26; [stock consistency](../stock-consistency.md) records the result.

Inventory/low-stock/sales reports are implemented. Purchase history supports supplier/date/status filters and per-order totals, but dedicated aggregate purchase reporting (FR-REP-003) is partial. User administration and general inventory-history filters also remain outstanding.

## Post-sprint QA and submission evidence

QA was recorded on 11 November and reviewed/merged in [PR #43](https://github.com/AtharvMitt/Electronics-Store-Management/pull/43) on 12 November, after the 6 November Part 3 deadline. The Windows coverage fix [#44](https://github.com/AtharvMitt/Electronics-Store-Management/pull/44) was also reviewed and merged on 12 November. [Verification](../verification.md) records 106 backend + 24 frontend passes, seven Chromium checks and the follow-up CI/Windows evidence.

No Sprint 2 two-minute video recording/upload link or completed retrospective is recorded in the repository. Firefox/Edge and trained-user acceptance remain unrecorded; these are not inferred from successful automated tests or merged PRs.
