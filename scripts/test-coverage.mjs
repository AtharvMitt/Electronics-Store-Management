import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'docs/testing/evidence');
mkdirSync(output, { recursive: true });
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim();
const metadata = {
  startedAt: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'),
  workingTree: git('status', '--short'), node: process.version,
  platform: `${os.type()} ${os.release()} ${os.arch()}`,
  command: 'npm run test:coverage',
  note: 'Source commit plus working-tree changes at execution; reports are committed afterwards.',
};
function files(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const name = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(name) : [name];
  });
}
const sourceFiles = [...files('server/src'), ...files('server/tests'), ...files('client/src'), ...files('client/tests'), ...files('scripts'),
  'package.json', 'package-lock.json', 'server/package.json', 'client/package.json', 'client/vite.config.js', 'client/index.html', 'eslint.config.js', '.nvmrc', '.github/workflows/ci.yml'];
writeFileSync(path.join(output, 'source-manifest.json'), JSON.stringify({ sourceCommit: metadata.sourceCommit, algorithm: 'sha256',
  note: 'Executable source, tests, scripts and build/test configuration. Report-only commits may follow without changing this tested input set.',
  files: Object.fromEntries(sourceFiles.sort().map((file) => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')])) }, null, 2) + '\n');
let failed = false;
for (const workspace of ['server', 'client']) {
  const result = spawnSync(process.execPath, [
    '--test', '--test-concurrency=1', '--experimental-test-coverage',
    '--test-coverage-include=src/**',
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    `--test-reporter=${path.join(root, 'scripts/coverage-reporter.mjs')}`,
    `--test-reporter-destination=${path.join(output, `${workspace}-results.json`)}`,
    '--test-reporter=lcov', `--test-reporter-destination=${path.join(output, `${workspace}.lcov`)}`,
  ], { cwd: path.join(root, workspace), env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  metadata[workspace] = { exitCode: result.status };
  failed ||= result.status !== 0;
}
metadata.finishedAt = new Date().toISOString();
writeFileSync(path.join(output, 'run.json'), JSON.stringify(metadata, null, 2) + '\n');
process.exitCode = failed ? 1 : 0;
