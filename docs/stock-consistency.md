# Stock consistency and rollback — Story #26

Owner: ofsadug · Sprint 2 · 3 points · Epic #2.

`server/tests/stock-consistency.test.js` complements the merged #21 HTTP workflow by calling the purchase, receipt, sales and stock services directly against MongoDB. It reuses the existing implementation instead of introducing another stock mutation path. Sales use the existing `saleInput` → `recordSale` contract; purchases/receipts validate their own public service inputs. No Express or HTTP client is used in the new suite.

## Acceptance mapping

| #26 criterion | New service-level evidence |
| --- | --- |
| Purchases increase only intended products | Multi-item order creation leaves stock unchanged; receipt increases match the exact received lines, preserve an untouched control product, update purchase progress, and link the receipt to PURCHASE events with the correct source and actor. |
| Sales decrease only intended products | A multi-item sale deducts the exact requested quantities, leaves a control product unchanged and produces exactly the matching SALE events and actor/source IDs. |
| Invalid quantities and insufficient stock leave stock unchanged | Zero/negative/fractional/string/unsafe quantities, invalid source directions, later-line insufficient stock and over-receipt are rejected. Complete before/after snapshots of seven business collections remain identical. |
| Mid-operation failures roll everything back | Purchase and sale audit writes fail on the second line, after both stock mutations and the first audit event have been observed inside the transaction. A separate receipt-persistence failure occurs after both stock/history writes. Snapshots verify rollback of stock, reference versions, orders, progress, receipts, sales and history; retry then succeeds. |
| Retries do not duplicate stock changes | Concurrent and subsequent same-key creation/receipt/sale requests produce one record and one set of stock changes. Conflicting key reuse is rejected without writes. A forced transient write conflict retries the sale transaction once, discards the aborted audit event and commits only one sale/two final events. Competing distinct-key receipts/sales cannot over-receive or oversell. |
| Reproducible commands and results | Existing root lint/test/build commands discover the file automatically. Full-suite validation and the actual regression/fix are recorded in `docs/verification.md`. |

Verified SRS references: FR-PUR-006/007/008, FR-SALE-002/003/005, BR-002/006/007/008/012, NFR-004/009, §§14.3/14.4. The tests distinguish preflight rejection from rollback after writes have actually happened. They check source IDs and actors rather than only stock totals.

## Sale retry defect found and corrected

The baseline `4dc6b3e` fails both the competing-sale and forced-transient-conflict regressions. During a transaction retry Mongoose tries to reset `__v` on an embedded sale item whose strict schema does not contain that field. The resulting strict-mode error is masked by a second abort attempt, surfacing as `MongoTransactionError: Cannot call abortTransaction twice` instead of a successful transaction retry or a normal insufficient-stock conflict.

Setting `versionKey: false` on `saleItemSchema` makes its retry/reset behavior consistent with the existing embedded purchase/receipt schemas. The deterministic conflict test verifies actual stock writes in the first attempt, a successful retry, one persisted sale, two final history events and no leaked event from the aborted attempt. The competing-sale test verifies one success and one status-409 rejection. No persisted field format, migration, seed, dependency, permission or stock business rule changes.

## Running the checks

Start the documented local replica set and configure TEST_MONGODB_URI. From the repository root:

```bash
npm ci
npm run lint
npm test
npm run build
git diff --check
```

Run the new suite alone with:

```bash
node --test server/tests/stock-consistency.test.js
```

The suite creates a uniquely named `techzone_test_consistency_<random>` database, applies the real schema, builds its own user/product/supplier fixtures, and drops only that database. It does not reset application data or change development seeds. Failure hooks are restored after each test. Snapshot comparisons cover products, suppliers, inventory, inventory transactions, purchases, receipts and sales, including their saved quantities/statuses and reference versions.

The PR should use `Closes #26`. Human review and remote PR CI remain required before merging. GitHub CLI is read-only in this work session; issue/project state and PR creation remain manual.
