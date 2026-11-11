# Avaneesh — inventory sales reports test cases

Updated 11 November 2026 against the implementation. Prepared centrally for QA delivery. After GitHub rejected direct main publication, Atharv authorized a QA branch and PR. Owner names identify review responsibility, not authorship or completed teammate review.

| TC ID | Requirement | What we test now | Change from original plan | Automated test / manual steps | Result |
| --- | --- | --- | --- | --- | --- |
| TC-INV-01 | FR-INV-001 | Listing shows current persisted quantities after changes. | GET /api/inventory joins MongoDB collections. | server/tests/inventory.test.js | PASS (automated) |
| TC-INV-04 | FR-INV-004 / BR-003 | At/below minimum appears in low-stock filter and report. | Threshold is calculated on each read. | server/tests/inventory.test.js; server/tests/end-to-end.test.js | PASS (automated) |
| TC-SALE-01 | FR-SALE-001 | Authorized multi-item sale succeeds. | POST /api/sales uses Idempotency-Key. | server/tests/sales-reports.test.js | PASS (automated) |
| TC-SALE-02 | FR-SALE-002 | Zero, negative, fractional, string and unsafe quantities rejected. | Positive safe integers only. | server/tests/sales-reports.test.js | PASS (automated) |
| TC-SALE-03 | FR-SALE-003 / BR-008 | Insufficient stock rejects entire sale. | MongoDB transaction rolls back every line. | server/tests/sales-reports.test.js | PASS (automated) |
| TC-SALE-04 | FR-SALE-004 / BR-011 | Total equals quantity times stored selling price. | Server snapshots integer minor-unit prices; client totals are not trusted. | server/tests/sales-reports.test.js | PASS (automated) |
| TC-SALE-05 | FR-SALE-005 | Sold quantities decrement exactly once. | Sale, stock and audit records commit together. | server/tests/sales-reports.test.js | PASS (automated) |
| TC-SALE-06 | FR-SALE-006 | Distinct completed sales have distinct transaction numbers. | SALE- plus object ID, protected by a unique index. | server/tests/sales-reports.test.js | PASS (automated) |
| TC-SALE-07 | FR-SALE-007 | Filter sales by transaction number and inclusive dates. | GET /api/sales?transactionNumber=&from=&to=. | server/tests/sales-reports.test.js | PASS (automated) |
| TC-REP-01 | FR-REP-001 | Inventory report matches product/category, quantities and status. | GET /api/reports/inventory; optional status/category/stock filters. | server/tests/sales-reports.test.js | PASS (automated) |
| TC-REP-02 | FR-REP-002 | Low-stock report includes equality and excludes inactive products. | GET /api/reports/low-stock. | server/tests/sales-reports.test.js | PASS (automated) |
| TC-REP-03 | FR-REP-003 | Purchase history supports supplier/date filters and per-order totals. | No dedicated /api/reports/purchases endpoint, aggregate report total or purchase report screen. | server/tests/purchases.test.js (TC-PUR-09); client/tests/purchases-ui.test.js; dedicated reporting remains unimplemented. | PARTIAL (baseline gap) |
| TC-REP-04 | FR-REP-004 | Sales report filters dates and sums stored sales. | GET /api/reports/sales; inclusive UTC date boundaries. | server/tests/sales-reports.test.js | PASS (automated) |
| TC-REP-05 | FR-REP-005 | Inventory/sales report counts and totals agree with stored transactions. | Purchase aggregate reporting is excluded and remains TC-REP-03 gap. | server/tests/sales-reports.test.js | PASS (automated) |
