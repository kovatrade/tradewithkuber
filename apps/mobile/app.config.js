const fs = require('fs');
const path = require('path');
const { validateIosBuild } = require('./scripts/check-ios-build.cjs');

module.exports = ({ config }) => {
  const androidFile = process.env.GOOGLE_SERVICES_JSON || './google-services.json';
  const iosFile = process.env.GOOGLE_SERVICES_PLIST || './GoogleService-Info.plist';
  const androidReady = fs.existsSync(path.resolve(__dirname, androidFile));
  const iosReady = fs.existsSync(path.resolve(__dirname, iosFile));
  const enabled = androidReady || iosReady;
  // EAS file variables exist on its macOS worker. Validate before prebuild embeds the config.
  // Local config inspection stays available while Apple/Firebase accounts are being created.
  if (process.env.EAS_BUILD_PLATFORM === 'ios' && process.env.EAS_BUILD === 'true') {
    validateIosBuild({ projectRoot: __dirname, env: process.env });
  }
  return {
    ...config,
    android: { ...config.android, ...(androidReady ? { googleServicesFile: androidFile } : {}) },
    ios: { ...config.ios, ...(iosReady ? { googleServicesFile: iosFile } : {}) },
    extra: { ...config.extra, firebaseAndroidEnabled: androidReady, firebaseIosEnabled: iosReady },
    plugins: [
      // Expo composes manifest mods in reverse order. Set our vector icons after its defaults.
      // Firebase native libraries are autolinked even when app configuration is missing.
      './plugins/with-firebase-notifications',
      './plugins/with-android-release-optimization',
      './plugins/with-ios-firebase',
      ...(config.plugins || []).filter(
        (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) !== 'expo-build-properties',
      ),
      [
        'expo-notifications',
        { defaultChannel: 'activity', color: '#08a77b', enableBackgroundRemoteNotifications: true, mode: process.env.IOS_PUSH_ENVIRONMENT === 'production' ? 'production' : 'development' },
      ],
      [
        'expo-build-properties',
        {
          android: {
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            enableBundleCompression: true,
            // The APK is downloaded directly from our website. Compress its native libraries too.
            useLegacyPackaging: true,
          },
          ios: { useFrameworks: 'static' },
        },
      ],
      ...(enabled ? ['@react-native-firebase/app', '@react-native-firebase/auth'] : []),
    ],
  };
};
