# Sprint 2 — 5–9 November 2026

## Current evidence update — 11 November 2026

Atharv will record and upload the two-minute Sprint 2 demo later. No recorded Sprint 2 video or repository upload is claimed. See [Part 3 delivery](../testing/README.md) for updated specifications, QA evidence and remaining review/scope checks. Earlier progress entries below are historical, not current GitHub issue/PR status claims.

## Goal and ownership

Deliver supplier management and purchase orders/receipts, integrating the existing authentication, permissions, catalogue and atomic inventory services.

| Story | Owner | Points | Dependency |
| --- | --- | --- | --- |
| #15 — Supplier management | AtharvMitt | 3 | Existing #6/#7/#24 foundation |
| #16 — Purchase recording and stock-in | AtharvMitt | 5 | #15 supplier selection; #9 catalogue; #11 stock service |

GitHub Project 3 is the planning source. The existing assignees, estimates, iteration and Sprint 2 classification are preserved. Both stories move from Todo to In progress while implementation and review are underway.

## Delivery approach

Branch `feat/15-16-suppliers-purchases` integrates the dependent stories in one PR. Focused commits separate supplier management (#15), purchase schema/services/API (#16), React workflows/tests (#16), and traceability/verification documentation. The previously verified Vite workspace-resolution correction is a separate startup prerequisite commit; existing local changes are preserved.

Implementation PR: [#36 — supplier management and purchase receipts](https://github.com/AtharvMitt/Electronics-Store-Management/pull/36), authored by AtharvMitt and linked to both stories. Review requested from ofsadug and therealannaa. Project 3 confirms both stories remain In progress with their existing Sprint 2 classification, assignees and estimates.

Acceptance criteria were checked against the GitHub issue descriptions, SRS FR-PUR-001–009 and §14.3, the SRS role matrix, and the existing model/reference/stock contracts. [Feature contracts and acceptance evidence](../suppliers-purchases.md) describe the behavior and tested policies.

## Review and completion

Actual validation results are recorded in [verification](../verification.md) and the PR. Peer review is requested from the stock-service and authentication/permission owners. Stories remain open and In progress until review, applicable CI and merging satisfy the repository Definition of Done. A pushed branch or passing local tests alone is not completion. Retrospective outcomes must be recorded after actual team review.
