# Sprint 1 — 28 October–4 November 2026

## Goal

Deliver the integrated internal-store foundation: authentication/permissions, products/categories, inventory viewing/updates, and low-stock identification. GitHub Project 3 is the current backlog/status source.

| Atharv's issue | Points | Branch | Dependencies |
| --- | --- | --- | --- |
| #8 — Application/database setup | 2 | `chore/8-mern-setup` | Review existing code/documents |
| #12 — GitHub Actions | 3 | `ci/12-github-actions` | #8 |
| #24 — Database setup/schema/seeds | 3 | `feat/24-mongodb-schema` | #8; #12 provides automated checks |

Total: 8 points. Annamalai owns #6/#7, Apurv #9/#11, and Avaneesh #10/#19. Sprint 2 runs 4–11 November; Atharv owns #15/#16.

## Progress

- 2026-10-29: Reviewed all three PDFs and live #8/#12/#24 acceptance criteria. Baseline `8f388ae` contained PDFs only. Recorded the owner's MERN/Tailwind and two-sprint decisions. Started #8 in its branch. AUR MongoDB binaries are available; no server listened on 27017, so development uses an isolated project instance on 27018.

## Review and retrospective

- #8 implementation opened for teammate review as PR #27; not merged or Done. Local foundation checks passed (see `docs/verification.md`).
- #12: Added separate lint/build and API/database checks, including a transaction-capable ephemeral MongoDB environment. Successful remote execution will be linked after the branch is pushed.
- #24: Adapted the issue description/criteria to the owner's MongoDB decision without changing the integrity goals. Added versioned schema setup, database validators/indexes, shared reference/history guards and repeatable synthetic seeds. Original relational wording is explained in the issue and `docs/decisions.md`.
- Final implementation PRs: [#27 / setup](https://github.com/AtharvMitt/Electronics-Store-Management/pull/27), [#28 / CI](https://github.com/AtharvMitt/Electronics-Store-Management/pull/28), [#29 / schema](https://github.com/AtharvMitt/Electronics-Store-Management/pull/29). CI and schema runs passed on Linux, native Windows and native macOS; evidence is in `docs/verification.md` and the PRs. Review was requested from Annamalai for setup, Apurv for CI, and both for schema. All three issues remain **In progress** pending teammate approval and ordered merging; no sprint demo or retrospective is claimed complete.

Pending integrated delivery and teammate review. Add actual demo links, merged commits, test evidence, and retrospective outcomes. Do not infer completion from issue status alone.
