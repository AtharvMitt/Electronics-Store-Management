# Apurv — products stock test cases

Updated 11 November 2026 against the implementation. Prepared centrally for QA delivery. After GitHub rejected direct main publication, Atharv authorized a QA branch and PR. Owner names identify review responsibility, not authorship or completed teammate review.

| TC ID | Requirement | What we test now | Change from original plan | Automated test / manual steps | Result |
| --- | --- | --- | --- | --- | --- |
| TC-PROD-01 | FR-PROD-001 | Create product/category and persist zero-stock row atomically. | POST /api/products and /api/categories; MongoDB. | server/tests/products.test.js | PASS (automated) |
| TC-PROD-02 | FR-PROD-002 / BR-001 | Normalized duplicate SKU rejected on create/update. | Unique index also reserves inactive SKUs, stricter than original active-only wording. | server/tests/products.test.js | PASS (automated) |
| TC-PROD-03 | FR-PROD-003 | Valid product edits persist. | PATCH /api/products/:id; money stored in integer minor units. | server/tests/products.test.js | PASS (automated) |
| TC-PROD-04 | FR-PROD-004 | Create/edit categories; reject deleting referenced categories. | Shared categories collection and reference checks. | server/tests/products.test.js | PASS (automated) |
| TC-PROD-05 | FR-PROD-005 | Search inventory by product SKU/name/category. | Search lives on GET /api/inventory and Inventory screen; catalogue has no search field. | server/tests/inventory.test.js | PASS (automated) |
| TC-PROD-06 | FR-PROD-006 / BR-009 | Deactivation preserves historical records and stock. | DELETE /api/products/:id performs logical retirement. | server/tests/products.test.js | PASS (automated) |
| TC-INV-02 | FR-INV-002 | Signed stock adjustment persists product, reason, actor and time. | POST /api/inventory/:productId/adjustments; MongoDB transaction. | server/tests/inventory.test.js | PASS (automated) |
| TC-INV-03 | FR-INV-003 / BR-002 | Reject adjustment below zero without history write. | Guarded atomic update replaces relational locking. | server/tests/inventory.test.js | PASS (automated) |
| TC-INV-05 | FR-INV-005 | Purchase, sale and adjustment audit events reconcile to stored stock. | History verified in MongoDB; no general history screen. | server/tests/end-to-end.test.js | PASS (automated) |
| TC-INV-06 | FR-INV-006 | No general inventory-history API/UI is implemented. | Baseline history filtering by product/date is deferred; receipt history alone is not equivalent. | Code inspection: server/src/modules/inventory/routes.js exposes listing and adjustments only. | DEFERRED (baseline gap) |
| TC-NFR-08 | NFR-009 | Force later-line audit/receipt failures and verify full rollback. | Real MongoDB multi-document transactions on a replica set. | server/tests/stock-consistency.test.js | PASS (automated) |
| TC-NFR-09 | NFR-010 | Invalid receipt quantities identify the corrective action; saved writes distinguish refresh errors. | React alert text and shared JSON messages replace planned field framework. | client/tests/purchases-ui.test.js | PASS (automated) |
| TC-BR-03 | BR-003 | Quantity equal to minimum is low stock; above minimum is not. | Computed from availableQty <= minimumStock. | server/tests/inventory.test.js | PASS (automated) |
| TC-BR-08 | BR-008 | Insufficient sale stock leaves sale/history/stock unchanged. | Guarded decrement in sale transaction. | server/tests/sales-reports.test.js | PASS (automated) |
