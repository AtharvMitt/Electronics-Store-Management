# Implementation decisions

## Technology and delivery

The delivered application uses React/Vite/Tailwind, Express/Node.js ES modules and MongoDB/Mongoose. GitHub Issues/Projects and GitHub Actions support development; Node's test runner, Supertest and jsdom provide automated checks. The [original submissions](archive/README.md) proposed Django REST Framework, PostgreSQL, Jira, Jenkins, pytest and six sprints. Requirement IDs and business rules remain traceable to that baseline.

The agreed implementation calendar was Sprint 1, **28 October–4 November 2026**, and Sprint 2, **5–9 November 2026**. QA/report delivery and the Windows coverage follow-up merged on 12 November. See [sprint records](sprints/sprint-1.md) and [verification evidence](verification.md).

## Data and integrity

- MongoDB runs as a replica set because purchase receipts, sales and stock/history updates require multi-document transactions.
- Money is stored as safe integer minor units. Quantities are safe integers; available stock cannot become negative.
- Embedded purchase/sale lines preserve product and price snapshots. Supplier snapshots preserve historical contacts.
- Product and supplier retirement keeps referenced records. Categories can be deleted only when unused.
- Validators/indexes enforce document constraints; services enforce cross-collection references, authorization, transaction boundaries and durable request idempotency.

## Authentication and roles

Opaque server sessions use hashed random tokens and eight-hour expiry. Passwords use salted scrypt hashes. Backend permissions use the stored active user on every request; UI visibility alone grants no access. Manager stock adjustment is denied because the original policy was unspecified. [Permissions](permissions.md) defines the delivered matrix.

## Scope boundaries

Account mutation workflows, general inventory-history filters and aggregate purchase reporting remain unmet original requirements. The Team page is read-only; purchase history provides per-order totals only. Production TLS, authenticated database deployment, backups and uptime monitoring are outside the verified local environment. These limits are explicit in the [SRS](specifications/software-requirements-specification.md); no faculty acceptance of the gaps is recorded.
