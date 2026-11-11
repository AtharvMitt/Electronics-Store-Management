import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'docs/testing');
const read = (name) => readFileSync(path.join(output, name), 'utf8');
const json = (name) => JSON.parse(read(`evidence/${name}.json`));
const runs = { server: json('server-results'), client: json('client-results') };
const metadata = json('run');
const browser = json('browser-results');
const security = json('security-review');
const quality = json('quality-checks');
const manifest = json('source-manifest');
const relative = (name) => path.relative(root, name).replaceAll(path.sep, '/');
const percent = (covered, total) => total ? `${(100 * covered / total).toFixed(2)}%` : 'Not measured';
const table = (columns, rows) => `| ${columns.join(' | ')} |\n| ${columns.map(() => '---').join(' | ')} |\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n`;
const write = (name, contents) => writeFileSync(path.join(output, name), contents);
const heading = (title) => `# ${title}\n\nExecuted ${metadata.finishedAt}. Node ${metadata.node}; ${metadata.platform}. Source revision: \`${metadata.sourceCommit}\`. The exact tested source is identified by the hashes in [source-manifest.json](evidence/source-manifest.json); the evidence commit follows it.\n\n`;
const cases = readdirSync(path.join(output, 'test-cases')).filter((name) => name.endsWith('.md')).sort().flatMap((name) => read(`test-cases/${name}`).split('\n').filter((line) => line.startsWith('| TC-')).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim())));
assert.equal(cases.length, 66);
assert.equal(new Set(cases.map((row) => row[0])).size, 66);
const tests = Object.values(runs).flatMap((run) => run.tests);
assert.equal(manifest.sourceCommit, metadata.sourceCommit, 'Coverage provenance does not match source manifest');
for (const row of cases) {
  if (row[5] === 'PASS (automated)') assert.ok(tests.some((test) => test.status === 'PASS' && test.name.includes(row[0])), `No passing test labelled ${row[0]}`);
  if (row[5] === 'PASS (review)') assert.ok(security.checks.some((check) => check.tc === row[0] && check.result === 'PASS'), `Missing review ${row[0]}`);
}
assert.ok(Object.values(runs).every((run) => run.summary.success && run.tests.every((test) => test.status === 'PASS')));
assert.ok(browser.checks.every((check) => check.result === 'PASS'), 'Browser run failed');
assert.ok(quality.checks.every((check) => check.exitCode === 0), 'Quality checks failed');
const caseColumns = ['TC ID', 'Requirement', 'What we test now', 'Change from original plan', 'Automated test / manual steps', 'Result'];
const mappingIntro = 'All **65 original unique TC IDs** are retained. **TC-PUR-06** is added for FR-PUR-006, which the original table skipped: **66 cases total**. The repeated TC-SEC-03 in the original functional/security sections counts once. NFR case numbers differ from requirement numbers: TC-NFR-08 = NFR-009; TC-NFR-09 = NFR-010.\n\n';
write('test-cases.md', '# Consolidated test cases\n\n' + mappingIntro + 'Joined from the four [area files](test-cases/); module ownership is review responsibility. No teammate review is claimed by these generated results.\n\n' + table(caseColumns, cases));

const fileCounts = new Map();
for (const test of tests) {
  const name = relative(test.file);
  const counts = fileCounts.get(name) || { PASS: 0, FAIL: 0 };
  counts[test.status]++; fileCounts.set(name, counts);
}
const countRows = Object.entries(runs).map(([workspace, run]) => [workspace === 'server' ? 'Backend' : 'Frontend', run.summary.counts.tests, run.summary.counts.passed, run.summary.counts.failed, run.summary.counts.skipped]);
write('unit-test-report.md', heading('Unit test report') +
  'Command: `npm run test:coverage` (Node built-in test runner and coverage; no coverage dependency). Backend checks include unit, service, HTTP integration, real database transactions and the ordered end-to-end workflow. Frontend checks include direct API-client unit tests and React/jsdom component tests. Counts below are test-runner cases, not test-plan cases.\n\n' +
  table(['Suite', 'Tests', 'Passed', 'Failed', 'Skipped'], countRows) + '\n' +
  table(['Test file', 'Passed', 'Failed'], [...fileCounts].sort().map(([name, counts]) => [`\`${name}\``, counts.PASS, counts.FAIL])) +
  '\nTests create unique `techzone_test_*` databases and drop only their own database. This run used MongoDB 8.3.9, isolated replica set `techzone-qa` on loopback port 27019. It did not reset the application database. Authentication uses generated test passwords.\n\n' +
  'Raw evidence: [backend results](evidence/server-results.json), [frontend results](evidence/client-results.json), [environment/provenance](evidence/run.json), [quality checks](evidence/quality-checks.json).\n');

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(name) : /\.(?:js|jsx)$/.test(name) ? [name] : [];
  });
}
const coverageRows = [], branchRows = [], absent = [];
for (const [workspace, run] of Object.entries(runs)) {
  const files = run.coverage.files;
  const totals = run.coverage.totals;
  coverageRows.push([`**${workspace} measured total**`, `${totals.coveredLineCount}/${totals.totalLineCount}`, percent(totals.coveredLineCount, totals.totalLineCount), `${totals.coveredFunctionCount}/${totals.totalFunctionCount}`, percent(totals.coveredFunctionCount, totals.totalFunctionCount)]);
  branchRows.push([`**${workspace} measured total**`, `${totals.coveredBranchCount}/${totals.totalBranchCount}`, percent(totals.coveredBranchCount, totals.totalBranchCount)]);
  for (const file of files) {
    coverageRows.push([`\`${relative(file.path)}\``, `${file.coveredLineCount}/${file.totalLineCount}`, percent(file.coveredLineCount, file.totalLineCount), `${file.coveredFunctionCount}/${file.totalFunctionCount}`, percent(file.coveredFunctionCount, file.totalFunctionCount)]);
    branchRows.push([`\`${relative(file.path)}\``, `${file.coveredBranchCount}/${file.totalBranchCount}`, percent(file.coveredBranchCount, file.totalBranchCount)]);
  }
  const measured = new Set(files.map((file) => path.resolve(file.path)));
  for (const file of sources(path.join(root, workspace, 'src'))) if (!measured.has(file)) absent.push(relative(file));
}
const coverageLimit = 'Coverage includes only files matched by `src/**` and visible to Node’s built-in instrumentation in each workspace. Dependencies, tests and scripts are excluded. Vite SSR loads JSX through a transform that is not represented here; component test passes do not imply JSX coverage. Files outside the measured set are listed explicitly. Percentages use covered/total counts per metric; they are not averages of file percentages. Node/V8 line coverage is its own line metric, not statement coverage.\n\n';
const componentTests = new Set(['InventoryListing.jsx', 'ProductCatalogue.jsx', 'Purchases.jsx', 'Reports.jsx', 'Sales.jsx', 'StockAdjustments.jsx', 'Suppliers.jsx']);
write('code-coverage-report.md', heading('Code coverage report') + coverageLimit +
  table(['File / scope', 'Covered / lines', 'Line coverage', 'Covered / functions', 'Function coverage'], coverageRows) +
  '\n## Unmeasured source files\n\n' + table(['Source file', 'Coverage limitation'], absent.map((file) => [ `\`${file}\``, file.endsWith('index.js') ? 'Server startup entry point is not imported by tests.' : componentTests.has(path.basename(file)) ? 'Component DOM tests pass, but transformed JSX has no Node coverage data.' : 'No component/unit tests for this file and no Node coverage data; browser smoke is separate evidence.' ])) +
  '\nRaw LCOV: [backend](evidence/server.lcov), [frontend](evidence/client.lcov), [combined, repository-relative paths](evidence/lcov.info). Raw event data includes individual line/function counts in the test result JSON files.\n');

const explanations = {
  'src/config/database.js': 'Ping exception after readyState is connected; disconnected readiness and successful real ping are covered.',
  'src/config/env.js': 'Alternate host/client-origin defaults while the local environment supplies values.',
  'src/database/models.js': 'Some alternatives in duplicate/missing product references, invalid line/aggregate money, missing item arrays, received-state consistency, receipt audit-ID cardinality and re-saving an existing receipt are unexecuted.',
  'src/database/setup.js': 'Existing-collection validation/collMod migration branch; fresh collection creation and already-recorded migration replay are covered.',
  'src/modules/auth/routes.js': 'Missing request-body fallback; malformed credential values are covered.',
  'src/modules/auth/sessions.js': 'Cookie with matching name and empty token fallback.',
  'src/modules/purchases/service.js': 'Missing required order fields, updating an absent order, cancelling with additional edits, changing supplier on edit and the orderNumber history-filter alternative remain unexecuted.',
  'src/modules/reports/service.js': 'Safe-integer overflow guards for aggregated money/units; normal stored totals and date/filter validation are covered.',
  'src/modules/sales/service.js': 'Some alternatives in malformed/duplicate lines, direct-service actor validity, missing stock row, unsafe monetary total and invalid history dates remain unexecuted; rollback/concurrent retry scenarios pass.',
  'src/modules/shared/passwords.js': 'Malformed stored scrypt formats and unsupported parameter branches; valid hash and wrong-password paths are covered.',
  'src/modules/shared/references.js': 'Invalid ObjectId reference, missing required reference deferred to schema validation, and rejected pipeline-update alternatives remain unexecuted.',
  'client/src/api.js': 'Successful currentUser response and default purchases.list filter argument are not directly exercised. Many wrapper functions also lack direct unit tests, reflected separately in function/line coverage.',
};
const uncovered = [];
for (const [workspace, run] of Object.entries(runs)) for (const file of run.coverage.files) {
  const branches = file.branches.filter((branch) => branch.count === 0);
  if (!branches.length) continue;
  const lines = [...new Set(branches.map((branch) => branch.line))].sort((a, b) => a - b);
  const name = relative(file.path), key = workspace === 'server' ? name.slice('server/'.length) : name;
  uncovered.push([`\`${name}\``, branches.length, lines.join(', '), explanations[key] || 'Unexecuted alternatives; source lines identify the exact guards.']);
}
write('branch-coverage-report.md', heading('Branch coverage report') + coverageLimit +
  'These are Node/V8 branch counters (including defaults, callbacks and guards), not a claim of exhaustive business-path coverage. Multiple counters can share one line.\n\n' +
  table(['File / scope', 'Covered / branches', 'Branch coverage'], branchRows) + '\n## Uncovered branches\n\n' +
  table(['File', 'Uncovered counters', 'Source lines', 'Explanation / residual gap'], uncovered) +
  '\nLCOV branch counters and source line locations are retained in [lcov.info](evidence/lcov.info). Browser workflow evidence is separate and does not increase these unit/integration coverage percentages.\n');

let combined = '';
for (const workspace of ['server', 'client']) combined += read(`evidence/${workspace}.lcov`).replace(/^SF:(.+)$/gm, (_all, file) => `SF:${path.isAbsolute(file) ? relative(file) : `${workspace}/${file.replace(/^\.\//, '')}`}`);
write('evidence/lcov.info', combined);
const counts = cases.reduce((acc, row) => { const key = row[5].split(' (')[0]; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
const useCases = [
  ['UC-01', 'Authenticate / logout', 'PASS', 'auth.test.js; browser login/logout'],
  ['UC-02', 'Manage users / roles', 'PARTIAL', 'Role persistence/permissions and read-only Team screen exist; user creation/edit/deactivation UI/API is deferred.'],
  ['UC-03', 'Manage products/categories', 'PASS', 'products.test.js; products-ui.test.js'],
  ['UC-04', 'Manage inventory', 'PARTIAL', 'Listing/adjustment/low stock/audit persistence pass; general history product/date browsing is deferred (TC-INV-06).'],
  ['UC-05', 'Manage suppliers', 'PASS', 'suppliers.test.js; suppliers-ui.test.js; browser supplier creation'],
  ['UC-06', 'Create purchase order', 'PASS', 'purchases.test.js; purchases-ui.test.js; browser order'],
  ['UC-07', 'Receive purchase', 'PASS', 'partial/full/over-receipt/retry/rollback; browser stock refresh'],
  ['UC-08', 'Record sale', 'PASS', 'sales-reports.test.js; stock-consistency.test.js; browser sale'],
  ['UC-09', 'View reports', 'PARTIAL', 'Inventory/low stock/sales reports pass; purchase aggregate reporting is absent (TC-REP-03).'],
];
write('system-validation-report.md', heading('System validation report') + mappingIntro +
  `Case dispositions: ${Object.entries(counts).map(([key, count]) => `**${key}: ${count}**`).join('; ')}. PASS means the documented revised scenario passed. PARTIAL/DEFERRED identify unmet baseline scope; N/A identifies a deployment/operating context that is absent. They are not passes.\n\n` +
  'The ordered `server/tests/end-to-end.test.js` workflow has 12 passing steps: setup → zero-stock rejection → supplier/order → partial/full receipt and over-receipt rejection → adjustment → sale/retry → failed-sale rollback → low-stock boundary → report reconciliation → audit reconciliation → retirement → logout.\n\n' +
  table(['Use case', 'Workflow', 'Result', 'Evidence / deviation'], useCases) +
  '\n## Executed browser checks\n\n' +
  `Executed by \`scripts/qa-browser.mjs\` using Chromium ${browser.browser}, 1440×1000 and 390×844 windows, generated accounts and an isolated temporary database. These are real browser automation checks, not a claim that a person ran the manual matrix. All ${browser.checks.length} checks passed. [Raw browser results](evidence/browser-results.json).\n\n` +
  table(['Browser action / observed assertion', 'Result'], browser.checks.map((check) => [check.name, check.result])) +
  '\n## Manual checks still required\n\n' +
  table(['TC', 'Owner', 'Steps / expected result', 'Current result'], [
    ['TC-NFR-06', 'Atharv; teammate on required browsers', 'On Firefox and Edge: login; create supplier/order; receive goods and verify stock; sell and verify stock/report total; clear search; logout. Record browser version, OS, date and actual result.', 'PENDING for Firefox and Edge; Chromium desktop/mobile-width checks passed.'],
    ['TC-NFR-10', 'One teammate per module', 'Review four area mappings and revised SRS/SAD/STP against implementation; record reviewer, date and remaining defects.', 'PENDING peer review; lint/build/whitespace checks passed.'],
    ['TC-NFR-02', 'Atharv if hosted', 'Define operating window; monitor requests and uptime; exclude planned maintenance; require >=99%.', 'N/A: no hosted operating window.'],
    ['TC-SEC-05 / TC-SEC-10', 'Annamalai if deployed', 'Inspect HTTPS/certificate/cookie network behavior and deployed database user privileges.', 'N/A: production deployment absent.'],
  ]) +
  '\n## Local NFR measurements\n\nThe response-time test excludes login/fixture setup and sends 100 warmed reads sequentially across five routes. The volume test starts with 10000 products and 100000 audit events and measures three operations with a separate 5000 ms usability budget. Measurements below are from the recorded run, in milliseconds; they are not production benchmarks.\n\n```json\n' +
  JSON.stringify((runs.server.diagnostics || []).filter((event) => event.message?.startsWith('{')).map((event) => JSON.parse(event.message)), null, 2) + '\n```\n' +
  '\n## Per-case execution record\n\n' + table(['TC ID', 'Requirement', 'Result', 'Evidence / procedure'], cases.map((row) => [row[0], row[1], row[5], row[4]])) +
  '\n## Defect and release disposition\n\nNo application test failures occurred in this run. Baseline gaps remain: user-management mutations (FR-AUTH-006), inventory-history filtering (FR-INV-006), and dedicated purchase reporting (FR-REP-003). They are documented in the revised specifications; no faculty approval or baseline compliance waiver is claimed. Earlier stock retry defect/fix evidence remains in [stock consistency](../stock-consistency.md). QA harness selector/root corrections were verified by rerunning the browser workflow.\n\nThe report package is reviewable, but full baseline acceptance remains open until these scope decisions and outstanding manual/peer reviews are resolved. Sprint videos remain Atharv’s pending deliverables.\n');
console.log(`Generated four QA reports and consolidated ${cases.length} cases.`);
