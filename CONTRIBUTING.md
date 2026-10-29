# Team workflow

The GitHub issue description is the acceptance checklist. Read it, the requirements, existing modules, and dependent PRs before coding.

1. Move the issue to **In progress** in GitHub Project 3.
2. Update your base and create an issue branch, e.g. `feat/9-product-crud`.
3. Commit focused changes referencing the issue, e.g. `feat(products): validate SKU input (#9)`.
4. Run `npm run lint`, `npm test`, and `npm run build` against a running development database.
5. Open a PR with `Closes #N`, actual acceptance/test evidence, and verified SRS references. Request another member's review.
6. Address feedback, pass applicable checks, then merge after approval. Prefer **Create a merge commit** to preserve individual commits.
7. Update the issue/project and record the actual merged commit and demo evidence in the sprint record.

Do not commit secrets, `.env`, database files, generated builds, or `node_modules`. Commit dependency changes with `package-lock.json` and reproduce them with `npm ci`. Foundation PRs must not implement another member's assigned features.

## Dependent PRs

Until #8 is reviewed and merged, dependent branches can base on it. Initial stack: `main ← chore/8-mern-setup ← ci/12-github-actions ← feat/24-mongodb-schema`. Review each PR's own diff. After the parent merges, update the child and retarget its PR to `main` before merging it. Automatic issue closing applies when changes reach the default branch; keep dependent issues open until then.

## Definition of Done

Acceptance criteria demonstrated, relevant checks passing, documentation/traceability updated, teammate review completed, and code merged into `main`. A pushed branch or passing CI alone does not complete an issue.

Record dated progress/blockers in issues or sprint documents. At sprint review, link the actual integrated demo and commit. Record retrospective observations and concrete improvements. Do not claim unexecuted tests or unrecorded demos as complete.
