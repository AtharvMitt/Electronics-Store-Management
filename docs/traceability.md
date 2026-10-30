# Implementation traceability

IDs below are verified in the submitted SRS. SAD/STP are Parts II/III of `Team_9_TechZone_Final_Project_Documentation.pdf`. Planned paths/test labels in those PDFs are not completed implementation evidence.

| Issue | Requirement/source | Implementation and verification |
| --- | --- | --- |
| #8 | SRS §§6–8; SAD §§3, 6, 13 | MERN workspace, environment configuration, MongoDB helper; `server/tests/foundation.test.js` checks real readiness |
| #8 | SEC-007 | Server-only database URI, ignored `.env`; inspect configuration/client build |
| #12 | NFR-005, NFR-006, NFR-011 | `.github/workflows/ci.yml`: lint/frontend build and real API/database tests; setup in `docs/ci.md` |
| #24 | SRS §14; FR-PROD-002; FR-COM-005; BR-001, BR-002, BR-009; SEC-002 | `database/definitions.js`, `models.js`, `setup.js`, `seed.js`; `shared/references.js` and `passwords.js`; schema tests independently check validators, indexes, references and seed behavior |
| #24 | NFR-009, NFR-012; BR-012 | History records source/user/time; schema test forces rollback of related database writes; actual purchase/sale/adjustment services remain in feature issues |

Low stock includes equality: `available quantity <= minimum stock` (BR-003, FR-INV-004), to be covered by #19. Referenced products/suppliers are deactivated instead of deleting history (FR-PROD-006, BR-009).

The original RTMs/STP have inconsistent planned test labels for atomicity (TC-NFR-09 versus TC-NFR-08). Use **NFR-009** as the stable reference and link actual test names/results during implementation.
