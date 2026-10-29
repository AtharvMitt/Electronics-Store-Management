# TechZone Electronics Store Management

Team 9's internal store application, built with **MongoDB, Express, React, Node.js, and Tailwind CSS**. The original PDFs at the repository root define the business requirements. [Implementation decisions](docs/decisions.md) record the current technology and two-sprint plan.

## Requirements

- Node.js 26 LTS (`.nvmrc`) and npm; Node.js 24 is also supported.
- MongoDB Community Server (`mongod`) on PATH. On the lead's Arch Linux machine it is already installed through AUR as `mongodb-bin`. No reinstall, Docker, system service, or Atlas account is needed locally.
- Git and a supported browser.

`package-lock.json` records exact dependencies. The frontend uses React/Vite/Tailwind; the backend uses Express/Mongoose. ESLint checks JavaScript; Node's test runner and Supertest exercise the backend.

## First-time setup

From the repository root:

```bash
npm ci
cp .env.example .env
npm run db:start
npm run dev
```

Open **http://localhost:5173**. The initial page is a development shell; authentication and business screens belong to the other Sprint 1 stories. The API listens on **http://127.0.0.1:5000**. Vite proxies `/api` requests to it. When changing the API port, update the proxy in `client/vite.config.js` too.

In another terminal:

```bash
curl --fail http://127.0.0.1:5000/api/health
curl --fail http://127.0.0.1:5000/api/ready
npm run lint
npm test
npm run build
```

`/api/health` checks API liveness; `/api/ready` pings MongoDB and returns 503 when unavailable. Startup fails if the database cannot be reached. Tests require a running database and `TEST_MONGODB_URI`; integration checks are not silently skipped.

Stop the web/API processes with Ctrl+C, then stop the project database:

```bash
npm run db:stop
```

## Local MongoDB

`db:start` uses the installed `mongod` to manage a separate development replica set, `techzone-dev`, on **127.0.0.1:27018**. Data/logs live in ignored `.local/mongodb/`. It does not modify your system service or databases on 27017. Repeating the command reuses project data. Replica-set support enables atomic multi-document operations required by later inventory stories.

The local helper binds only to loopback and does not enable authentication. Use it only on a trusted development machine. Shared/hosted deployments need authentication, least-privilege database credentials, network restrictions, and HTTPS; do not expose this local instance to the network.

To use an existing replica set, configure `MONGODB_URI` and `TEST_MONGODB_URI` in `.env` and manage it yourself. `DEV_MONGODB_PORT` affects only the optional helper; if changing it, update both URIs too. A standalone instance can pass initial readiness, but cannot support transaction tests or future receipt/sale requirements.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST` | API address; default loopback port 5000 |
| `CLIENT_ORIGIN` | Browser origin allowed by CORS |
| `MONGODB_URI` | Application database |
| `TEST_MONGODB_URI` | Separate disposable test database; never use an application database |
| `DEV_MONGODB_PORT` | Port for the optional project MongoDB helper |

`.env` is ignored. Keep credentials out of source control, client-side environment variables, screenshots, and logs.

## Team workflow

Use an issue branch, focused commits, a linked PR, and another member's review before merging. See [contributing](CONTRIBUTING.md), [Sprint 1](docs/sprints/sprint-1.md), and [traceability](docs/traceability.md).

GitHub Actions runs linting, the frontend build, and API/database tests. See [CI instructions](docs/ci.md) for triggers, local commands, and interpreting results.
