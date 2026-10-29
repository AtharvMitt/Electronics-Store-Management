# Continuous integration — issue #12

Workflow: `.github/workflows/ci.yml` (**CI**).

## Events and checks

- Every pull request, including dependent PRs targeting another issue branch.
- Pushes to `main`, `chore/**`, `ci/**`, `feat/**`, and `fix/**`.
- Manual dispatch once the workflow is available on the default branch.

Two checks run independently with the Node version from `.nvmrc`: static checks on Ubuntu 24.04, database checks on Ubuntu 22.04.

Additional native jobs run on **Windows 2025** and **macOS 15**. Each installs MongoDB Community Server, uses `npm ci`, copies the example environment, starts the actual project database helper, runs lint/API/database/build checks, and stops the database with the same helper. Windows uses the official version-pinned archive; macOS uses MongoDB's official Homebrew tap. These jobs check native binaries and npm dependencies, not WSL or a Linux container pretending to be Windows/macOS.

| Check | Commands / result |
| --- | --- |
| Lint and frontend build | `npm ci`, `npm run lint`, `npm run build` |
| API and database tests | `npm ci`, isolated MongoDB replica set, `npm test` |

CI uses an ephemeral, version-pinned `mongo:8.3.13` container on the runner, mapped only to loopback. The same replica-set topology is used locally with the installed AUR binaries; Docker is needed by the GitHub runner, not by local contributors. No production database or repository secrets are required. Database logs are shown on failures and the container is cleaned up after each job. Every database test must run; no passing placeholder or skip replaces an unavailable database.

The initial container runs failed before tests because MongoDB's startup guard rejected Ubuntu 24.04's `7.0.0-1017-azure` kernel. Updating the database patch alone did not resolve the guard. The database job therefore uses Ubuntu 22.04's 6.8 kernel, records the actual kernel, and fails promptly on container exit. See [MongoDB SERVER-136848](https://jira.mongodb.org/browse/SERVER-136848), the [runner image manifest](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2204-Readme.md), and the [official MongoDB image manifest](https://github.com/docker-library/official-images/blob/master/library/mongo). Revisit this runner choice when the upstream compatibility issue is fixed or the runner approaches retirement.

The workflow has read-only repository permissions, bounded runtime, and cancels obsolete runs on the same ref. Tests added by #24 and later feature PRs run through the same command.

Native jobs have a 20-minute limit for installing the platform database packages. Do not mark an OS verified until its actual job passes; transient installation/network errors remain visible as failed checks.

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
