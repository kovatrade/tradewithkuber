const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const fields = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'MESSAGING_SENDER_ID', 'APP_ID', 'VAPID_KEY'].map(key => `NEXT_PUBLIC_FIREBASE_${key}`);
const script = path.join(__dirname, '../scripts/check-firebase-build.cjs');

test('the combined Docker web build receives every public Firebase setting before compilation', () => {
  const docker = fs.readFileSync(path.join(__dirname, '../../../Dockerfile'), 'utf8');
  const web = docker.split(' AS web')[1].split('# ---- Runtime')[0];
  const build = web.indexOf('npm run build');
  for (const name of fields) {
    assert.match(web.slice(0, build), new RegExp(`ARG ${name}(?:\\s|$)`));
    assert.ok(web.slice(0, build).includes(`${name}=$${name}`), `Missing build environment for ${name}`);
  }
  assert.ok(web.indexOf('node scripts/check-firebase-build.cjs') < build);
  assert.ok(web.indexOf('node scripts/check-firebase-build.cjs --verify-bundle') > build);
  assert.doesNotMatch(web, /(?:ARG|ENV)\s+FIREBASE_SERVICE_ACCOUNT_JSON/);
});
test('missing build settings stop deployment and list variable names without exposing values', () => {
  const env = { ...process.env };
  for (const name of fields) delete env[name];
  env[fields[0]] = 'public-value-that-must-not-be-logged';
  const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  for (const name of fields.slice(1)) assert.ok(result.stderr.includes(name));
  assert.ok(!result.stderr.includes(env[fields[0]]));
});
test('complete public build settings pass validation without logging their values', () => {
  const env = { ...process.env, ...Object.fromEntries(fields.map((name, index) => [name, `public-test-value-${index}`])) };
  const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /all 6 public settings/);
  assert.ok(!result.stdout.includes('public-test-value-'));
});
test('bundle verification reads JavaScript files and ignores route directories ending in .js', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tradedesk-firebase-bundle-test-'));
  const env = { ...process.env, ...Object.fromEntries(fields.map((name, index) => [name, `public-test-value-${index}`])) };
  try {
    const chunks = path.join(root, '.next/static/chunks');
    fs.mkdirSync(path.join(chunks, 'app/firebase-messaging-sw.js'), { recursive: true });
    fs.writeFileSync(path.join(chunks, 'app.js'), JSON.stringify(fields.map(name => env[name])));
    const result = spawnSync(process.execPath, [script, '--verify-bundle'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /all 6 public settings are embedded/);
    fs.writeFileSync(path.join(chunks, 'app.js'), '/* stale unconfigured browser bundle */');
    const stale = spawnSync(process.execPath, [script, '--verify-bundle'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(stale.status, 1);
    for (const name of fields) assert.ok(stale.stderr.includes(name));
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^tradedesk-firebase-bundle-test-/);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
