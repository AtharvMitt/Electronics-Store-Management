import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = process.env.HOST || '127.0.0.1';
const apiPort = Number(process.env.PORT || 5000);
const apiUrl = `http://${host}:${apiPort}/api/ready`;
const viteCli = path.join(root, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
const node = process.execPath;
const children = new Set();
let shuttingDown = false;

if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}
if (!existsSync(viteCli)) throw new Error('Vite is missing. Run npm ci before starting development.');

function startNode(args, cwd, name) {
  const child = spawn(node, args, { cwd, env: process.env, stdio: 'inherit', windowsHide: true });
  children.add(child);
  child.once('error', (error) => {
    console.error(`[dev] Could not start ${name}: ${error.message}`);
    stopChildren('SIGTERM');
  });
  return child;
}

function stopChildren(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

process.once('SIGINT', () => {
  process.exitCode = 130;
  stopChildren('SIGINT');
});
process.once('SIGTERM', () => {
  process.exitCode = 143;
  stopChildren('SIGTERM');
});

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode ?? 1);
  return new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
}

async function waitForApi(api) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (api.exitCode !== null || api.signalCode !== null) throw new Error('Express exited before the API became ready.');
    try {
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).status === 'ready') return;
    } catch {
      // The API is still connecting to MongoDB or has not opened its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Express did not become ready at ${apiUrl} within 30 seconds. Check MongoDB and MONGODB_URI.`);
}

let api;
try {
  console.log('[dev] Starting Express; waiting for MongoDB readiness before starting React.');
  api = startNode(['--watch', 'src/index.js'], path.join(root, 'server'), 'Express');
  await waitForApi(api);
  console.log('[dev] Express and MongoDB are ready; starting React.');
  const web = startNode([viteCli, '--host', '127.0.0.1'], path.join(root, 'client'), 'Vite');
  const code = await Promise.race([waitForExit(api), waitForExit(web)]);
  process.exitCode = code;
  stopChildren('SIGTERM');
  await Promise.all([...children].map(waitForExit));
} catch (error) {
  console.error(`[dev] ${error.message}`);
  process.exitCode = 1;
  stopChildren('SIGTERM');
  await Promise.all([...children].map(waitForExit));
}
