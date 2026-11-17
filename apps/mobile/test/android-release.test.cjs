const assert = require('node:assert/strict');
const test = require('node:test');
const configure = require('../app.config');
const { withBuildProperties } = require('expo-build-properties');
const optimize = require('../plugins/with-android-release-optimization');

test('clean prebuilds enable release shrinking and compression without changing emulator architectures', async () => {
  const config = configure({ config: require('../app.json').expo });
  const options = config.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties')[1];
  const mods = withBuildProperties({ name: 'Test', slug: 'test' }, options);
  const result = await mods.mods.android.gradleProperties({
    ...mods,
    modResults: [],
    modRequest: { projectRoot: process.cwd(), platform: 'android' },
  });
  const props = Object.fromEntries(result.modResults.filter((p) => p.type === 'property').map((p) => [p.key, p.value]));
  for (const key of [
    'android.enableMinifyInReleaseBuilds',
    'android.enableShrinkResourcesInReleaseBuilds',
    'android.enableBundleCompression',
    'expo.useLegacyPackaging',
  ])
    assert.equal(props[key], 'true', key);
  assert.equal(
    props.reactNativeArchitectures,
    undefined,
    'Release jobs select their ABI; local emulator builds keep their default architectures.',
  );
  assert.equal(options.ios.useFrameworks, 'static', 'Firebase iOS configuration must be retained.');
});

test('release optimization survives repeated clean prebuilds and retains library keep rules', async () => {
  let contents =
    'release { minifyEnabled enableMinifyInReleaseBuilds; proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro" }';
  for (let n = 0; n < 2; n++) {
    const mod = optimize({ name: 'Test', slug: 'test' });
    const result = await mod.mods.android.appBuildGradle({
      ...mod,
      modResults: { contents, language: 'groovy' },
      modRequest: { platform: 'android' },
    });
    contents = result.modResults.contents;
  }
  assert.match(contents, /getDefaultProguardFile\("proguard-android-optimize.txt"\)/);
  assert.match(contents, /"proguard-rules.pro"/);
  assert.doesNotMatch(contents, /getDefaultProguardFile\("proguard-android.txt"\)/);
});
