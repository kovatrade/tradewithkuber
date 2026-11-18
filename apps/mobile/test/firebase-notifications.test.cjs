const assert = require('node:assert/strict');
const test = require('node:test');
const plugin = require('../plugins/with-firebase-notifications');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function apply(manifest) {
  const config = plugin({ name: 'Test', slug: 'test' });
  return (await config.mods.android.manifest({ ...config, modResults: manifest, modRequest: { platform: 'android', projectRoot: process.cwd() } })).modResults;
}
const metadata = manifest => manifest.manifest.application[0]['meta-data'];
const colorName = 'com.google.firebase.messaging.default_notification_color';

test('creates the Firebase colour override on a clean manifest without app credentials', async () => {
  const result = await apply({ manifest: { $: {}, application: [{ $: { 'android:name': '.MainApplication' } }] } });
  const color = metadata(result).find(item => item.$['android:name'] === colorName).$;
  assert.equal(color['android:resource'], '@color/notification_icon_color');
  assert.equal(color['tools:replace'], 'android:resource');
  assert.equal(result.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
});
test('keeps other merge rules while overriding an existing notification colour', async () => {
  const result = await apply({ manifest: { $: {}, application: [{ $: { 'android:name': '.MainApplication' }, 'meta-data': [{ $: { 'android:name': colorName, 'android:resource': '@color/white', 'tools:replace': 'android:value' } }] }] } });
  const color = metadata(result).find(item => item.$['android:name'] === colorName).$;
  assert.equal(color['android:resource'], '@color/notification_icon_color');
  assert.deepEqual(new Set(color['tools:replace'].split(',')), new Set(['android:value', 'android:resource']));
});
test('repeated prebuilds keep one colour override and matching foreground/background icons', async () => {
  const first = await apply({ manifest: { $: {}, application: [{ $: { 'android:name': '.MainApplication' } }] } });
  const second = await apply(first);
  assert.equal(metadata(second).filter(item => item.$['android:name'] === colorName).length, 1);
  for (const name of ['com.google.firebase.messaging.default_notification_icon', 'expo.modules.notifications.default_notification_icon']) {
    const entries = metadata(second).filter(item => item.$['android:name'] === name);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].$['android:resource'], '@drawable/ic_stat_k');
  }
});

function pushFixture() {
  const effects = [], events = [], subscriptions = [];
  let handler;
  const module = { exports: {} };
  const notification = { setNotificationHandler: value => { handler = value; }, dismissAllNotificationsAsync: async () => { events.push('dismiss'); } };
  const modules = {
    react: { useEffect: fn => effects.push(fn) },
    'react-native': { Platform: { OS: 'android' }, AppState: { currentState: 'active' } },
    'expo-constants': { default: { expoConfig: { extra: { firebaseAndroidEnabled: true } } } },
    'expo-notifications': notification,
    'expo-secure-store': { getItemAsync: async () => 'installation-12345' },
    'expo-crypto': {}, 'expo-router': {},
    './api': { gql: async query => { events.push(query.includes('unregisterPushToken') ? 'unregister' : 'register'); }, subscribe: (_query, _vars, fn) => { subscriptions.push(fn); return () => {}; } },
    './roles': { isPlatformAdmin: role => ['SUPER_ADMIN', 'DEVELOPER'].includes(role) },
    './ui': { toast: text => events.push(text) },
    '@react-native-firebase/messaging': { getMessaging: () => ({}), deleteToken: async () => { events.push('delete-token'); } },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/push.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: module.exports, module, require: name => { assert.ok(name in modules, name); return modules[name]; }, __DEV__: false,
  });
  return { push: module.exports, effects, events, subscriptions, handler: () => handler };
}

test('native push is available only to non-demo staff', () => {
  const f = pushFixture();
  for (const role of ['SUPER_ADMIN', 'DEVELOPER', 'BROKER', 'TRADER']) {
    assert.equal(f.push.canUseSystemPush({ role, isDemo: false }), role !== 'TRADER');
    assert.equal(f.push.canUseSystemPush({ role, isDemo: true }), false);
  }
  assert.equal(f.push.canUseSystemPush(null), false);
});

for (const isDemo of [false, true]) test(`trader demo=${isDemo} retains in-app updates and clears external registration`, async () => {
  const f = pushFixture();
  f.push.usePushNotifications({ id: 'trader', role: 'TRADER', isDemo }, false);
  f.effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.events, ['unregister', 'dismiss', 'delete-token']);
  const result = await f.handler().handleNotification({ request: { content: { data: { userId: 'trader' } } } });
  assert.equal(result.shouldShowBanner, false);
  assert.equal(result.shouldShowList, false);
  assert.equal(result.shouldPlaySound, false);
  f.subscriptions[0]({ notificationAdded: { title: 'Order filled', body: 'Bought one lot' } });
  assert.equal(f.events.at(-1), 'Order filled: Bought one lot');
});
