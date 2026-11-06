# Inventory, low stock, sales and reports — #10, #19, #17, #20

This extends the existing MERN modules using the submitted SRS and the exact GitHub acceptance lists. Search follows FR-PROD-005; stock display and low-stock behavior follow FR-INV-001/004 and BR-003. Sale creation/history follows FR-SALE-001–007, SRS §14.4, BR-007/008/011, and NFR-004/009. Reports follow FR-REP-001/002/004/005 and SRS §14.5.

## Inventory and low-stock alerts — #10 and #19

`GET /api/inventory` requires a valid session and `inventory:view`. It returns active products with existing MongoDB inventory rows, actual `availableQty`, minimum threshold, category, and a computed `lowStock` boolean. Search is a case-insensitive literal substring over product name, SKU, and category. `categoryId` filters by category, and `lowStockOnly=true` shows only quantities at or below the product threshold. The allowlist rejects unknown filters, malformed category IDs, invalid booleans, and searches longer than 100 characters. An empty result is a successful empty array. No stock row is synthesized by a read.

The Inventory dashboard includes search, category and low-stock controls, clear/refresh actions, empty states, and visible warnings. Stock adjustments and recorded sales notify the listing to reload stored quantities, so alert status follows a committed stock change. The inventory report uses the same stored quantity and `availableQty <= minimumStock` rule.

## Sales — #17

`POST /api/sales` requires `sales:create`; the server derives the actor from the authenticated session. An `Idempotency-Key` header is required and persisted under a unique index, so retrying a request after an uncertain response returns the same sale without deducting stock twice. Reusing a key with different sale content returns 409. The only accepted body field is `items`, with 1–100 distinct `{ productId, quantity }` lines. Product IDs must be valid, quantities positive safe integers, and products active with enough stock. Current selling prices are read from MongoDB and copied into each sale line as integer minor units. The sale records a server timestamp, unique transaction number, creator, lines and exact total.

Sale document creation, guarded stock deductions and append-only `SALE` inventory history occur in one MongoDB transaction. A failed validation, stock deduction, or history append leaves neither a sale nor partial inventory/history changes. `GET /api/sales` and `GET /api/sales/:id` require `sales:view` and return stored transactions. The list supports exact `transactionNumber`, inclusive UTC-day `from`, and `to` filters. Sale rows preserve item SKU/name and unit price as recorded, so later product edits do not rewrite transaction history.

Migration `003-sales-records` adds the `sales` collection, MongoDB document validator and indexes without changing existing records. Run `npm run db:setup` to apply it. The existing stock service remains the only sale stock mutation path.

## Reports — #20

`GET /api/reports/sales` requires `reports:sales` and returns stored sales with transaction count, exact integer-minor-unit total, and units sold. Optional `from`/`to` filters accept calendar dates in `YYYY-MM-DD`; both dates are inclusive, interpreted as UTC days. Unsupported, malformed, or reversed filters return 400. No matches return an empty list and zero totals.

`GET /api/reports/inventory` requires `reports:inventory` and returns the stored stock snapshot with product/category, available quantity, minimum stock, product status and stock status. It supports `categoryId`, product `status` (`ACTIVE`, `INACTIVE`, or `ALL`), and stock status (`LOW_STOCK`, `IN_STOCK`, or `ALL`) filters. `GET /api/reports/low-stock` is the separate low-stock report and supports the SRS category filter. Sales and inventory report routes enforce permissions on the server. The React report view exposes the supported sales date, inventory category/status and low-stock views.

## Verification mapping

| Issue | Acceptance evidence |
| --- | --- |
| #10 | `server/tests/inventory.test.js`: FR-INV-001 stored quantity, FR-PROD-005 name/SKU search, category filtering, invalid/empty results, and refresh after adjustment. `client/tests/inventory-sales-reports-ui.test.js`: filter, clear, and rendered inventory interactions. |
| #19 | Same backend test checks FR-INV-004/BR-003 equality, above-threshold behavior and status after stock changes. UI tests verify visible warnings; FR-REP-002 is covered by the low-stock report tests. |
| #17 | `server/tests/sales-reports.test.js`: FR-SALE-001–007, NFR-004 idempotent retries, NFR-009 atomicity, permission, transaction details, exact minor-unit totals, history filtering, insufficient stock and audit rollback. Schema constraints are in `server/tests/schema.test.js`. The frontend retry/filter/history interactions are in `client/tests/inventory-sales-reports-ui.test.js`. |
| #20 | `server/tests/sales-reports.test.js`: FR-REP-001/002/004/005, backend report access, inclusive date filters, inventory category/product/stock status filters, low-stock results, empty states and underlying-sale totals. UI filters and empty states are in `client/tests/inventory-sales-reports-ui.test.js`. |
