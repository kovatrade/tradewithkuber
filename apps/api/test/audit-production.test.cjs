const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, codeFirstOnly, ADVISORY, EXPIRES } = require('../scripts/audit-production.cjs');
const issue = { name: 'picomatch', url: ADVISORY };
const report = () => ({ metadata: { vulnerabilities: {} }, vulnerabilities: {
  picomatch: { severity: 'high', via: [issue] },
  tinyglobby: { severity: 'high', via: ['picomatch'] },
  '@nestjs/graphql': { severity: 'high', via: ['tinyglobby'] },
} });
const reviewed = { now: new Date('2026-11-18T00:00:00Z'), codeFirstOnly: true };
test('only the reviewed advisory and its known transitive chain qualify', () => {
  assert.deepEqual(evaluate(report(), reviewed).blocked, []);
  const r = report(); r.vulnerabilities.picomatch.via.push({ name: 'picomatch', url: 'https://example.test/new-advisory' });
  assert.equal(evaluate(r, reviewed).blocked.length, 3);
});
test('a new unrelated high or any critical finding fails the policy', () => {
  const r = report(); r.vulnerabilities.other = { severity: 'high', via: [issue] };
  assert.deepEqual(evaluate(r, reviewed).blocked, ['other']);
  r.vulnerabilities.picomatch.severity = 'critical';
  assert.ok(evaluate(r, reviewed).blocked.includes('picomatch'));
});
test('expiry and schema-loader changes invalidate the exception', () => {
  assert.equal(evaluate(report(), { ...reviewed, now: new Date(EXPIRES) }).blocked.length, 3);
  assert.equal(evaluate(report(), { ...reviewed, codeFirstOnly: false }).blocked.length, 3);
});
test('missing, failed or malformed audit reports fail closed', () => {
  for (const r of [null, {}, { error: { code: 'ENOAUDIT' } }, { ...report(), vulnerabilities: [] }, { ...report(), vulnerabilities: { malformed: {} } }]) assert.throws(() => evaluate(r, reviewed));
});
test('the exception is conditional on actual code-first configuration and the reviewed versions', () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-policy-'));
  fs.mkdirSync(path.join(root, 'src'));
  const app = path.join(root, 'src/app.module.ts');
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@nestjs/graphql': '13.4.5' } }));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/picomatch': { version: '4.0.7' } } }));
    fs.writeFileSync(app, 'const options = { autoSchemaFile: true };');
    assert.equal(codeFirstOnly(root), true);
    fs.writeFileSync(app, "const options = { autoSchemaFile: true, typePaths: ['**/*.graphql'] };");
    assert.equal(codeFirstOnly(root), false);
    fs.writeFileSync(app, "import glob from 'tinyglobby'; const options = { autoSchemaFile: true };");
    assert.equal(codeFirstOnly(root), false);
    fs.writeFileSync(app, 'const options = { autoSchemaFile: false };');
    assert.equal(codeFirstOnly(root), false);
  } finally {
    fs.unlinkSync(app); fs.rmdirSync(path.join(root, 'src'));
    fs.unlinkSync(path.join(root, 'package.json')); fs.unlinkSync(path.join(root, 'package-lock.json')); fs.rmdirSync(root);
  }
});
