# Test procedures and supplemental traceability

## Reproducing automated cases

Preconditions: Node >=24, dependencies installed with `npm ci`, and TEST_MONGODB_URI configured for a dedicated MongoDB replica set. Follow the root [setup guide](../../README.md). Automated suites create their own synthetic records/passwords; they do not require manual seeding of the application database. Data-writing backend suites create and remove unique test databases. The foundation readiness check only connects and pings. Frontend component tests use mocked APIs and jsdom rather than a live store database.

From the repository root:

```bash
npm test
npm test -w server
npm test -w client
node --test --test-concurrency=1 server/tests/end-to-end.test.js
node --test --test-concurrency=1 server/tests/stock-consistency.test.js
```

For a single suite, replace the final path with the relevant file in the [case catalogue](test-cases.md). Run frontend files through their workspace, for example `npm test -w client -- tests/purchases-ui.test.js`. Run the entire end-to-end file in order; its steps intentionally share workflow state. Browser and static-review checks are separate commands in [Test Plan §5](../specifications/software-test-plan.md).

Each executable test's `before`/fixture setup defines exact inputs; its named `test(...)` block defines the procedure and `assert`/HTTP `expect` calls define expected results. TC labels can identify several assertions in one block. The case catalogue maps acceptance scenarios to these files, and [raw server](evidence/server-results.json) / [raw client](evidence/client-results.json) results record exact executed test names and PASS/FAIL. A scenario is not established by a matching name alone: its assertions and documented scope must agree.

## Fixtures, actions and expected results

| Case group | Preconditions / test data | Procedure and expected result |
| --- | --- | --- |
| TC-AUTH-01–04; TC-SEC-01/08/09 | Generated active/inactive users, password and session cookies in `auth.test.js` | Submit valid, wrong, unknown and inactive credentials; inspect session/user output; logout or deactivate. Valid active login succeeds; invalid/inactive login is generic 401; protected calls reject absent, expired and revoked sessions. |
| TC-AUTH-05; TC-SEC-03/04 | Five stored roles and logged-in agents in `permissions.test.js` / `permission-regression.test.js` | Exercise permission matrix, change a stored role, and forge client roles. Next request uses the stored role; denied operations return 403 without writes. This does not test an account administration UI. |
| TC-SEC-02 | Synthetic seed users in `schema.test.js`; session records in `auth.test.js` | Verify salted password hashes, valid/wrong password behavior and public user output. Plaintext passwords/hashes are absent from public user output; only token hashes are stored for sessions. |
| TC-PROD-01–04/06; TC-COM-01; TC-SEC-06 | Fresh category, generated SKU and all-role cookies in `products.test.js`; supplier fixtures in `suppliers.test.js` | Create/read/edit records; submit missing, duplicate, malformed and unknown fields; retire a referenced product. Valid writes persist, create one zero-stock row and normalize SKU; invalid writes fail; retirement retains history; referenced category deletion fails. |
| TC-PROD-05; TC-INV-01/04; TC-BR-03 | Stored products, categories and boundary quantities in `inventory.test.js` | Search name/SKU/category, apply/clear filters and compare values to database records. Search is literal; empty matches return an empty list; quantity equal to minimum is low stock and quantity above minimum is not. |
| TC-INV-02/03; TC-NFR-11 | Selected product, control product, valid actor and reason in `inventory.test.js` | Increase/decrease stock, confirm zero change, attempt below-zero/invalid changes and inspect history. Valid changes target one product and record source/actor/time/reason; rejected changes leave stock/history unchanged. |
| TC-INV-05 | Complete purchase/adjustment/sale workflow in `end-to-end.test.js` | Sum stored stock events for each product and check source/actor links. Sum equals current quantity; every event belongs to the expected actor/source. This is database verification, not history-filter UI verification. |
| TC-PUR-01/02; TC-COM-05 | Supplier contacts and linked order snapshots in `suppliers.test.js` / `purchases.test.js` | Create/edit/deactivate supplier and reload old order. Contacts persist and history/snapshots remain stable; new orders require an active supplier, while an existing ordered purchase can receive after supplier deactivation. |
| TC-PUR-03–08 | Active supplier/products and multi-item orders in `purchases.test.js` | Create order, calculate totals, receive partially then fully, and attempt invalid/over-receipts. Ordering leaves stock unchanged; each receipt adds only received quantities; progress becomes PARTIAL/RECEIVED; invalid or excess quantities commit nothing. |
| TC-PUR-09 | Orders on known dates with differing supplier/status in `purchases.test.js`; mocked purchase history in `purchases-ui.test.js` | Filter supplier, inclusive from/to dates and status; clear filters. Matching boundaries are included, malformed filters fail, and clearing restores the unfiltered request. |
| TC-SALE-01–07; TC-BR-08 | Stored stock and prices in `sales-reports.test.js` | Record multi-item sale, retrieve/filter it, attempt invalid or insufficient quantities, and retry with same key. Totals use stored minor-unit prices; exact quantity is deducted once; transaction numbers differ; rejected sale leaves no partial records. |
| TC-REP-01/02/04/05 | Stored inventory and sale snapshots in `sales-reports.test.js` | Generate inventory/low-stock/sales reports, apply date/category/status filters and request no-match results. Values reconcile to stored records; empty totals are zero; permissions are enforced. Purchase aggregate reporting is excluded. |
| TC-COM-02/03; TC-NFR-09 | Mocked lost-response and failed-refresh states in `purchases-ui.test.js` / `api.test.js` | Submit over-receipt, retry an uncertain receipt and fail the read after a confirmed write. Invalid input explains correction; retry keeps original body/key; confirmed save is acknowledged and read refresh does not submit again. |
| TC-COM-04 | Supplier/filter fixtures in `suppliers-ui.test.js`; real browser synthetic records | Search for no match, then clear. Explicit empty-state feedback appears; clearing restores records. |
| TC-NFR-03/08 | Multiple products and control records in `purchases.test.js` / `stock-consistency.test.js` | Repeat/concurrently retry keys; inject later audit/receipt failures after observing in-flight writes. One committed operation changes stock once; conflicting keys fail; complete persisted snapshots remain unchanged on rollback. |
| TC-NFR-01 | Small synthetic fixture, warmed authentication, five read routes | `non-functional.test.js` performs 100 sequential reads; at least 95 must finish within 2000 ms. Login/fixture time and production network latency are excluded. |
| TC-NFR-07 | 10000 products, stock rows and 100000 schema-validated audit events | Search, full inventory report and adjustment must each finish within 5000 ms normally or 15000 ms when NODE_V8_COVERAGE is set. Dataset counts and reconciliation are asserted. The 11 November recorded run used 5000 ms. |
| TC-SEC-07; TC-NFR-04/05/10 | Built client, tracked files, modules, test output and PR reviews | Review client-secret exposure/module structure, suite completion and review/CI records. Results apply to the recorded snapshot; they do not establish a historical secret audit or exhaustive architectural correctness. |

N/A and incomplete cases retain separate dispositions in the catalogue: TC-SEC-05/10 need a deployed environment, TC-NFR-02 needs an operating window, TC-NFR-06 needs Firefox/Edge execution, TC-INV-06 lacks the history API/UI, and TC-REP-03 lacks aggregate purchase reporting. Manual browser steps and required observation fields are in the [system report](system-validation-report.md).

## Original end-to-end scenario mapping

The original six E2E IDs are distinct from the 66 TC IDs. These scenarios map to the recorded automated workflows below; they are not additional test-runner executions.

| Original ID | Scenario | Executable mapping / expected result | Evidence |
| --- | --- | --- | --- |
| E2E-01 | Purchase-to-stock | `end-to-end.test.js`, steps 3–4 and 10: order leaves stock unchanged; partial/full receipt adds exactly received quantities and links history | PASS in 11 November run |
| E2E-02 | Sale-to-stock | Steps 6 and 10: unique sale, exact deductions and source/actor audit links; same-key retry deducts once | PASS in 11 November run |
| E2E-03 | Insufficient-stock protection | Steps 2 and 7: reject zero-stock/later-line failure without partial stock or sale writes | PASS in 11 November run |
| E2E-04 | Low-stock monitoring | Step 8: at/below minimum appears, including equality | PASS in 11 November run |
| E2E-05 | Role enforcement | `permission-regression.test.js`: all five roles across supplier/purchase/sale/report operations, valid denied writes and unauthenticated calls | PASS in 11 November run |
| E2E-06 | Reporting consistency | End-to-end step 9 verifies inventory/sales totals; purchase tests verify filtered per-order history. Dedicated aggregate purchase reporting is absent | PARTIAL for original purchase/sale reporting scope; TC-REP-03 remains partial |

## Requirements without an original dedicated TC

| Requirement | Acceptance procedure | Delivered result |
| --- | --- | --- |
| FR-AUTH-006 | As Admin, create a user, edit role/details, deactivate/reactivate, and verify restricted roles cannot mutate accounts | DEFERRED: no mutation endpoints or UI. Role-change/deactivation model tests do not substitute for this workflow. |
| NFR-003 | With a trained staff user logged in, request a known product and have them locate its quantity; record route/screens visited, user role, browser, date and result; require at most three primary screens | PENDING trained-user acceptance. Inventory has search and quantity on one screen, with component/browser search evidence, but no separate trained-user observation is recorded. |

## Manual demonstration rehearsal

This procedure is a repeatable rehearsal, not a claim of an additional executed test. Use synthetic development data and active seeded role accounts. Create unique product SKUs for each rehearsal; inspect existing history after an uncertain response before creating a replacement transaction.

1. As Inventory staff, create a category and a product with price 100.00 and minimum stock 2. Confirm initial stock is 0; Sales staff must not be able to sell one unit yet.
2. As Purchase staff, create a supplier and order 5 units at cost 60.00. Expected order total: 300.00; stock remains 0.
3. Receive 2 units, then the remaining 3. Expected stock: 2 then 5; order status: PARTIAL then RECEIVED. A further receipt must be rejected.
4. As Sales staff, sell 3 units. Expected sale total: 300.00 and stock: 2. A sale of 3 more units must be rejected without stock loss.
5. As Manager, inspect inventory/low-stock and sales reports. The product is low stock at equality (2 <= 2); reconcile the specific sale with stored history. Existing demo sales may contribute to date-range totals.
6. Verify Sales and Manager have no stock-adjustment controls, and log out. Protected API calls with the ended session must be rejected.

For Firefox/Edge acceptance, record actual versions, OS, date, steps and observations; a Chromium result cannot substitute for either browser.
