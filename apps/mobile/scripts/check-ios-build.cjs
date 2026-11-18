const fs = require('node:fs');
const path = require('node:path');

/** Shared by the dependency-free EAS pre-install hook and full Expo prebuild validation. */
function validateIosBuild({ projectRoot = path.resolve(__dirname, '..'), env = process.env, preInstall = false } = {}) {
  let api;
  try { api = new URL(env.EXPO_PUBLIC_API_URL); } catch { /* handled below */ }
  if (!api || api.protocol !== 'https:' || api.username || api.password || /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(api.hostname)) {
    throw new Error('iOS release builds require EXPO_PUBLIC_API_URL with the public HTTPS API address. EAS build profiles already provide it.');
  }
  const file = path.resolve(projectRoot, env.GOOGLE_SERVICES_PLIST || './GoogleService-Info.plist');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error('Missing Firebase iOS configuration. Add the GOOGLE_SERVICES_PLIST file variable to the selected EAS environment. See docs/ios-eas-build.md.');
  }
  if (preInstall) return; // No npm dependencies are installed yet on the macOS worker.

  let plist;
  try { plist = require('@expo/plist').default.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('GOOGLE_SERVICES_PLIST must point to the Firebase Apple app XML GoogleService-Info.plist file.'); }
  const { expo } = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
  if (plist.BUNDLE_ID !== expo.ios.bundleIdentifier) {
    throw new Error(`Firebase iOS bundle ID must match ${expo.ios.bundleIdentifier}. Download the Apple app configuration for this bundle ID.`);
  }
  if (!plist.PROJECT_ID || !plist.API_KEY || !/^1:\d+:ios:[a-z0-9]+$/i.test(plist.GOOGLE_APP_ID || '') || !/^\d+$/.test(String(plist.GCM_SENDER_ID || ''))) {
    throw new Error('Firebase iOS configuration is incomplete. Download GoogleService-Info.plist again from Firebase Project settings > Your apps > Apple app.');
  }
}

if (require.main === module) {
  // This hook is shared with Android EAS builds; GitHub APK builds do not invoke it.
  if (!process.env.EAS_BUILD_PLATFORM || process.env.EAS_BUILD_PLATFORM === 'ios') {
    try {
      validateIosBuild({ preInstall: process.argv.includes('--pre-install') });
      console.log('Firebase iOS configuration and public HTTPS API address checked.');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}

module.exports = { validateIosBuild };
