const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = (config) =>
  withAppBuildGradle(config, (mod) => {
    const optimized = 'proguard-android-optimize.txt';
    const original = /getDefaultProguardFile\((['"])proguard-android\.txt\1\)/g;
    if (!mod.modResults.contents.includes(optimized) && !original.test(mod.modResults.contents)) {
      throw new Error('Cannot find the Android release ProGuard configuration. Check the generated Gradle template.');
    }
    mod.modResults.contents = mod.modResults.contents.replace(original, `getDefaultProguardFile("${optimized}")`);
    return mod;
  });
