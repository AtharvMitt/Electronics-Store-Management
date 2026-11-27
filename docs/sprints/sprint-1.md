# Sprint 1 — 28 October–4 November 2026

## Goal and delivered work

Establish the application/database/CI foundation and deliver authentication, permissions, products/categories and stock adjustment. Inventory search and low-stock monitoring were planned for this sprint but merged on 6 November, during Sprint 2.

| Area / stories | Owner | Integrated evidence |
| --- | --- | --- |
| Application setup #8 | Atharv | [PR #27](https://github.com/AtharvMitt/Electronics-Store-Management/pull/27), merged 29 October, `7099053` |
| CI #12 | Atharv | [PR #28](https://github.com/AtharvMitt/Electronics-Store-Management/pull/28), merged 30 October, `c68565c` |
| Schema and seeds #24 | Atharv | [PR #30](https://github.com/AtharvMitt/Electronics-Store-Management/pull/30), merged 30 October, `0f35b04` |
| Login/logout #6 and permissions #7 | Annamalai | [PR #31](https://github.com/AtharvMitt/Electronics-Store-Management/pull/31) / [#32](https://github.com/AtharvMitt/Electronics-Store-Management/pull/32), merged 31 October, `d2e47d0` / `71c660e` |
| Products/categories #9 and stock services #11 | Apurv | [PR #33](https://github.com/AtharvMitt/Electronics-Store-Management/pull/33) / [#34](https://github.com/AtharvMitt/Electronics-Store-Management/pull/34), merged 1 November, `fbe2d41` / `c7b3a9a` |
| Inventory search #10 and low stock #19 | Avaneesh | Carried into [PR #35](https://github.com/AtharvMitt/Electronics-Store-Management/pull/35), merged 6 November, `da9cdd2` |

## Verification and scope

Foundation verification covered native Linux, Windows and macOS startup/CI, real database readiness, schema/index constraints, seed replay and transaction rollback. Feature tests covered sessions, permissions, product/category writes and stock/history integrity. [Verification](../verification.md) links the integrated QA results; the [traceability table](../traceability.md) connects stories to requirements and tests.

Administrative account mutations (FR-AUTH-006) and general inventory-history filtering (FR-INV-006) were not delivered. The Team page is read-only and stock history is verified through database/service tests.

## Review and submission evidence

Merged implementation PRs are linked above. Atharv reported on 11 November that the one-minute Sprint 1 video was recorded; no uploaded video link is recorded in this repository. A completed sprint retrospective is not recorded. These submission records are separate from implementation merge status.
