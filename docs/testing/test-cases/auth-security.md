# Annamalai — auth security test cases

Updated 11 November 2026 against the implementation. Prepared centrally for the requested direct-main QA delivery; owner names identify review responsibility, not authorship or completed teammate review.

| TC ID | Requirement | What we test now | Change from original plan | Automated test / manual steps | Result |
| --- | --- | --- | --- | --- | --- |
| TC-AUTH-01 | FR-AUTH-001 | Active user logs in and receives a session/user role. | Cookie session via POST /api/auth/login; React workspace instead of planned Django dashboard. | server/tests/auth.test.js; scripts/qa-browser.mjs | PASS (automated) |
| TC-AUTH-02 | FR-AUTH-002 | Wrong password and unknown email both return 401. | Express JSON error and no authenticated session. | server/tests/auth.test.js | PASS (automated) |
| TC-AUTH-03 | FR-AUTH-003 / SEC-009 | Inactive login and subsequent deactivation deny access. | Mongoose user status checked on every session request. | server/tests/auth.test.js | PASS (automated) |
| TC-AUTH-04 | FR-AUTH-004 | Logout deletes session; old cookie cannot authorize. | POST /api/auth/logout returns 204. | server/tests/auth.test.js; scripts/qa-browser.mjs | PASS (automated) |
| TC-AUTH-05 | FR-AUTH-005 | Stored role is read from the database; role changes apply next request. | Role association tested through model updates; account creation/edit UI/API (FR-AUTH-006) is deferred. | server/tests/permissions.test.js | PASS (automated) |
| TC-SEC-01 | SEC-001 | Protected API requests without a session return 401. | HttpOnly cookie and requireAuth middleware. | server/tests/auth.test.js; client/tests/api.test.js | PASS (automated) |
| TC-SEC-02 | SEC-002 | Salted scrypt hashes verify passwords; hashes hidden from user output. | Node crypto scrypt replaces Django password handling. | server/tests/schema.test.js; server/tests/auth.test.js | PASS (automated) |
| TC-SEC-03 | SEC-003 | Every role/permission and Sprint 2 operation is checked by server. | Express permission guards; five roles. | server/tests/permissions.test.js; server/tests/permission-regression.test.js | PASS (automated) |
| TC-SEC-04 | SEC-004 | Forged client role information cannot raise permissions. | Stored user role is authoritative. | server/tests/permissions.test.js | PASS (automated) |
| TC-SEC-05 | SEC-005 | Review production HTTPS scope and secure cookie configuration. | Only loopback HTTP development deployment exists; no TLS deployment to inspect. | server/src/modules/auth/sessions.js; production check requires HTTPS URL, certificate and network inspection. | N/A (production deployment absent) |
| TC-SEC-06 | SEC-006 | Malformed types, unknown fields and literal search inputs are rejected or safely handled. | Mongoose/Express validation replaces SQL/Django sanitization. | server/tests/products.test.js; server/tests/suppliers.test.js | PASS (automated) |
| TC-SEC-07 | SEC-007 | Inspect tracked files, client source and production assets for database/seed secrets. | Vite client uses relative /api; server-only dotenv; .env ignored. | docs/testing/evidence/security-review.json; scripts/qa-review.mjs | PASS (review) |
| TC-SEC-08 | SEC-008 | Unknown/wrong-password logins return the same status/message. | Decoy scrypt hash used for unknown users; timing equivalence is not asserted. | server/tests/auth.test.js | PASS (automated) |
| TC-SEC-09 | SEC-009 | Inactive account cannot authenticate. | Same generic 401 as other failed logins. | server/tests/auth.test.js | PASS (automated) |
| TC-SEC-10 | SEC-010 | Review least-privilege production database credentials. | Local QA replica set is isolated and has no authentication; production privileges are unverified. | Requires deployed application DB user and privilege inspection. | N/A (production deployment absent) |
