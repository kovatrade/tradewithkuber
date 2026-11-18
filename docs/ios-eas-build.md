# iOS builds from Windows using EAS

Android APKs continue to use `.github/workflows/mobile-android.yml`. EAS builds the iOS
source on a cloud Mac. These are separate build services for the same Expo application.
Run EAS commands from **apps/mobile**, not the API, web or repository root.

## Prepared configuration

| Item | Setting |
| --- | --- |
| App name | The K |
| Expo project slug | tradedesk |
| iOS bundle ID | com.techrover.tradedesk |
| iOS SDK image | sdk-56 (Expo's matching macOS/Xcode image) |
| Production API | https://tradewithkuber.com |
| Preview API | https://tradewithkuber.onrender.com |
| Build numbers | Managed and incremented by EAS for production builds |

`production` creates a signed App Store/TestFlight IPA. `preview` creates an ad hoc
device build for registered iPhones; it also needs paid Apple Developer signing.
`ios-simulator` creates a simulator app, not an installable iPhone IPA. It can be built
without Apple distribution credentials, but running Apple's simulator requires a Mac.
Use a physical iPhone to verify APNs/Firebase push, login, payments and trading.

The pinned EAS CLI is invoked through npm scripts, so no global CLI installation is
required. Native projects are generated from Expo config; keep `ios/` ignored.

## 1. Finish the Expo and Apple accounts

Create an Expo account at [expo.dev](https://expo.dev/signup), and activate the paid
[Apple Developer membership](https://developer.apple.com/programs/enroll/).

In Apple Developer [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list),
register an explicit App ID for **com.techrover.tradedesk**, with **Push Notifications**
enabled. Then create the iOS application in [App Store Connect](https://appstoreconnect.apple.com/apps),
select that bundle ID, enter **The K** (subject to name availability), and use a unique
internal SKU, for example `the-k-ios`. The numeric **Apple ID** in App Information is
the App Store Connect app ID, distinct from the bundle ID and Apple Team ID.

## 2. Link the Expo project once

In PowerShell:

```powershell
cd D:\WORK\akshay-dev\trading-k\deployed-k\tradewithkuber\apps\mobile
npx --yes eas-cli@27.10.0 login
npx --yes eas-cli@27.10.0 init
```

Choose your account or organization and the `tradedesk` project. If EAS reports that it
cannot edit our dynamic config automatically, copy the project ID it supplies into
**app.json**, inside its existing `expo` object, together with your Expo owner:

```json
"owner": "YOUR_EXPO_ACCOUNT_OR_ORGANIZATION",
"extra": {
  "eas": {
    "projectId": "YOUR_REAL_EXPO_PROJECT_UUID"
  }
}
```

The dynamic config preserves these app.json fields. Keep the existing slug and bundle
identifier. Commit the real owner/project ID after linking; they are public identifiers.
Verify the link with `npx --yes eas-cli@27.10.0 project:info`.

## 3. Register Firebase's Apple app and APNs

In the existing **tradewithkuber** Firebase project, add an Apple app with bundle ID
**com.techrover.tradedesk** and download **GoogleService-Info.plist**. Android's
`google-services.json` cannot configure iOS. Save the plist locally as
`apps/mobile/GoogleService-Info.plist` (ignored by Git).

In the linked Expo project's **Environment variables**, upload a **file** variable:

| Name | Value/type | Environments |
| --- | --- | --- |
| GOOGLE_SERVICES_PLIST | Entire GoogleService-Info.plist, type File, visibility Secret | production and preview |

EAS materializes the file and sets the variable to its path on the cloud Mac. The file
must be present in each environment you build with. The profiles already set the public
API URL and production APNs mode. Render variables and GitHub Actions secrets are not
automatically copied into EAS. Do not upload the Firebase Admin service-account JSON.

In Apple Developer, create an **APNs authentication key**. Upload its `.p8` file, Key ID
and Apple Team ID to Firebase **Project settings > Cloud Messaging > Apple app
configuration**. Configure the key for the app/environment according to the APNs key's
scope. This is different from an **App Store Connect API key** used for build submission;
the two `.p8` keys are not interchangeable.

The existing plugins configure Firebase startup, phone-auth callback URLs, push
entitlements and remote-notification background mode. The iOS plugin sets RNFirebase's
CocoaPods static-framework setting. No manual Xcode edits are required for these settings.

For an optional local config check (no signing/build):

```powershell
$env:EXPO_PUBLIC_API_URL = 'https://tradewithkuber.com'
npm run check:ios
```

On EAS, the pre-install hook catches missing files and a wrong API address before
dependency installation. Prebuild additionally checks that the plist is valid, identifies
an Apple app and matches the bundle ID. It logs no plist contents or keys.

## 4. Build the signed iOS app

```powershell
npm run build:ios
```

At the EAS prompts, sign in to Apple yourself, select the correct team, and let EAS
manage the distribution certificate and provisioning profile. Complete Apple 2FA in
your terminal. Do not put Apple passwords or `.p8` contents into chat or Git.

EAS returns a build details URL and, after successful compilation/signing, an IPA
download. Check **Logs** if it fails; sharing the first failure is more useful than the
final repeated errors. No paid build or submission is started merely by pushing this
repository. The existing GitHub Android job continues as configured.

## 5. Upload the selected build to TestFlight

After reviewing the successful production build:

```powershell
npm run submit:ios
```

Select the correct build at the prompt. Set up App Store Connect submission credentials
using EAS prompts or `npx --yes eas-cli@27.10.0 credentials --platform ios`.
You can later place the real numeric Apple ID into `submit.production.ios.ascAppId`
in **eas.json**; this is required for a non-interactive submission. It is intentionally
not filled with a fake placeholder while the Apple account/app is being created.

Uploading makes the build available for Apple's processing and TestFlight. It does not
publish it on the App Store. Processing time varies, and external testers may require
Beta App Review. In App Store Connect, select the processed build, complete required
compliance information, and assign it to a TestFlight group. A public TestFlight link
belongs to an external testing group; internal testing invites authorized team members.
Check the existing encryption declaration in app.json against the final app's actual
encryption use when completing Apple's compliance questions.

On the phone, verify the live API address, sign-in, screenshots, short entries/covers,
and notifications. Traders/demo accounts receive in-app notifications only. Eligible
staff accounts use APNs/FCM; verify foreground, background, notification tap, and account
switching. Push needs Firebase's Apple APNs credentials even when the app builds successfully.

Once TestFlight is ready, the platform's existing **App releases** admin page can save
its public TestFlight URL for iPhone users on the website's Download page.

References: [Expo build setup](https://docs.expo.dev/build/setup/),
[EAS file variables](https://docs.expo.dev/eas/environment-variables/),
[EAS app versioning](https://docs.expo.dev/build-reference/app-versions/),
[iOS submission](https://docs.expo.dev/submit/ios/),
[Firebase Apple messaging](https://firebase.google.com/docs/cloud-messaging/ios/get-started).
