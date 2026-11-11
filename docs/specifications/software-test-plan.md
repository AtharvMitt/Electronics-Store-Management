# TechZone — Software Test Plan

Team 9 · Revision 2.0 · 11 November 2026 · Part 3 Testing & QA

## 1. Purpose and document control

Validate the delivered internal store against the [revised SRS](software-requirements-specification.md) and [SAD](software-architecture-design.md), retaining traceability to the originally submitted Part III Test Plan. All 65 original unique IDs remain; TC-PUR-06 is added for the omitted receipt-recording requirement FR-PUR-006, making 66 cases. The original repeated TC-SEC-03 counts once. No faculty approval of deviations or unmet baseline scope is claimed.

This plan replaces the original technology/routes/procedures for the current delivery. It does not convert an absent feature into a pass. Case results distinguish PASS, PARTIAL, DEFERRED, N/A and PENDING. The original PDFs remain history.

## 2. Scope and test items

Authentication, server permissions, products/categories, inventory/search/adjustment/low stock, suppliers, purchase orders/partial/full receipts, sales, reports, common messages/integrity, security snapshot review and measurable local NFRs. Tests include unit/API-client, service, HTTP/database integration, React/jsdom component and ordered workflow checks. Real-browser automation is separate evidence.

Unimplemented baseline items are explicitly tracked: FR-AUTH-006 account mutations; FR-INV-006 history filters; FR-REP-003 dedicated aggregate purchase report. Production HTTPS, least-privilege deployed DB credentials and 99% observed availability cannot be validated against the local-only deployment. Firefox and Edge checks remain pending.

## 3. Strategy and levels

| Level / method | Actual tools and coverage |
| --- | --- |
| Unit and deterministic contracts | Node built-in test runner, assert and mocks; permission matrix, API adapter/errors, validation helpers |
| Service/database integration | Real MongoDB validators/indexes/transactions; source/actor integrity; forced rollback and retries |
| HTTP/system integration | Supertest against createApp; authenticated role matrix, valid/invalid input, concurrent requests |
| Frontend components | React act, jsdom and Vite SSR; forms, role visibility, filter/clear, errors and saved-write retries |
| End-to-end API | 12 ordered store steps in server/tests/end-to-end.test.js |
| Browser workflow | Installed Chromium/ChromeDriver via scripts/qa-browser.mjs; actual UI and API with temporary data |
| Performance and volume | 100 warmed sequential authenticated reads; 10000 products and 100000 schema-validated audit records |
| Static/snapshot review | ESLint, Vite build, Git whitespace checks, source module boundaries, client secret inspection |

No new test/coverage package is introduced. Node coverage instruments imported code visible to its runtime; Vite SSR JSX does not yield a whole-client coverage result. Reports identify every unmeasured source file. Backend startup is outside the imported test scope. Tests are not called purely isolated units when they use a database or browser.

## 4. Environment, data and entry criteria

Node >=24, npm dependencies installed from lockfile and reachable MongoDB replica set. Set TEST_MONGODB_URI to a dedicated test environment. Test files always override its database name with unique `techzone_test_*` databases and drop only those databases. Never point tests at application data. This execution used Arch Linux, Node 26.12.1 and MongoDB 8.3.9, with isolated QA replica set techzone-qa at 127.0.0.1:27019.

Fixtures use synthetic staff/product/supplier records and generated passwords; no real customer data. Exact money boundaries, negative/fractional/unsafe quantities, inactive references, inclusive date boundaries, empty results and duplicate retries are represented. Fault injection controls second-line audit writes, receipt persistence and transient transaction retry failures. Raw state before/after rejection/rollback is compared in consistency tests.

The normal response-time workload is 20 reads each for products, inventory, suppliers, purchases and inventory reports, after warm-up, concurrency 1, a small local fixture, excluding login/hash and public network time. Require at least 95/100 within 2000 ms. The volume workload uses 10000 products/stock rows and ten +1 adjustment events per product (100000 total), reconciling to 10 units per product. Search, full inventory report and stock adjustment each have a documented local 5000 ms usability budget; this does not replace the separate response-time requirement or assert concurrent production scale.

## 5. Execution procedure and deliverables

From an up-to-date checkout, start the project replica set (`npm run db:start`) or use a separately configured test replica set. Existing dependencies and generated frontend assets are not committed. Execute:

```bash
npm run test:coverage
node scripts/qa-browser.mjs
node scripts/qa-review.mjs
node scripts/testing-reports.mjs
```

The browser script requires installed `chromedriver` and Chromium (default `/usr/bin/chromium`, overridable with QA_BROWSER_BINARY), free ports 5001/5174/9516 and loopback access. It creates a disposable seeded database, runs UI actions, deletes the browser session, closes servers and drops that database. Other browsers require the manual matrix in the system validation report. qa-review runs lint/build/whitespace checks and a bounded current client-secret/module review.

Reports: [Unit Test](../testing/unit-test-report.md), [System Validation](../testing/system-validation-report.md), [Code Coverage](../testing/code-coverage-report.md), [Branch Coverage](../testing/branch-coverage-report.md), and [consolidated cases](../testing/test-cases.md). Raw JSON, source hashes and LCOV reside in docs/testing/evidence. Report generation validates labelled automated PASS rows against passing tests and checks case uniqueness. The four area files are the editable case source; regenerate the combined table after edits.

## 6. Roles, schedule and review

| Owner | Case source / responsibility | Reviewer |
| --- | --- | --- |
| Annamalai | auth-security.md; review authentication/security mapping and final report package | Atharv |
| Apurv | products-stock.md; products/stock/atomicity/messages/business rules | Avaneesh |
| Avaneesh | inventory-sales-reports.md; listing/sales/reports | Apurv |
| Atharv | purchases-common-nfr.md; purchases/common/NFR; integrated revised documents | Annamalai |

These are delivery assignments, not assertions that reviews occurred. The normal one-branch/one-PR/teammate-review process is superseded for this requested delivery by Atharv's explicit instruction to push directly to main using AtharvMitt. Peer review remains outstanding and is not fabricated.

Original Part 3 due date: 6 November 2026. Catch-up target: 12 November 2026 EOD IST. Run and document local QA on 11 November; teammate review, required browser matrix and document decisions by target EOD. Atharv owns uploading the already-recorded one-minute Sprint 1 video and recording/uploading the two-minute Sprint 2 video later. No video upload or recording is claimed here.

## 7. Pass/fail, exit, suspension and resumption criteria

An automated case passes only when its documented assertions pass in the recorded run. A review/manual case needs observed evidence, environment and steps. N/A requires a reason and scope; PARTIAL and DEFERRED retain baseline gaps. There is no invented minimum coverage percentage: report observed line/function/branch counts, uncovered paths and unmeasured files honestly.

Exit requires zero failed/cancelled/skipped required automated cases, successful lint/build, all 66 dispositions with evidence, four reports/raw coverage, updated SRS/SAD/STP, peer review and completion or explicit team acceptance of outstanding manual/scope issues. Local automation success alone does not satisfy full baseline acceptance. Suspend affected execution if replica-set setup, fixture isolation or environment fails; preserve diagnostics and rerun after correction. Do not mark a blocked/unrun scenario PASS.

## 8. Defect management and risk

Record requirement/TC, reproduction, environment, expected/actual behavior, severity, owner, fix and retest. Critical stock/integrity/authorization failures block demo acceptance. Known prior sale retry defect and verified fix are retained in docs/stock-consistency.md. This run's baseline scope gaps are listed in the system report; no issue closure, teammate approval or faculty waiver is inferred. A short local NFR sample and Chromium alone do not establish production performance/availability or all-browser support.

## 9. Full revised case inventory

The table below is generated from the four owner area files. Each row contains the original requirement, actual behavior, deviation, executable evidence/procedure and current result. The execution report additionally lists per-use-case results and the pending manual matrix.

<!-- GENERATED CASE TABLE -->
