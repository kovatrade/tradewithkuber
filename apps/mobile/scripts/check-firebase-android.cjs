const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig } = require('expo/config-plugins');

async function check() {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  const android = path.join(root, 'android');
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(path.join(android, 'app/src/main/AndroidManifest.xml'));
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const metadata = app['meta-data'] || [];
  const find = name => {
    const entries = metadata.filter(item => item.$['android:name'] === name);
    assert.equal(entries.length, 1, `Expected one manifest entry: ${name}`);
    return entries[0].$;
  };
  const color = find('com.google.firebase.messaging.default_notification_color');
  assert.equal(color['android:resource'], '@color/notification_icon_color');
  assert.ok((color['tools:replace'] || '').split(',').map(s => s.trim()).includes('android:resource'), 'Firebase notification colour needs tools:replace="android:resource" to merge with the Firebase SDK.');
  for (const name of ['com.google.firebase.messaging.default_notification_icon', 'expo.modules.notifications.default_notification_icon']) {
    assert.equal(find(name)['android:resource'], '@drawable/ic_stat_k');
  }
  assert.ok(fs.existsSync(path.join(android, 'app/src/main/res/drawable/ic_stat_k.xml')), 'Notification status icon is missing.');
  assert.ok(fs.existsSync(path.join(android, 'app/src/main/res/values/notification_icon_color.xml')) || fs.readFileSync(path.join(android, 'app/src/main/res/values/colors.xml'), 'utf8').includes('name="notification_icon_color"'), 'Notification colour resource is missing.');
  const firebase = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'))['react-native'];
  assert.equal(find('com.google.firebase.messaging.default_notification_channel_id')['android:value'], firebase.messaging_android_notification_channel_id);
  const servicesPath = path.join(android, 'app/google-services.json');
  assert.ok(fs.existsSync(servicesPath), 'Firebase Android app configuration is missing. Set the GOOGLE_SERVICES_JSON_BASE64 Actions secret and rerun prebuild.');
  const services = JSON.parse(fs.readFileSync(servicesPath, 'utf8'));
  const packageName = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.android.package;
  assert.ok(services.project_info?.project_id, 'Firebase Project ID is missing.');
  assert.ok(services.client?.some(client => client.client_info?.android_client_info?.package_name === packageName), 'Firebase configuration must match the Android package.');
  assert.match(fs.readFileSync(path.join(android, 'app/build.gradle'), 'utf8'), /(?:apply plugin:\s*['"]com\.google\.gms\.google-services['"]|id\s*\(?\s*['"]com\.google\.gms\.google-services['"])/, 'Google Services Gradle plugin is missing.');
  console.log('Firebase Android checks passed: manifest overrides, icons, channel, and app configuration.');
}
check().catch(error => { console.error(error.message); process.exitCode = 1; });
