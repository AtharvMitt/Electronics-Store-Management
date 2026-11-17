# Recorded QA evidence

## Provenance

The JSON/LCOV files in this directory preserve the **11 November 2026 Linux execution** against source commit `27e6e1586cc3de32a600e0ed01a29cfd327003ac`. `run.json` records the environment and working tree; `source-manifest.json` records SHA-256 hashes of the 76 executable source, test, script and configuration files. Browser and static-review files carry their own execution timestamps.

| Artifact | Meaning |
| --- | --- |
| `server-results.json`, `client-results.json` | 106 backend and 24 frontend passing test-runner cases; coverage events and diagnostics |
| `browser-results.json` | Seven Chromium desktop/mobile-width workflow checks |
| `quality-checks.json` | Lint, build and Git whitespace output |
| `security-review.json` | Bounded module/client-secret inspection; not a penetration test |
| `server.lcov`, `client.lcov`, `lcov.info` | Per-workspace coverage and combined repository-relative LCOV |
| `run.json`, `source-manifest.json` | Recorded execution identity, environment and file hashes |

## Relationship to the delivered source

The delivered baseline is `82ef87a` on 12 November. Compared with the manifest, application source and all other listed files match except:

- `scripts/test-coverage.mjs`: the reporter path uses a file URL for Windows compatibility.
- `server/tests/non-functional.test.js`: volume operations allow 15000 ms when `NODE_V8_COVERAGE` is set, otherwise 5000 ms.

These changes were delivered in [PR #44](https://github.com/AtharvMitt/Electronics-Store-Management/pull/44), commit `c9616ba`. The PR records a Windows 11 / Node 24.13.0 / MongoDB 8.3.11 run with 106 backend and 24 frontend passes, 98.89% backend line coverage and 94.39% branch coverage. The four [CI jobs](https://github.com/AtharvMitt/Electronics-Store-Management/actions/runs/43186995293) passed. Windows raw coverage was not committed; the files here must not be described as that Windows run or as a new execution of `82ef87a`.

## Review evidence

Annamalai (`therealannaa`) approved [PR #43](https://github.com/AtharvMitt/Electronics-Store-Management/pull/43) on 12 November after reviewing mappings/reports and checking Windows coverage. AtharvMitt approved [PR #44](https://github.com/AtharvMitt/Electronics-Store-Management/pull/44) on 12 November. Both PRs were merged. TC-NFR-10 therefore has a current PASS (peer review) disposition; the other unresolved cases remain unchanged.

## Interpretation

Coverage is historical measured execution, not a claim of all-file coverage. JSX components and the unimported server entry point are unmeasured. Keep raw results and their manifest together. A later run requires a complete new capture and report review; do not replace old hashes or timestamps without executing the corresponding checks.
