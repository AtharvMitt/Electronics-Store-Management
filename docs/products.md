# Product and category management — #9

Uses the existing Category, Product and Inventory models without a migration. SRS §10.2 (FR-PROD-001/002/003/004/006), §13.1, §14.2 and SAD §§8–9 define the fields, permissions and retention rules. Product search remains #10's responsibility; this story supplies the catalogue list and detail contract.

## Acceptance mapping

| Issue criterion | Implementation | Evidence |
| --- | --- | --- |
| Authorized create/view | Authenticated product/category routes; React catalogue in the existing dashboard | `products.test.js`: TC-PROD-01/03/04 and endpoint permission tests; client create/view tests |
| Edit records | Validated PATCH operations, category selection, exact prices | TC-PROD-01/03/04; client edit test |
| Respect deletion relationships | Products deactivate; used categories return 409 | TC-PROD-06; concurrent category deletion/reference test |
| Validate fields/values | Explicit field allowlists, types/ranges/lengths, references and unique indexes | Required/numeric, duplicate and reference tests |
| MongoDB persistence | Transactional product + zero stock creation; database-backed reads | Reload/direct-model assertions and forced rollback test |

## API contract

All routes require the existing session cookie. Response records use existing `_id`, camelCase fields and timestamps; lists return `{ products: [...] }` or `{ categories: [...] }`, mutations/detail return `{ product }` or `{ category }`.

| Route | Permission | Behavior |
| --- | --- | --- |
| GET `/api/products`, GET `/api/products/:id` | `products:view` | List all statuses / read one product |
| POST `/api/products` | `products:create` | Create ACTIVE product and exactly one zero-quantity inventory row atomically; 201 |
| PATCH `/api/products/:id` | `products:update` | Update supplied master fields; 200 |
| DELETE `/api/products/:id` | `products:deactivate` | Idempotent deactivation, retains product, stock and history; 200 |
| GET `/api/categories` | `products:view` | List categories |
| POST `/api/categories` | `products:create` | Create category; 201 |
| PATCH `/api/categories/:id` | `products:update` | Rename category; 200 |
| DELETE `/api/categories/:id` | `products:deactivate` | Delete only an unused category; 204 |

Product creation requires `sku` (1–40), `name` (1–150), `categoryId` (existing ObjectId), `sellingPriceMinor` and `minimumStock` (nonnegative safe integers). PATCH accepts a nonempty subset of these same fields. No endpoint accepts arbitrary status/stock/role fields. SKU is trimmed/uppercased and globally unique, including inactive records, per the existing database contract. Category bodies contain only `name` (trimmed 1–80), unique with the existing case-sensitive index. The React form converts a price with at most two decimal places to integer hundredths; API callers supply hundredths directly (123.45 → 12345).

Errors follow `{ error: { message } }`: 400 for invalid/missing/unknown fields or malformed IDs, 401 for no valid session, 403 for insufficient permission, 404 for nonexistent records/references, 409 for duplicate identifiers or categories in use, generic 500 for unexpected failures. The UI retains server feedback and refreshes after mutations; Refresh catalogue retries reads.

## Integrity and coordination

Product deletion always means retirement under SRS §13.1; a product with no history is also retained. Categories have no approved status field, so unused categories can be physically deleted and any category referenced by an active or inactive product is protected. React only hides actions; backend permissions remain authoritative. Stock cannot be edited through product master data.

Product creation/reclassification and category deletion write the category's existing `__v` field in their transaction before checking/writing references. This produces a write conflict and retry for concurrent reference/deletion attempts; a snapshot read alone would allow an orphan. Product creation rolls back if inventory creation fails. Existing validators, indexes, models and historical guards remain unchanged.

#11 adjusts seeded/existing products using the shared models. Inventory search/filtering and low-stock logic are in #10/#19; see [their contracts](inventory-sales-reports.md). This #9 product slice does not include purchasing or sales workflows. React tests use the existing Node test runner, Vite JSX loader and a development-only jsdom dependency; `npm test` runs both workspaces through existing CI jobs.

Manual peer verification pending: log in as Admin, create a category/product, edit them, reload, deactivate the product and attempt deleting its category; repeat as Inventory (no retirement actions), Sales (view only), and logged out. Automated DOM tests cover creation, editing, refresh, hidden actions and error feedback; no real-browser or cross-browser result is claimed.
