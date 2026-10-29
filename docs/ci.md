# Continuous integration — issue #12

Workflow: `.github/workflows/ci.yml` (**CI**).

## Events and checks

- Every pull request, including dependent PRs targeting another issue branch.
- Pushes to `main`, `chore/**`, `ci/**`, `feat/**`, and `fix/**`.
- Manual dispatch once the workflow is available on the default branch.

Two checks run independently on Ubuntu 24.04 with the Node version from `.nvmrc`:

| Check | Commands / result |
| --- | --- |
| Lint and frontend build | `npm ci`, `npm run lint`, `npm run build` |
| API and database tests | `npm ci`, isolated MongoDB replica set, `npm test` |

CI uses an ephemeral `mongo:8.0` container on the runner, mapped only to loopback. The same replica-set topology is used locally with the installed AUR binaries; Docker is needed by the GitHub runner, not by local contributors. No production database or repository secrets are required. Database logs are shown on failures and the container is cleaned up after each job. Every database test must run; no passing placeholder or skip replaces an unavailable database.

The workflow has read-only repository permissions, bounded runtime, and cancels obsolete runs on the same ref. Tests added by #24 and later feature PRs run through the same command.

## Run the equivalent checks locally

Follow the root README to create `.env`, then:

```bash
npm ci
npm run db:start
npm run lint
npm test
npm run build
```

In GitHub, open the PR's Checks tab or Actions → CI → the run for the exact commit. A failure blocks readiness for review; inspect the failing step, fix its cause, and push a focused follow-up commit. Record actual successful run links in `docs/verification.md` or the PR.

## Review requirement

The team requires another member's approval before merge. Enable required CI checks for `main` after this workflow is merged there and has reported checks; requiring unavailable checks on the earlier setup PR would block the initial bootstrap. Keep issues In progress until reviewed and merged.
