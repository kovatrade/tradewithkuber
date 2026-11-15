const assert = require('node:assert/strict');
const test = require('node:test');
const plugin = require('../plugins/with-firebase-notifications');

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
