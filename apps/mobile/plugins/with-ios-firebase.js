const { withPodfile } = require('expo/config-plugins');

// RNFirebase 26 uses CocoaPods; its pods must match useFrameworks: 'static'.
module.exports = config => withPodfile(config, mod => {
  const setting = '$RNFirebaseAsStaticFramework = true';
  const existing = /^\s*\$RNFirebaseAsStaticFramework\s*=.*$/m;
  mod.modResults.contents = existing.test(mod.modResults.contents)
    ? mod.modResults.contents.replace(existing, setting)
    : `${setting}\n${mod.modResults.contents}`;
  return mod;
});
