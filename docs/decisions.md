# Implementation decisions

## 2026-10-29 — Current baseline

The project owner explicitly selected **MERN, Tailwind CSS, two sprints, GitHub Projects, and GitHub Actions** during implementation planning. Preserve the submitted PDFs as original artifacts; this record explains the implementation changes. No faculty approval is claimed.

| Submitted design | Current decision |
| --- | --- |
| React/JavaScript | React/JavaScript with Vite and Tailwind CSS |
| Django REST Framework/Python | Express/Node.js with JavaScript ES modules |
| PostgreSQL | MongoDB/Mongoose; validators, indexes, and reference-validation services |
| Jira | Existing GitHub Project 3 and issues |
| Jenkins | GitHub Actions |
| pytest | Node.js test runner and Supertest; frontend tests added with actual features |
| Six-sprint schedule | Sprint 1: 28 October–4 November; Sprint 2: 4–11 November 2026 |
| SonarQube or similar | ESLint initially; no deployed SonarQube service claimed |

Business scope and verified requirement IDs remain the baseline. The technology/physical data design changes; required behavior remains.

## Architecture and ownership

React calls JSON REST endpoints under `/api`. Express routes delegate to module services, which own reference checks, authorization integration, and transaction boundaries. Only the backend accesses MongoDB. Foundation health/readiness routes are public; business routes must add authentication and server-side permissions in their owning stories.

| Area | Owner / issues |
| --- | --- |
| Authentication/permissions | Annamalai — #6, #7 |
| Products/categories and stock services | Apurv — #9, #11 |
| Inventory listing/search and low-stock monitoring | Avaneesh — #10, #19 |
| Application/database/CI foundation | Atharv — #8, #24, #12 |
| Suppliers/purchase receipts | Atharv — Sprint 2 #15, #16 |

Shared models belong to the schema story. Feature owners extend these through reviewed PRs rather than defining competing collections. User/role schema and seeds provide an initial contract for Annamalai; login, sessions and permissions remain his features.

## Database decision

Reuse installed MongoDB binaries with an isolated loopback project instance on 27018, storing data in ignored `.local/mongodb/`. Use a replica set for future atomic purchase/sale/inventory/history updates (NFR-009). Leave system services and existing data untouched.

MongoDB validators/indexes enforce document values and key uniqueness. Application services enforce cross-collection references and historical-record preservation (FR-COM-005, BR-009). Issue #24's relational terminology must be explicitly adapted to this decision.
