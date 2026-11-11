# Part 3 — Testing & QA delivery

Updated 11 November 2026. Original deadline: 6 November. Catch-up target: **12 November 2026 EOD IST**. This package updates the documents and records actual local QA; it does not claim that pending manual/review/video work is complete.

## Deliverables

| Item | Location |
| --- | --- |
| Updated IEEE-style SRS | [Markdown](../specifications/software-requirements-specification.md) / [PDF](../specifications/software-requirements-specification.pdf) |
| Updated SAD | [Markdown](../specifications/software-architecture-design.md) / [PDF](../specifications/software-architecture-design.pdf) |
| Updated Test Plan, including full case inventory | [Markdown](../specifications/software-test-plan.md) / [PDF](../specifications/software-test-plan.pdf) |
| Owner case mappings | [auth/security](test-cases/auth-security.md), [products/stock](test-cases/products-stock.md), [inventory/sales/reports](test-cases/inventory-sales-reports.md), [purchases/common/NFR](test-cases/purchases-common-nfr.md) |
| Joined case table | [66 cases: original 65 plus missing TC-PUR-06](test-cases.md) |
| Required four reports | [Unit Test](unit-test-report.md), [System Validation](system-validation-report.md), [Code Coverage](code-coverage-report.md), [Branch Coverage](branch-coverage-report.md) |
| Raw execution and coverage | [Evidence directory](evidence/), [LCOV](evidence/lcov.info), [source manifest](evidence/source-manifest.json) |

The root PDFs remain the original submissions. These revision-2 documents describe the actual delivered system and explicitly retain baseline gaps. No faculty approval, teammate review, production deployment or complete browser matrix is claimed.

## Remaining work and assigned owners

| Work | Owner | Status / next action |
| --- | --- | --- |
| Review auth/security mapping and reports | Annamalai; Atharv reviews auth mapping | Prepared centrally; teammate review pending |
| Review products/stock mapping | Apurv; reviewer Avaneesh | Mapping and automated evidence ready; review pending |
| Review inventory/sales/reports mapping | Avaneesh; reviewer Apurv | Decide deferred history filters and partial purchase report with owners |
| Review purchase/common/NFR mapping and revised documents | Atharv; reviewer Annamalai | Documents and local evidence ready; review pending |
| Firefox and Edge workflow matrix | Atharv, with teammates who have the browsers | Pending; use steps in system report and record actual versions/results |
| User administration mutations | Annamalai | FR-AUTH-006 baseline gap; decide implementation or explicit scope acceptance |
| General inventory-history filters | Apurv / Avaneesh | TC-INV-06 baseline gap; decide implementation or explicit scope acceptance |
| Dedicated purchase report and aggregate totals | Avaneesh / Atharv | TC-REP-03 partial; purchase-history filters/per-order totals exist |
| Sprint 1 one-minute video upload | Atharv | **Already recorded**, per Atharv; he will upload later |
| Sprint 2 two-minute video | Atharv | He will record and upload later |
| Final report refresh after any code changes | Annamalai, coordinated by Atharv | Rerun coverage/browser/review and regenerate reports; preserve tested source identity |

The direct-main commit is explicitly requested by Atharv and uses his Git identity. It replaces branch/PR delivery for this update only; it does not create a peer review record.

## Reproduce and refresh

Use the environment and commands in [Test Plan §5](../specifications/software-test-plan.md). `npm run test:coverage` uses Node built-in coverage and writes backend/client JSON plus LCOV. `node scripts/qa-browser.mjs` exercises a real Chromium workflow using disposable data. `node scripts/qa-review.mjs` runs lint/build/whitespace and snapshot reviews. `node scripts/testing-reports.mjs` joins area rows and generates four reports, rejecting unsupported automated PASS labels. `python scripts/render-specifications.py` creates print HTML; export that HTML with LibreOffice to regenerate the PDF companions.

The committed evidence describes its recorded source revision and hashes, not a future commit. Any business-code or test change requires new evidence. The Node coverage figures apply only to measured files; JSX and unimported startup files are listed separately.

## Demo preparation

Use synthetic seed data. Demonstrate login and role-specific actions; create an order without stock change; receive goods and observe stock; sell stock and observe inventory/report totals; show threshold equality, invalid input, over-receipt and no-oversell behavior; logout. The automated 12-step API flow and browser script provide a rehearsal. State the known user/history/purchase-report scope gaps accurately. Record/upload the two sprint videos separately; no generated video placeholder counts as a submitted video.
