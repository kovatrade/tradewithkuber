const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function fixture(options = {}) {
  const events = [];
  const effects = [];
  const values = new Map();
  const notification = { permission: options.permission || 'granted', requestPermission: async () => { notification.permission = options.answer || 'granted'; return notification.permission; } };
  const worker = options.worker || { active: {}, getNotifications: async () => [] };
  const messaging = {
    getMessaging: () => ({}), isSupported: async () => true,
    getToken: async () => { events.push('token'); if (options.tokenError) throw new Error(options.tokenError); return 'private-device-token'; },
    deleteToken: async () => { events.push('delete-token'); },
  };
  const gql = async query => {
    if (query.includes('unregisterPushToken')) { events.push('unregister'); return { unregisterPushToken: true }; }
    if (query.includes('registerPushToken')) { events.push('register'); return { registerPushToken: options.serverEnabled !== false }; }
    assert.ok(query.includes('sendTestNotification'));
    events.push('test'); return { sendTestNotification: true };
  };
  const module = { exports: {} };
  const context = {
    module, exports: module.exports, process: { env: { NEXT_PUBLIC_FIREBASE_VAPID_KEY: options.vapid === false ? '' : 'public-vapid-key' } },
    require: name => {
      if (name === 'react') return { useEffect: fn => effects.push(fn) };
      if (name === 'firebase/messaging') return messaging;
      if (name === './firebase') return { firebaseConfigured: options.configured !== false, firebaseApp: () => ({}) };
      if (name === './api') return { gql };
      throw new Error(`Unexpected module ${name}`);
    },
    Notification: notification, window: { Notification: notification }, navigator: { serviceWorker: { getRegistration: async () => worker, register: async () => { events.push('worker'); return worker; } } },
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout,
  };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/push.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, context);
  return { push: module.exports, events, notification, effects, values };
}

test('test action registers the browser for the current sign-in before queuing a notification', async () => {
  const f = fixture(); await f.push.sendBrowserTestNotification();
  assert.deepEqual(f.events, ['worker', 'token', 'register', 'test']);
});
test('allowed browser permission does not bypass missing web configuration', async () => {
  const f = fixture({ configured: false });
  await assert.rejects(f.push.sendBrowserTestNotification(), /not configured for this website/);
  assert.deepEqual(f.events, []);
});
test('a missing VAPID key prevents sending a test rather than reporting an unregistered session', async () => {
  const f = fixture({ vapid: false });
  await assert.rejects(f.push.sendBrowserTestNotification(), /not configured for this website/);
  assert.deepEqual(f.events, []);
});
test('denied notification permission prevents registration and test mutations', async () => {
  const f = fixture({ permission: 'denied' });
  await assert.rejects(f.push.sendBrowserTestNotification(), /Allow notifications/);
  assert.deepEqual(f.events, []);
});
test('the test action requests permission when needed and then registers', async () => {
  const f = fixture({ permission: 'default' }); await f.push.sendBrowserTestNotification();
  assert.equal(f.notification.permission, 'granted');
  assert.equal(f.events.at(-1), 'test');
});
test('Firebase subscription failures prevent the test mutation and preserve the cause', async () => {
  const f = fixture({ tokenError: 'Subscription blocked' });
  await assert.rejects(f.push.sendBrowserTestNotification(), /Subscription blocked/);
  assert.deepEqual(f.events, ['worker', 'token']);
});
test('disabled server push prevents the test mutation', async () => {
  const f = fixture({ serverEnabled: false });
  await assert.rejects(f.push.sendBrowserTestNotification(), /not been enabled on the server/);
  assert.deepEqual(f.events, ['worker', 'token', 'register']);
});
test('a worker activated between registration and listener setup does not time out', async () => {
  const worker = { active: null, installing: { state: 'activated', addEventListener: () => {}, removeEventListener: () => {} } };
  const f = fixture({ worker }); await f.push.sendBrowserTestNotification();
  assert.equal(f.events.at(-1), 'test');
});
test('a failed worker installation prevents the test mutation', async () => {
  const worker = { active: null, installing: { state: 'redundant', addEventListener: () => {}, removeEventListener: () => {} } };
  const f = fixture({ worker });
  await assert.rejects(f.push.sendBrowserTestNotification(), /could not start/);
  assert.deepEqual(f.events, ['worker']);
});

test('only non-demo staff accounts can use browser push', () => {
  const f = fixture();
  for (const role of ['SUPER_ADMIN', 'BROKER', 'TRADER']) {
    assert.equal(f.push.canUseSystemPush(role, false), role !== 'TRADER');
    assert.equal(f.push.canUseSystemPush(role, true), false);
  }
  assert.equal(f.push.canUseSystemPush(), false);
});

test('trader sign-in clears an existing token without asking permission or registering push', async () => {
  const f = fixture({ permission: 'default' });
  f.values.set('td.push.installation', 'existing-installation');
  f.push.useBrowserPush('trader', 'TRADER', false);
  f.effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.events, ['unregister', 'delete-token']);
  assert.equal(f.notification.permission, 'default');
});

test('staff registration waits for trader token cleanup before obtaining a new token', async () => {
  const f = fixture();
  f.push.useBrowserPush('demo', 'TRADER', true);
  f.effects[0]();
  await f.push.registerBrowserPush();
  assert.deepEqual(f.events, ['delete-token', 'worker', 'token', 'register']);
});
