# TechZone Electronics Store Management

Team 9's internal store application, built with **MongoDB, Express, React, Node.js, and Tailwind CSS**. The original PDFs at the repository root define the business requirements. [Implementation decisions](docs/decisions.md) record the current technology and two-sprint plan.

## Requirements and platform preparation

All platforms need Git, **Node.js 26 LTS** (`.nvmrc`; Node.js 24 is also supported), npm, and **MongoDB Community Server 8.x** with `mongod` on PATH. Install the database server, not just `mongosh` or Compass. No Docker, system service, or Atlas account is required locally. Use a supported desktop OS and browser.

### Windows — PowerShell

1. Install [Git for Windows](https://git-scm.com/downloads/win) and [Node.js LTS](https://nodejs.org/en/download). Their installers should add Git/Node/npm to PATH.
2. Install [MongoDB Community Server](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-windows/) using its MSI installer. A Windows MongoDB service is optional; this project runs its own instance.
3. Add the installed MongoDB **bin** directory (for example `C:\Program Files\MongoDB\Server\8.0\bin`, adjusted to your actual version) to your user's PATH through Windows Environment Variables. Open a new PowerShell window.
4. Confirm `git --version`, `node --version`, `npm --version`, and `mongod --version` all work.

If PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm` in all commands below; no execution-policy change is needed. Use a normal writable clone folder, e.g. under your user's source/projects directory. These instructions use native Windows binaries; a WSL setup must instead follow the Linux instructions entirely inside WSL.

### macOS — Terminal (zsh or Bash)

Install Git (Xcode Command Line Tools are sufficient), [Node.js LTS](https://nodejs.org/en/download), and MongoDB Community Server using the [official Homebrew instructions](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-os-x/). For example, after installing Node.js LTS and Homebrew:

```bash
brew tap mongodb/brew
brew install mongodb-community@8.0
```

Follow Homebrew's printed PATH instructions if needed. Native Apple Silicon and Intel installations have different prefixes; avoid hardcoding `/usr/local` on Apple Silicon. Confirm `git --version`, `node --version`, `npm --version`, and `mongod --version` work. You do not need `brew services start`; the project helper manages its own instance. If Node.js LTS is already installed, reuse it.

### Linux — Terminal

Install Git, Node.js LTS/npm, and MongoDB Community Server for your distribution. On the lead's Arch Linux machine, `mongodb-bin` and `mongosh-bin` are already installed through AUR (`yay`); reuse them. Other distributions should follow [MongoDB's Linux installation instructions](https://www.mongodb.com/docs/manual/administration/install-on-linux/). Confirm `git --version`, `node --version`, `npm --version`, and `mongod --version`.

The helper does not require `sudo` or a systemd service. Keep the project database on loopback.

`package-lock.json` records exact dependencies. The frontend uses React/Vite/Tailwind; the backend uses Express/Mongoose. ESLint checks JavaScript; Node's test runner and Supertest exercise the backend.

## Clone and run — Windows PowerShell

```powershell
git clone https://github.com/AtharvMitt/Electronics-Store-Management.git
cd Electronics-Store-Management
# Until PRs merge, select the implementation branch listed in the PR.
git switch chore/8-mern-setup
npm ci
Copy-Item .env.example .env
npm run db:start
npm run dev
```

After the implementation merges, use `main` instead. Open **http://localhost:5173**. Keep this terminal running. In another PowerShell window in the repository:

```powershell
Invoke-RestMethod http://127.0.0.1:5000/api/health
Invoke-RestMethod http://127.0.0.1:5000/api/ready
npm run lint
npm test
npm run build
```

Both requests should report `ok` / `ready`. Substitute `npm.cmd` where needed. On later runs do not overwrite your configured `.env`; run `npm ci` if dependencies changed, then `npm run db:start` and `npm run dev`.

## Clone and run — macOS / Linux

```bash
git clone https://github.com/AtharvMitt/Electronics-Store-Management.git
cd Electronics-Store-Management
# Until PRs merge, select the implementation branch listed in the PR.
git switch chore/8-mern-setup
npm ci
cp .env.example .env
npm run db:start
npm run dev
```

After the implementation merges, use `main` instead. Open **http://localhost:5173**. The initial page is a development shell; authentication and business screens belong to the other Sprint 1 stories. The API listens on **http://127.0.0.1:5000**. Vite proxies `/api` requests to it. When changing the API port, update the proxy in `client/vite.config.js` too.

In another terminal:

```bash
curl --fail http://127.0.0.1:5000/api/health
curl --fail http://127.0.0.1:5000/api/ready
npm run lint
npm test
npm run build
```

`/api/health` checks API liveness; `/api/ready` pings MongoDB and returns 503 when unavailable. Startup fails if the database cannot be reached. Tests require a running database and `TEST_MONGODB_URI`; integration checks are not silently skipped.

On later runs, keep your existing `.env`; run `npm ci` if dependencies changed, then `npm run db:start` and `npm run dev`.

## Stop — all platforms

Stop the web/API processes with Ctrl+C in their terminal, then stop the project database from the repository root:

```bash
npm run db:stop
```

## Local MongoDB

`db:start` uses the installed `mongod` to manage a separate development replica set, `techzone-dev`, on **127.0.0.1:27018**. Node handles process startup on Windows, macOS, and Linux, including paths with spaces; no Unix-only `--fork` flag or shell background command is used. Data/logs live in ignored `.local/mongodb/`. It does not modify your system service or databases on 27017. Repeating the command reuses project data. Replica-set support enables atomic multi-document operations required by later inventory stories.

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

## Troubleshooting

- **`mongod` not found:** install Community Server, add its bin folder to PATH, and reopen the terminal. Installing Compass/mongosh alone does not provide the server.
- **Port in use/startup failed:** inspect `.local/mongodb/mongod.log`. Stop the project's own instance with `npm run db:stop`; do not kill unrelated MongoDB processes. If changing `DEV_MONGODB_PORT`, update both URIs in `.env` too.
- **API fails or readiness is 503:** start the project database, confirm `.env` exists at the repository root, and verify the URI includes `replicaSet=techzone-dev` and port 27018.
- **Vite port 5173 unavailable:** stop the other development server or choose a frontend port and update `CLIENT_ORIGIN` consistently.
- **Replica-set/transaction errors:** a system standalone instance on 27017 is not equivalent to the project's replica set. Use `npm run db:start` and the example URIs.
- **Native build packages fail after switching OS:** run `npm ci` on the new OS; do not copy `node_modules` between Windows/macOS/Linux.
- **MongoDB rejects the OS/kernel:** use a server release and OS combination supported by MongoDB; retain the failure logs rather than bypassing its startup guard.

## Team workflow

Use an issue branch, focused commits, a linked PR, and another member's review before merging. See [contributing](CONTRIBUTING.md), [Sprint 1](docs/sprints/sprint-1.md), and [traceability](docs/traceability.md).
