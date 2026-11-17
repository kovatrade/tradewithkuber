# Android APK size and downloads

The published build inspected on 17 November 2026 was **109,035,700 bytes (109.04 MB)**. Its ZIP directory showed:

| Packaged content | Size in APK |
| --- | ---: |
| Native libraries for four CPU architectures | 80.88 MB |
| Compiled Android code (DEX) | 19.62 MB |
| App bundle and assets | 3.67 MB |
| Resources, manifest and metadata | Approximately 4.87 MB |

This was a universal release APK with uncompressed native libraries and release shrinking disabled. Screens and database records were not the main cause of its size.

## Measured release result

The optimized 64-bit release APK built locally is **18,290,457 bytes (18.29 MB / 17.44 MiB)**, an approximately **83% reduction**. APK signature verification and the strict 20,000,000-byte size check passed; the notification icon and colour resources remain present. This is a release build measurement, not a claim that the production download has already been updated.

The separate 32-bit release APK is **17,432,755 bytes (17.43 MB)**. Its APK signature, architecture and strict download-size checks also passed.

## Build changes

- `app.config.js` enables R8 minification, unused-resource shrinking, bundle compression and native-library compression through `expo-build-properties`.
- `with-android-release-optimization` selects Android's standard optimized ProGuard configuration while retaining the application's and libraries' keep rules. Editing only the ignored `android` directory would be lost on the next clean prebuild.
- GitHub Actions builds separate **arm64-v8a** and **armeabi-v7a** release APKs. The main website download is 64-bit; the compatibility link is for supported 32-bit phones. Emulator architectures remain available to local development builds.
- Each build runs `scripts/apk-size-report.py`, which checks the actual APK architecture, native compression and a strict limit of **20,000,000 bytes**. It uploads the APK, size report and R8 mapping file as build artifacts. An oversized APK fails the check before publication.
- CI Metro bundling uses two workers to leave memory available for Gradle/R8. Local development keeps Expo's default worker count.
- EAS `preview` selects 64-bit APKs; `preview-32-bit` selects 32-bit APKs. The production AAB profile remains available for Google Play, which handles device-specific delivery.

Compressed APK download size is different from installed storage usage. Android extracts compressed native libraries during installation, so installed size will be larger.

## Deployment

1. Deploy API migration **0036_apk_abi** with the API and web changes. The existing migration runner applies it. Existing unlabelled releases remain usable until new builds are published.
2. The existing mobile GitHub workflow builds and publishes both variants using the same signing and Firebase secrets already configured. No new secrets or Render environment variables are required.
3. New builds publish through `/app-files/ci-upload/variant`. An older API without variant support returns 404 instead of accepting the 32-bit file as the primary APK. If that happens during deployment, finish the API deployment and rerun the workflow.
4. Verify `/download` shows the main APK and the older-phone link. Their endpoints are `/app-files/android/latest` and `/app-files/android/32-bit/latest`.
5. For manual uploads in web/mobile administration, select the matching 64-bit, 32-bit or universal APK type. History labels distinguish the variants. Retention keeps three APK files per variant.
6. Install the optimized release on a compatible phone and check login, notifications and payment screenshot selection. Compile-time checks do not replace a device test after enabling R8.

## Local release checks

Regenerate the native settings without deleting the native project:

```powershell
cd apps/mobile
npx expo prebuild -p android --no-install
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2
```

Select `armeabi-v7a` instead for the compatibility APK. Copy the first output before building the other variant: both local commands write `app/build/outputs/apk/release/app-release.apk`.

From `apps/mobile`, inspect a build with:

```powershell
python scripts/apk-size-report.py android/app/build/outputs/apk/release/app-release.apk --expected-abi arm64-v8a --max-mb 20
```

Debug/emulator APKs are not subject to this release-size target.

References: [Expo SDK 56 build properties](https://docs.expo.dev/versions/v56.0.0/sdk/build-properties/), [Android R8 optimization](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization), [Android APK architecture splitting](https://developer.android.com/build/configure-apk-splits).
