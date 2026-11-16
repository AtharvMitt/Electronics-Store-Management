# Verification evidence

## Delivered baseline

Application delivery is recorded through `82ef87a` on 12 November 2026. The [QA index](testing/README.md) and [evidence provenance](testing/evidence/README.md) identify recorded runs, source hashes, peer reviews and limitations. Automated tests are in `server/tests/` and `client/tests/`; browser checks are in `scripts/qa-browser.mjs`.

| Evidence | Environment / source | Observed result |
| --- | --- | --- |
| [Committed QA run](testing/unit-test-report.md), 11 November | Arch Linux, Node 26.12.1, MongoDB 8.3.9; source `27e6e15`, isolated QA replica set on 27019 | 106 backend + 24 frontend passes; zero failures/skips; lint/build/whitespace passed |
| [Browser workflow](testing/system-validation-report.md), 11 November | Chromium 156.0.8078.73; 1440×1000 and 390×844 | Seven checks passed: login, supplier/order/receipt, sale/report refresh, search/clear, mobile-width navigation and logout |
| [Navigation PR #42](https://github.com/AtharvMitt/Electronics-Store-Management/pull/42), merged 9 November | Arch Linux / Brave-Chromium; implementation `cecf2ed` | Reported verification of seven page URLs, roles, drafts/retries, back/forward, keyboard focus and widths 320–1440; [four CI jobs passed](https://github.com/AtharvMitt/Electronics-Store-Management/actions/runs/42607762931) |
| [Windows coverage PR #44](https://github.com/AtharvMitt/Electronics-Store-Management/pull/44), 12 November | Windows 11, Node 24.13.0, MongoDB 8.3.11; `c9616ba` | Author reports 106 + 24 passes for coverage and normal tests; lint passed; Windows raw coverage was not committed |
| [PR #44 CI](https://github.com/AtharvMitt/Electronics-Store-Management/actions/runs/43186995293) | Linux lint/build and real database tests; native Windows 2025 and macOS 15 | All four jobs passed; CI runs normal tests, not `test:coverage` or the browser script |

The committed backend coverage is 98.89% lines, 99.01% functions and 94.39% branches. Client measurements cover only `api.js`: 85.00% lines, 32.14% functions and 94.12% branches. JSX and server startup are unmeasured; see the [code](testing/code-coverage-report.md) and [branch](testing/branch-coverage-report.md) reports.

## Defects reproduced and resolved

| Defect | Reproduction and correction | Retest evidence |
| --- | --- | --- |
| Sale transaction retry reset | Baseline `4dc6b3e` failed competing-sale and forced-transient-conflict tests because strict embedded sale items had an implicit version key. `versionKey: false` fixed reset/abort handling | 10 passed / 2 failed before; all 12 focused tests passed after. Full suite at that stage: 104 backend + 20 frontend. [Stock consistency](stock-consistency.md), merged [PR #40](https://github.com/AtharvMitt/Electronics-Store-Management/pull/40) |
| Windows coverage reporter path | Plain Windows path caused `ERR_UNSUPPORTED_ESM_URL_SCHEME`; reporter now uses `pathToFileURL` | Successful Windows coverage reported in PR #44 |
| Instrumented volume-test timing | Windows inventory report took 5407 ms against a 5000 ms budget under coverage. Test now allows 15000 ms when NODE_V8_COVERAGE is set, otherwise 5000 ms | PR #44 reports both coverage and normal test runs passing |

## Review and acceptance

Annamalai (`therealannaa`) approved the QA mapping/reports in [PR #43](https://github.com/AtharvMitt/Electronics-Store-Management/pull/43) on 12 November. AtharvMitt approved PR #44 the same day. Merges are `01ad563` and `82ef87a` respectively. These approvals do not accept the deferred account/history workflows or partial purchase reporting.

Firefox/Edge workflow results, trained-user acceptance, deployed HTTPS/database privileges and an uptime observation window are not recorded. [System validation](testing/system-validation-report.md) gives the current dispositions and manual procedures.
