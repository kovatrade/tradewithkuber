const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const plist = require('@expo/plist').default;
const { validateIosBuild } = require('../scripts/check-ios-build.cjs');
const configure = require('../app.config');
const withFirebase = require('../plugins/with-ios-firebase');
const { withNotificationsIOS } = require('expo-notifications/plugin/build/withNotificationsIOS');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kuber-ios-config-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { ios: { bundleIdentifier: 'com.techrover.tradedesk' } } }));
  const file = path.join(root, 'Firebase Apple config.plist');
  const value = { BUNDLE_ID: 'com.techrover.tradedesk', PROJECT_ID: 'test-project', API_KEY: 'test-key', GOOGLE_APP_ID: '1:123456:ios:abcdef', GCM_SENDER_ID: '123456' };
  const write = fields => fs.writeFileSync(file, plist.build({ ...value, ...fields }));
  write({});
  return { projectRoot: root, env: { EXPO_PUBLIC_API_URL: 'https://tradewithkuber.com', GOOGLE_SERVICES_PLIST: file }, file, write };
}

test('accepts an EAS file variable with spaces and the matching Firebase Apple app', t => {
  const f = fixture(t);
  assert.doesNotThrow(() => validateIosBuild(f));
});

test('rejects missing, malformed, wrong-bundle and non-iOS Firebase files without printing config values', t => {
  const f = fixture(t);
  const failures = [
    { BUNDLE_ID: 'com.other.app' },
    { GOOGLE_APP_ID: '1:123456:android:abcdef' },
    { GCM_SENDER_ID: undefined },
    { API_KEY: undefined },
  ];
  for (const fields of failures) {
    f.write(fields);
    assert.throws(() => validateIosBuild(f), e => !e.message.includes('test-key') && /Firebase/.test(e.message));
  }
  fs.writeFileSync(f.file, 'not an XML plist');
  assert.throws(() => validateIosBuild(f), /Apple app XML/);
  fs.unlinkSync(f.file);
  assert.throws(() => validateIosBuild(f), /GOOGLE_SERVICES_PLIST file variable/);
});

test('prevents an iOS release using a missing, local or insecure API URL', t => {
  const f = fixture(t);
  for (const url of [undefined, 'http://tradewithkuber.com', 'https://localhost:4000', 'https://10.0.2.2:4000']) {
    assert.throws(() => validateIosBuild({ ...f, env: { ...f.env, EXPO_PUBLIC_API_URL: url } }), /public HTTPS API/);
  }
});

test('EAS pre-install checks work without parsing dependencies, and Android skips iOS checks', t => {
  const f = fixture(t);
  // This hook executes before npm install. Full parsing happens in app.config during prebuild.
  fs.writeFileSync(f.file, 'not parsed until after install');
  assert.doesNotThrow(() => validateIosBuild({ ...f, preInstall: true }));
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/check-ios-build.cjs'), '--pre-install'],
    { encoding: 'utf8', env: { ...process.env, EAS_BUILD_PLATFORM: 'android', GOOGLE_SERVICES_PLIST: '', EXPO_PUBLIC_API_URL: '' } });
  assert.equal(result.status, 0, result.stderr);
});

test('Firebase static framework setting survives repeated prebuilds and replaces a conflicting value', async () => {
  let contents = '$RNFirebaseAsStaticFramework = false\nplatform :ios, "15.1"\n';
  for (let n = 0; n < 2; n++) {
    const mod = withFirebase({ name: 'Test', slug: 'test' });
    const result = await mod.mods.ios.podfile({ ...mod, modResults: { contents, language: 'rb' }, modRequest: { platform: 'ios' } });
    contents = result.modResults.contents;
  }
  assert.equal(contents.match(/\$RNFirebaseAsStaticFramework/g).length, 1);
  assert.match(contents, /\$RNFirebaseAsStaticFramework = true/);
  const clean = withFirebase({ name: 'Test', slug: 'test' });
  const result = await clean.mods.ios.podfile({ ...clean, modResults: { contents: 'platform :ios, "15.1"\n' }, modRequest: { platform: 'ios' } });
  assert.match(result.modResults.contents, /^\$RNFirebaseAsStaticFramework = true\n/);
});

test('release notification plugin generates production APNs entitlement and background delivery mode', async () => {
  const config = configure({ config: require('../app.json').expo });
  const [, options] = config.plugins.find(p => Array.isArray(p) && p[0] === 'expo-notifications');
  const mod = withNotificationsIOS({ name: 'Test', slug: 'test' }, { ...options, mode: 'production' });
  const request = { platform: 'ios', projectRoot: path.resolve(__dirname, '..') };
  const entitlement = await mod.mods.ios.entitlements({ ...mod, modResults: {}, modRequest: request });
  const info = await mod.mods.ios.infoPlist({ ...mod, modResults: {}, modRequest: request });
  assert.equal(entitlement.modResults['aps-environment'], 'production');
  assert.deepEqual(info.modResults.UIBackgroundModes, ['remote-notification']);
});
