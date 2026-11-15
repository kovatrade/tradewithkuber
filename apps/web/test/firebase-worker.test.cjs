const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/firebase-messaging-sw.js/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function response(env) {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, process: { env }, Response });
  return module.exports.GET();
}
test('missing web configuration returns a non-cacheable 503 identifying required web settings', async () => {
  const result = response({});
  assert.equal(result.status, 503);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const body = await result.text();
  for (const key of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'MESSAGING_SENDER_ID', 'APP_ID']) assert.ok(body.includes(`NEXT_PUBLIC_FIREBASE_${key}`));
});
test('complete web configuration serves an executable messaging worker', async () => {
  const result = response({ NEXT_PUBLIC_FIREBASE_API_KEY: 'public-app-key', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo', NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456', NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456:web:test' });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-type'), 'application/javascript');
  assert.equal(result.headers.get('service-worker-allowed'), '/');
  const imports = [], events = [];
  let initialized = false;
  vm.runInNewContext(await result.text(), {
    self: { addEventListener: event => events.push(event) },
    importScripts: (...urls) => imports.push(...urls),
    firebase: { initializeApp: config => { assert.equal(config.projectId, 'demo'); initialized = true; }, messaging: () => { assert.ok(initialized); } },
  });
  assert.equal(imports.length, 2);
  assert.ok(imports.every(url => new URL(url).origin === 'https://www.gstatic.com'));
  assert.deepEqual(events, ['notificationclick']);
});
