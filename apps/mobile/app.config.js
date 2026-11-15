const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const androidFile = process.env.GOOGLE_SERVICES_JSON || './google-services.json';
  const iosFile = process.env.GOOGLE_SERVICES_PLIST || './GoogleService-Info.plist';
  const androidReady = fs.existsSync(path.resolve(__dirname, androidFile));
  const iosReady = fs.existsSync(path.resolve(__dirname, iosFile));
  const enabled = androidReady || iosReady;
  return {
    ...config,
    android: { ...config.android, ...(androidReady ? { googleServicesFile: androidFile } : {}) },
    ios: { ...config.ios, ...(iosReady ? { googleServicesFile: iosFile } : {}) },
    extra: { ...config.extra, firebaseAndroidEnabled: androidReady, firebaseIosEnabled: iosReady },
    plugins: [
      // Expo composes manifest mods in reverse order. Set our vector icons after its defaults.
      // Firebase native libraries are autolinked even when app configuration is missing.
      './plugins/with-firebase-notifications',
      ...(config.plugins || []).filter(plugin => (Array.isArray(plugin) ? plugin[0] : plugin) !== 'expo-build-properties'),
      ['expo-notifications', { defaultChannel: 'activity', color: '#08a77b', enableBackgroundRemoteNotifications: true }],
      ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
      ...(enabled ? ['@react-native-firebase/app', '@react-native-firebase/auth'] : []),
    ],
  };
};
