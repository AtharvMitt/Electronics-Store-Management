# Suppliers and purchase receipts — #15 and #16

Stories #15 (3 points) and #16 (5 points) belong to AtharvMitt under Epic #3 in Sprint 2. The GitHub issue checklists and submitted SRS are the acceptance baseline. This extends the existing MERN modules and the stock service from #11.

## Supplier management — #15

SRS FR-PUR-001/002, BR-004/009/010, §§13.1/14.3 and UC-05 require supplier creation, editing, viewing and deactivation. The supplier has a required name (1–150 characters), optional contactName (100), phone (30), email (254), address (250), and ACTIVE/INACTIVE status. Optional fields accept an empty string to clear a contact. Phone validation accepts 7–15 digits with an optional leading + and conventional separators; email validation rejects malformed addresses. Supplier names need not be unique in the SRS.

Migration `004-suppliers` creates the validated collection and status/name index. Run `npm run db:setup` to upgrade an existing database; no existing records are deleted and migrations 001–003 are unchanged.

All supplier routes require authentication. `GET /api/suppliers` and `GET /api/suppliers/:id` require `suppliers:view` (all five roles). List filters: literal, case-insensitive `search` over name/contact/email/phone, and `status=ALL|ACTIVE|INACTIVE`. Unknown or malformed filters return 400; no matches return an empty array.

`POST /api/suppliers`, `PATCH /api/suppliers/:id`, and `DELETE /api/suppliers/:id` require `suppliers:manage` (Admin/Purchase). DELETE deactivates rather than physically deleting the supplier. PATCH accepts the contact fields and status, including reactivation. Supplier IDs remain stable when details change. Invalid fields return 400, missing records 404, unauthenticated requests 401, and unauthorized roles 403.

The React Suppliers section offers creation/editing, active/inactive status, contact details, deactivation, filters and refresh. View-only roles receive the table and filters without mutation controls. Successful writes notify the dependent purchase selector; a failed read after a successful write explicitly tells the user the write was saved.

Supplier selection and preservation of historical purchase snapshots are integrated under companion story #16 in this feature branch. Tests: `server/tests/suppliers.test.js` and `client/tests/suppliers-ui.test.js`.

## Purchase orders and receipts — #16

Verified references: SRS FR-PUR-003–009, BR-004/005/006/009/010/011/012, NFR-004/009, §§13.1/14.3 and UC-06/07. SAD §§8–10 define the module/data/transaction architecture; the submitted test plan includes TC-PUR-03/04/05/07/08/09 and E2E-01. MongoDB orders with embedded items and a separate receipt collection implement the submitted relational fields under the existing MERN decision. Prices use integer minor units (1299 means 12.99).

Migration `005-purchase-orders-receipts` creates `purchases` and `purchaseReceipts`, validators, and unique order/request/history indexes. Upgrade from migrations 001–003 applies 004 and 005 without replacing existing records. Each order item has a generated `_id`, productId, SKU/name snapshot, orderedQty, receivedQty, unitCostMinor and exact lineTotalMinor. The order stores supplierId and a contact snapshot, orderDate, status, createdBy and totalMinor. Later supplier/product edits do not rewrite these snapshots or costs.

### API and authorization

All routes require authentication; the actor comes from the session. Services re-read the active actor and permission, including on idempotent replays.

| Method/path | Permission | Behavior |
| --- | --- | --- |
| `GET /api/purchases` | purchases:view | History with supplierId/from/to/status/orderNumber filters |
| `GET /api/purchases/:id` | purchases:view | Stored order, lines and receipt history |
| `POST /api/purchases` | purchases:manage | Create DRAFT/ORDERED; stock unchanged |
| `PATCH /api/purchases/:id` | purchases:manage | Edit/place/cancel an unreceived order |
| `POST /api/purchases/:id/receipts` | purchases:receive | Receive actual quantities and increase their stock |

All five roles can view. Admin/Purchase can create/edit/place/cancel/receive. Unknown fields, caller-supplied actors/totals/received counters, invalid references/dates, duplicate products, empty items, invalid quantities/costs and unsafe totals are rejected. Operations support 1–100 distinct product lines. History dates use inclusive UTC calendar days and filter orderDate. Empty results are successful; invalid/reversed/unknown filters return 400.

An order body contains supplierId, orderDate (`YYYY-MM-DD`), status (optional DRAFT/ORDERED; default ORDERED), and items:

```json
{ "supplierId": "<supplier ObjectId>", "orderDate": "2026-11-08", "status": "ORDERED", "items": [{ "productId": "<product ObjectId>", "orderedQty": 5, "unitCostMinor": 1299 }] }
```

A receipt body contains only the nonempty subset of lines actually received:

```json
{ "items": [{ "productId": "<product ObjectId>", "quantity": 2 }] }
```

Both POST operations require an `Idempotency-Key` header: 1–100 letters, digits, dots, underscores, colons or hyphens. Retry with the same key and original content. Fingerprints include actor and normalized/product-sorted input; receipt fingerprints also include the purchase ID. Durable unique indexes protect across concurrent requests and restarts. A replay identifies the original order/receipt and returns current purchase progress; a different body, actor or receipt purchase returns 409. An order replay still works after its details or receipt status change.

Errors: 400 malformed input, 401 unauthenticated, 403 forbidden, 404 missing references/records, 409 inactive/conflicting/terminal/over-received operations. No partial write is committed on failure.

### State and history rules

- New/edited orders require active suppliers; added/replaced product lines require active products. DRAFT can be edited, placed as ORDERED, or cancelled. ORDERED can be edited/cancelled before the first receipt, but cannot return to DRAFT.
- Only ORDERED/PARTIAL accepts receipts. Each quantity is an additional received amount bounded by ordered minus previously received. Unspecified lines remain unchanged. Zero/negative/fractional/excessive/duplicate/unknown lines are rejected.
- Receipts derive PARTIAL or RECEIVED from stored quantities. PARTIAL/RECEIVED/CANCELLED orders cannot be edited/cancelled. No over-receipt exception or reversal process is introduced.
- Inactive suppliers cannot be used for new/edited orders; already ordered goods may still be received. Product retirement blocks new stock changes through the existing #11 service. Historical records remain readable.
- Stable supplier IDs and snapshots preserve purchases across contact changes. Shared model guards prevent physical deletion of referenced suppliers, products, purchase actors or orders. Supplier HTTP deletion always means deactivation.

### Atomicity and UI

Creation touches the supplier/products within its transaction, serializing against deactivation and snapshot changes. Receipts lock the purchase before checking remaining quantities. Order progress, stock via `applyStockChange`, append-only PURCHASE inventory events and receipt persistence commit together. Later-line, audit, stock-boundary or receipt-write failures roll back every related write. Receipt event IDs must match product quantities, source purchase and actor; an inventory event cannot belong to two receipts.

The #11 stock service's eager abort contract is retained. The purchase service preserves ordinary domain errors after that abort and lets Mongo errors reach driver retry handling. Embedded snapshots/items disable version keys so strict Mongoose documents can reset correctly during transaction retries.

The React workflow provides active supplier/product selection, exact costs/totals, draft/order entry, editing/cancellation, supplier/date/status history filters, order details, partial receipts and receipt history. Supplier changes refresh selection without clearing history filters. Receipts refresh inventory, adjustment quantities, sale availability and inventory reports. View-only roles do not receive mutation controls; the server remains authoritative.

An uncertain POST response locks the original input and offers Retry purchase/Retry receipt with the original body/key. A confirmed write followed by a failed history read is reported as saved, with a read-only refresh. Retry state is in memory: after a page reload following an uncertain response, inspect order/receipt history before starting a replacement operation.

## Acceptance evidence

| Criterion | Automated evidence |
| --- | --- |
| #15 add/view/update and validate | Supplier API/UI tests: contacts, persistence, validation, role matrix, filters, editing/deactivation and saved-write refresh recovery |
| #15 select suppliers and preserve purchases | Purchase API/UI tests: active selection, stable snapshots, supplier editing/deactivation, historical access |
| #16 validate supplier/details/quantities | Purchase API tests: references, dates, statuses, exact costs/totals, invalid/unknown fields and permissions |
| #16 successful receipt increases correct stock | Multi-item partial/full receipt tests assert stored stock, quantities, actor/source events and receipt links |
| #16 failures leave no partial updates | Forced second-line audit and receipt-write failures assert unchanged order/stock/history/receipt data, then successful retry |
| #16 view purchase records | Stored detail, receipt history, view-only permissions and supplier/date/status filters |
| NFR-004/009 and FR-PUR-008 | Concurrent retries, cross-order key reuse, competing receipts, missing-stock/overflow/inactive cases, MongoDB validators and non-destructive migration upgrade |

Run the existing root `npm run lint`, `npm test`, and `npm run build` with the local MongoDB replica set running. New files: `server/tests/suppliers.test.js`, `server/tests/purchases.test.js`, `client/tests/suppliers-ui.test.js`, `client/tests/purchases-ui.test.js`. API tests create/drop only uniquely named test databases. Existing #11 source fixtures now satisfy the actual purchase schema without bypassing validators or weakening assertions.
