# Stock adjustment contract — #11

SRS FR-INV-002/003/005, BR-002/010/012, NFR-009/012, §§13.1/14.2 and SAD §§8–10 require authorized signed changes, nonnegative stock, reason, responsible user/time, and atomic stock/history persistence. This uses existing MongoDB models and the replica set; no migration is needed.

## Acceptance mapping

| Issue criterion | Implementation | Automated evidence |
| --- | --- | --- |
| Authorized changes target correct product | Session/permission middleware; service actor lookup; product-specific writes | TC-INV-02, authorization and correct-product/persistence tests |
| Invalid quantities rejected | Signed safe integers, source direction checks, strict HTTP allowlist | Malformed/unsafe quantity and unsupported-operation tests |
| Persist and appear in inventory | Transactional write, read endpoint and React refresh | New HTTP read and MongoDB assertions; React submit/reload tests |
| Prevent negative stock | Guarded `$inc`, sufficient-stock bounds and database validators | TC-INV-03, zero/depletion/overflow and competing-removal tests |
| Reusable by #16/#18 | Independent service, caller transactions and source/actor validation | Direct service, caller rollback, source-fixture and audit-failure tests |

Tests: `server/tests/inventory.test.js` and `client/tests/inventory-ui.test.js`. Minimal FR-INV-001 active-stock display supports persisted-quantity verification. Inventory search/filtering and low-stock monitoring are now implemented under #10/#19. No FR-INV-006/history browsing is claimed; #17 now integrates SALE source writes while purchase receipt remains in #16.

## HTTP and UI

`GET /api/inventory` requires `requireAuth` and `inventory:view`. Returns `{ inventory: [{ _id, productId, sku, name, availableQty, updatedAt }] }` for existing active-product stock rows. An aggregation joins stock/products in one read. Missing stock rows are not created implicitly.

`POST /api/inventory/:productId/adjustments` requires `requireAuth` and `inventory:adjust` (Admin/Inventory only). Body contains only:

```json
{ "changeQty": -2, "reason": "Damaged units removed" }
```

`changeQty` is a signed safe integer, including zero. Reason is trimmed, required, 1–250 characters. Positive adds, negative removes; zero retains the balance and appends a count-confirmation audit event, consistent with the signed-integer schema. This never sets an absolute quantity or clamps values. Unknown fields/operations (including client actor/source/role fields) return 400. Actor comes from the session. Existing Manager policy remains denied until team agreement.

201 returns `{ inventory, transaction }` with shared model fields/timestamps; adjustment `sourceId` equals its generated `_id`. Errors use `{ error: { message } }`: 400 invalid input/ID, 401 no session, 403 no permission, 404 missing product, 409 insufficient stock/overflow/inactive product/missing inventory, generic 500 unexpected failure. A missing stock row requires administrator repair under the product/stock creation contract; no upsert occurs.

The dashboard shows active stock; permitted users get product selection, quantity-change/reason inputs and a save action. Errors retain failed inputs. Controls disable while saving. Successful changes refresh persisted stock. A refresh failure after commit explicitly says the adjustment was saved and provides a read-only retry, avoiding a suggestion to submit twice.

## Reusable backend contract

`server/src/modules/inventory/service.js` exports:

```js
await adjustStock({ productId, changeQty, reason, createdBy });

await mongoose.connection.transaction(async (session) => {
  // #16/#18 create/update their own source document using this session first.
  await applyStockChange({
    productId, changeQty, createdBy,
    sourceType: 'PURCHASE', // or SALE; adjustStock uses ADJUSTMENT
    sourceId: purchase._id,
  }, { session });
  // Other source/item writes must use the same session, sequentially.
});
```

Without a session the service owns its transaction. Supplied sessions must be in an active transaction; the caller owns successful commit. A failure after stock work aborts a supplied transaction too, preventing a caller from catching an audit failure and committing only stock. Propagate failures to the outer transaction. Do not run parallel operations on one session.

The service reloads `createdBy` and requires an ACTIVE actor with the source permission: ADJUSTMENT → `inventory:adjust`, PURCHASE → `purchases:receive`, SALE → `sales:create`. Caller role claims are ignored. PURCHASE deltas must be positive, SALE negative. Source documents must exist, including when created in the same session, under existing history reference hooks. #16/#18 own source-line validation, receipt/sale semantics, totals and business retry/idempotency handling. There are no public purchase/sale routes or unrestricted source-type endpoints.

## Atomicity, concurrency and coordination

One transaction validates the actor, writes the ACTIVE product's existing `__v`, conditionally increments its one stock row, then appends history. Negative deltas require sufficient stock; positive deltas require room below `Number.MAX_SAFE_INTEGER`. Database validators remain the final value guard. The product write serializes changes against retirement. Concurrent adjustments conflict and retry through the standard transaction helper; no stale read/absolute-set stock update occurs. Audit failures roll back stock, and an outer source failure rolls back both stock/history.

Decisions for review: zero changes are audited count confirmations; retired products reject new changes (409), retaining balances/history. The latter is a conservative lifecycle policy consistent with retirement, not a separately numbered SRS requirement. Unique stock rows/no implicit repair follow `docs/database.md`.

No dependency on #9's branch/endpoints: tests use existing shared-model fixtures, and the UI works with documented seeds. Both independent branches add identical minimal Node/jsdom test tooling; no #9 feature commits/code are included. Coordinate `/api/inventory` and dashboard placement with #10/#19 to share the read contract without duplicate screens.

Manual peer verification pending: adjust a seeded product as Admin/Inventory, reload, attempt an insufficient-stock removal, then verify Sales/Manager can view but cannot adjust. No real-browser/cross-browser or integrated Sprint 2 result is claimed.
