// Machine-readable evidence from Node's built-in test/coverage events.
export default async function* report(events) {
  const tests = [];
  const diagnostics = [];
  let coverage, summary;
  for await (const event of events) {
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const { name, file, line, details } = event.data;
      tests.push({ name, file, line, status: event.type === 'test:pass' ? 'PASS' : 'FAIL', durationMs: details?.duration_ms });
    }
    if (event.type === 'test:coverage') coverage = event.data.summary;
    if (event.type === 'test:diagnostic') diagnostics.push(event.data);
    if (event.type === 'test:summary' && event.data.file === undefined) summary = event.data;
  }
  yield JSON.stringify({ tests, summary, coverage, diagnostics }, null, 2) + '\n';
}
