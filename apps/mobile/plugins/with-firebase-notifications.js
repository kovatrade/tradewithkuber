const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = config => {
  config = withAndroidManifest(config, mod => {
    mod.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const names = ['com.google.firebase.messaging.default_notification_icon', 'expo.modules.notifications.default_notification_icon'];
    app['meta-data'] = (app['meta-data'] || []).filter(item => !names.includes(item.$['android:name']));
    for (const name of names) app['meta-data'].push({ $: { 'android:name': name, 'android:resource': '@drawable/ic_stat_k' } });
    const colorName = 'com.google.firebase.messaging.default_notification_color';
    let color = app['meta-data'].find(item => item.$['android:name'] === colorName);
    if (!color) {
      color = { $: { 'android:name': colorName } };
      app['meta-data'].push(color);
    }
    color.$['android:resource'] = '@color/notification_icon_color';
    const replacements = new Set((color.$['tools:replace'] || '').split(',').map(value => value.trim()).filter(Boolean));
    replacements.add('android:resource');
    color.$['tools:replace'] = [...replacements].join(',');
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const folder = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'ic_stat_k.xml'), '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFF" android:pathData="M5,3L9,3L9,10L16,3L21,3L12,12L21,21L16,21L9,14L9,21L5,21Z"/></vector>');
    return mod;
  }]);
};
