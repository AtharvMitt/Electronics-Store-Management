# Implementation traceability

IDs below are verified in the submitted SRS. SAD/STP are Parts II/III of `Team_9_TechZone_Final_Project_Documentation.pdf`. Planned paths/test labels in those PDFs are not completed implementation evidence.

| Issue | Requirement/source | Implementation and verification |
| --- | --- | --- |
| #9 | FR-PROD-001/002/003/004/006; SRS §§13.1, 14.2; SAD §§8–9; BR-001/009; SEC-003/004 | `modules/products/service.js` and `routes.js`, `ProductCatalogue.jsx`; `server/tests/products.test.js` (TC-PROD-01/02/03/04/06), `client/tests/products-ui.test.js`; contracts and acceptance mapping in `docs/products.md` |
| #9 | NFR-009; FR-COM-005 | Transactional product/zero-stock creation and category reference serialization; forced rollback and concurrent delete/reference integration tests |
| #8 | SRS §§6–8; SAD §§3, 6, 13 | MERN workspace, environment configuration, MongoDB helper; `server/tests/foundation.test.js` checks real readiness |
| #8 | SEC-007 | Server-only database URI, ignored `.env`; inspect configuration/client build |
| #12 | NFR-005, NFR-006, NFR-011 | `.github/workflows/ci.yml`: lint/frontend build and real API/database tests; setup in `docs/ci.md` |
| #24 | SRS §14; FR-PROD-002; FR-COM-005; BR-001, BR-002, BR-009; SEC-002 | `database/definitions.js`, `models.js`, `setup.js`, `seed.js`; `shared/references.js` and `passwords.js`; schema tests independently check validators, indexes, references and seed behavior |
| #6 | FR-AUTH-001, FR-AUTH-002, FR-AUTH-004; TC-AUTH-01, TC-AUTH-02, TC-AUTH-04 | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` in `modules/auth/`; login form in `client/src/LoginForm.jsx`; `server/tests/auth.test.js` |
| #6 | FR-AUTH-003, SEC-009; TC-AUTH-03 | Inactive accounts cannot log in, and deactivating a user ends their existing sessions; auth tests |
| #6 | SEC-001, SEC-002, SEC-005, SEC-008 | `requireAuth` middleware protects endpoints; only a SHA-256 hash of each session token is stored (migration `002-authentication-sessions`); HttpOnly, SameSite=Strict cookie, `Secure` when `NODE_ENV=production`; one message for unknown/wrong/inactive logins with a decoy hash check |
| #7 | SRS §13.1; FR-AUTH-005; BR-010 | Named permissions per role in `modules/auth/permissions.js` and `docs/permissions.md`; matrix test in `server/tests/permissions.test.js` |
| #7 | FR-AUTH-007, FR-AUTH-008, SEC-003; TC-SEC-03 | `requirePermission` middleware returns 403; every role × permission checked through real logged-in requests; `GET /api/users` limited to Admin/Manager |
| #7 | SEC-004; TC-SEC-04 | Client-supplied role data is ignored; the client only hides actions it lacks permission for |
| #24 | NFR-009, NFR-012; BR-012 | Base history records source/user/time and transaction-capable setup; schema tests verify rollback. Feature workflows are traced under #11, #16 and #17. |
| #10 | FR-INV-001, FR-PROD-005, FR-COM-004 and issue #10 category filter | `modules/inventory/routes.js` and `service.js`, `InventoryListing.jsx`; inventory integration/DOM tests cover stored quantities, name/SKU/category search, filters, clear, invalid and empty results |
| #19 | FR-INV-004, BR-003, FR-REP-002 | Inventory API/UI and `/api/reports/low-stock` calculate `availableQty <= minimumStock` from stored records; threshold and stock-change tests cover boundary behavior |
| #17 | FR-SALE-001–007, BR-007/008/011, NFR-004/009, SEC-003/004 | `modules/sales/`, `database/models.js`, migration `003-sales-records`, and `Sales.jsx`; `sales-reports.test.js` verifies permission, exact money, history filters, idempotency, stock validation and transaction rollback |
| #20 | FR-REP-001/002/004/005, SRS §§13.1/14.5 | `modules/reports/` and `Reports.jsx`; tests verify backend authorization, stored totals, inclusive dates, category/status filters and low-stock results |

Low stock includes equality: `available quantity <= minimum stock` (BR-003, FR-INV-004), implemented under #19. Referenced products/suppliers are deactivated instead of deleting history (FR-PROD-006, BR-009).

The original RTMs/STP have inconsistent planned test labels for atomicity (TC-NFR-09 versus TC-NFR-08). Use **NFR-009** as the stable reference and link actual test names/results during implementation.

Issue #11: SRS FR-INV-002/003/005, BR-002/010/012, NFR-009/012, SEC-003/004, §§13.1/14.2; SAD §§8–10 → `modules/inventory/service.js` and `routes.js`, `StockAdjustments.jsx`, `server/tests/inventory.test.js` (TC-INV-02/03), `client/tests/inventory-ui.test.js`. [Stock contracts](stock-adjustments.md) map its criteria. #10/#19 inventory listing and low-stock monitoring are documented in [inventory and sales contracts](inventory-sales-reports.md). Issue #17 now implements the SALE source contract; #16 purchase receipt integration remains separate.
