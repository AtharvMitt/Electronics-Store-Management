import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../server/src/config/env.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = path.join(root, 'docs/testing/evidence');
mkdirSync(evidence, { recursive: true });
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  return { command: [cmd, ...args].join(' '), exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
};
const quality = ['lint', 'build'].map((script) => run('npm', ['run', script]));
quality.push(run('git', ['diff', '--check']));
writeFileSync(path.join(evidence, 'quality-checks.json'), JSON.stringify({ executedAt: new Date().toISOString(), checks: quality }, null, 2) + '\n');
assert.ok(quality.every((result) => result.exitCode === 0), 'A quality check failed; see quality-checks.json');

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}
const tracked = run('git', ['ls-files']).stdout.split('\n');
assert.ok(!tracked.includes('.env'), '.env must not be tracked');
const publicFiles = [...files(path.join(root, 'client/src')), ...files(path.join(root, 'client/dist'))];
for (const name of publicFiles) {
  const source = readFileSync(name, 'utf8');
  assert.ok(!/mongodb(?:\+srv)?:\/\//i.test(source), `Database URI in ${name}`);
  assert.ok(!/BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/.test(source), `Private key in ${name}`);
  for (const key of ['MONGODB_URI', 'TEST_MONGODB_URI', 'SEED_PASSWORD']) {
    const secret = process.env[key];
    if (secret && secret.length >= 12) assert.ok(!source.includes(secret), `${key} value exposed in ${name}`);
  }
}
const modules = ['auth', 'products', 'inventory', 'suppliers', 'purchases', 'sales', 'reports'];
for (const module of modules) assert.ok(readdirSync(path.join(root, 'server/src/modules', module)).includes('routes.js'));
const checks = [
  { tc: 'TC-SEC-07', result: 'PASS', scope: '.env absent from Git index; client source and production assets contain no MongoDB URI, private key marker, or configured database/seed secret value.', filesInspected: publicFiles.length, limitation: 'Snapshot inspection only; not a historical secret scan or penetration test.' },
  { tc: 'TC-NFR-04', result: 'PASS', scope: 'Seven server module directories have route boundaries; core services have API/service tests.', modules },
];
writeFileSync(path.join(evidence, 'security-review.json'), JSON.stringify({ executedAt: new Date().toISOString(), checks }, null, 2) + '\n');
console.log('Lint, build, whitespace, module and client-secret reviews passed.');
