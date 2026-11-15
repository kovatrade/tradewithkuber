# Firebase OTP and notifications

The implementation is ready for your Firebase configuration. Nothing in this checkout connects to the console automatically. Use **one Firebase project** for Android, iOS, web and the API. Copy the **Project ID** from Project settings; the displayed project name in the screenshot is not sufficient to identify the credentials.

Firebase handles SMS verification for **sign-up, demo login and password recovery**. The API verifies a recent, non-revoked Firebase phone sign-in, matches its phone number, and records one-time consumption in PostgreSQL. Account approval, app sessions, passwords and authorization remain in this API. Existing authenticator MFA for staff/login/step-up and session-based device enrollment remain in place; SMS does not bypass enrolled MFA. No Firestore, Realtime Database, Firebase Hosting or Cloud Functions are required.

## Notifications first (current setup; no Blaze upgrade)

FCM works on the no-cost Spark plan. Leave `SMS_PROVIDER` at its current setting and skip section 1 until you want Firebase SMS. Phone authentication, SMS region policies, and Android SHA fingerprints are not prerequisites for FCM notifications.

1. Finish the Android registration wizard by clicking **Next → Continue to console**. Save the downloaded file to `apps/mobile/google-services.json`. The file currently present matches project `tradewithkuber` and package `com.techrover.tradedesk`.
2. Project settings → Service accounts → Firebase Admin SDK → **Generate new private key**. Store the JSON privately in the API host's environment as `FIREBASE_SERVICE_ACCOUNT_JSON`.
3. Set `FIREBASE_PROJECT_ID=tradewithkuber`, `FIREBASE_PUSH_ENABLED=true`, and the existing web URL as `WEB_APP_URL` on the API. Keep `SMS_PROVIDER` unchanged. The push worker is independent of the SMS provider.
4. Apply migration `0033_firebase`, deploy the API, and build/install a new Android APK using the downloaded Android config. For GitHub builds, set the config secret described below. Expo Go cannot run native Firebase messaging.
5. Sign in, allow notification permission, open **Notifications → Send test notification**. The server checks that this session has a device registration, then queues an alert through the same persistent queue as account/trading events. Tests are limited to three requests per minute. Confirm the banner, sound, status icon, inbox item and tap navigation. Repeat with a real event while the app is in the background.

For Android notifications, the remaining console credential is the **Admin SDK service account** for the API; it is different from the Android `google-services.json`. Never paste the Admin SDK private key into chat or put it in the mobile app. Web notifications additionally need the Web app config and VAPID public key in section 5. iOS additionally needs the Apple setup in section 3.

## 1. Enable phone authentication (later)

1. Upgrade the project from **Spark to Blaze** and attach billing for real SMS. FCM itself is no-cost. Configure billing alerts and an SMS region policy before testing real numbers.
2. Firebase console → Authentication → Get started → Sign-in method → **Phone** → Enable.
3. Authentication → Settings → SMS region policy: allow **India** (and only other countries you actually support).
4. In the Phone provider's test-number settings, add a fictional number and fixed six-digit test code. Start with that number to avoid SMS charges and quota limits. Never use a real user's number as a test number.
5. Inform users in your privacy policy/consent that Google receives and stores phone numbers for abuse prevention. The send-code action initiates Firebase verification.

Official references: [phone authentication](https://firebase.google.com/docs/auth/android/phone-auth), [SMS limits/billing](https://firebase.google.com/docs/auth/limits), [Firebase pricing](https://firebase.google.com/pricing).

## 2. Register the Android app

1. Project overview → **Add app → Android**.
2. Android package name: **`com.techrover.tradedesk`**. This matches `apps/mobile/app.json`; do not use the visible app name as the package name.
3. Add **SHA-1 and SHA-256** fingerprints for every certificate used to sign installed builds: local development, CI release and Google Play App Signing (if distributed through Play).
4. Download `google-services.json` and save it to **`apps/mobile/google-services.json`**. It is ignored by Git. Download it again after changing the app's Firebase registration.
5. Do not follow the console's manual Gradle edits: this Expo project generates native files using its config plugins.

Get development fingerprints after generating Android:

```powershell
cd apps/mobile
npx expo prebuild --platform android
cd android
.\gradlew signingReport
```

For a release keystore, use `keytool -list -v -keystore <path-to-keystore> -alias <alias>` and enter its password at the prompt. An APK signed with another certificate needs that certificate's fingerprints too. Missing SHA-256 can break Play Integrity phone verification; SHA-1 is needed for the reCAPTCHA fallback. Do not restrict the Firebase API key in a way that blocks the documented phone-auth fallback.

### GitHub Actions APK builds

Repository → Settings → Secrets and variables → Actions:

* Secret **`GOOGLE_SERVICES_JSON_BASE64`**: the base64 encoding of the entire Android config file.
* Variable **`MOBILE_FIREBASE_REQUIRED=true`**: prevents publishing a build that accidentally omits Firebase configuration.
* Keep your existing Android release signing secrets, and register the release certificate's SHA-1/SHA-256 in Firebase.

To copy the public Android config as base64 in PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .\apps\mobile\google-services.json))) | Set-Clipboard
```

Run the **mobile-android** workflow after setting the secret. Install the resulting **new APK**. An existing APK cannot acquire native Firebase modules through a server deployment or a JavaScript reload. Expo Go does not include these native Firebase modules; use an installed development/release build.

## 3. Register iOS, if distributing an iPhone app

1. Add an Apple app with bundle ID **`com.techrover.tradedesk`**.
2. Download `GoogleService-Info.plist` to **`apps/mobile/GoogleService-Info.plist`** (ignored by Git).
3. Project settings → Cloud Messaging → Apple app configuration → upload the **APNs authentication key** (`.p8`) with its Key ID and Apple Team ID. Keep that key private.
4. Use an Apple provisioning profile with Push Notifications enabled. The Expo notification plugin adds the background remote-notification mode; the Firebase Auth plugin configures the verification callback scheme.
5. Build a fresh iOS app on macOS/EAS and test on a physical iPhone. This Windows workspace cannot compile or sign an iOS app.

For EAS file environment variables, `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICES_PLIST` can point to their uploaded file paths. Set them in the build environment, not as `EXPO_PUBLIC_` secrets.

References: [React Native Firebase installation](https://rnfirebase.io/), [iOS FCM setup](https://firebase.google.com/docs/cloud-messaging/ios/client).

## 4. Configure the API

Firebase console → Project settings → Service accounts → Firebase Admin SDK → **Generate new private key**. Keep the downloaded JSON on your server/secret manager. **Never put it in mobile, web, Git, a NEXT_PUBLIC_/EXPO_PUBLIC_ variable, or a chat message.**

Set these on the deployed API (for example Render → API service → Environment):

```dotenv
SMS_PROVIDER=firebase
FIREBASE_PROJECT_ID=<actual-project-id>
FIREBASE_PUSH_ENABLED=true
FIREBASE_SERVICE_ACCOUNT_JSON=<entire-service-account-json-as-one-line>
WEB_APP_URL=https://<your-web-domain>
```

The service account's `project_id` must match `FIREBASE_PROJECT_ID`. Alternatively, omit `FIREBASE_SERVICE_ACCOUNT_JSON` and use Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS` pointing to a protected server file, or workload identity on Google Cloud). The account needs Firebase Authentication token/user verification access and permission to send FCM messages. Enable the **Firebase Cloud Messaging API (HTTP v1)** for the project if it is disabled. Do not use the retired legacy FCM server-key API.

Keep all existing database, encryption and JWT secrets. Do not rotate them as part of this setup. Existing accounts and phone numbers stay in PostgreSQL.

Apply the additive database migration before deploying the API with push enabled:

```powershell
npm --prefix apps/api run db:migrate
npm --prefix apps/api run build
```

The existing API Docker startup also runs the migration script. Migration `0033_firebase` adds verified-phone replay receipts, encrypted push device registrations and the persistent push queue. It does not change existing balances, users or notifications. Follow the repository's existing production settings when switching `NODE_ENV` (secure cookies, normal market hours, normal throttling, etc.).

Reference: [verify Firebase ID tokens on your server](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

## 5. Configure the website

1. Add a **Web app** in the same Firebase project. Copy the config values from its SDK setup snippet.
2. Authentication → Settings → Authorized domains: add your deployed web hostname and `localhost` if testing locally. New Firebase projects may not include localhost automatically.
3. Project settings → Cloud Messaging → Web Push certificates → **Generate key pair**. Copy the public VAPID key.
4. Set these on the web deployment **before building** (or `apps/web/.env.local` locally):

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=<apiKey>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<authDomain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<projectId>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<messagingSenderId>
NEXT_PUBLIC_FIREBASE_APP_ID=<appId>
NEXT_PUBLIC_FIREBASE_VAPID_KEY=<public-Web-Push-key>
```

These are public app configuration values. They are different from the private service-account key. Redeploy/rebuild Next.js after changing them. OTP uses Firebase's reCAPTCHA challenge. If you use a custom Content Security Policy, allow the Google/Firebase reCAPTCHA and Firebase SDK resources documented by Firebase.

Sign in → Notifications → **Enable browser notifications**. The website registers `/firebase-messaging-sw.js` and sends its FCM token to the authenticated API. HTTPS is required outside localhost. On iOS, web push requires a supported installed Home Screen web app; use the native iOS app if that is your distribution channel.

Reference: [Firebase web phone auth](https://firebase.google.com/docs/auth/web/phone-auth), [web FCM setup](https://firebase.google.com/docs/cloud-messaging/js/client).

## 6. Verify before release

Use a physical Android phone and, if applicable, iPhone. Start with a Firebase fictional test number, then test a real allowed-region number on the billed project.

| Check | Expected result |
| --- | --- |
| New sign-up | Firebase sends/verifies the code; account remains pending approval. |
| Demo login | Verified phone opens a demo session; a full-account phone cannot become a demo. |
| Password recovery | Username plus its registered phone and fresh SMS verification changes the password and revokes all sessions/trusted devices. A different phone must fail. Enrolled MFA is still required on the next applicable login. |
| Invalid/expired SMS code | Firebase rejects it; no app session or account is created. |
| Reused Firebase proof | API rejects it, including reuse for another operation. Request a fresh code. |
| Foreground push | One banner/sound appears; notification is also in the app inbox. |
| Background/closed app | OS displays the FCM notification. Tap opens the relevant section after sign-in/unlock. |
| Permission denied | In-app inbox still works. Notification settings allow permission to be restored. |
| Sign-out/account switch | Previous session cannot receive newly dispatched alerts; registration binds to the current account. Already delivered OS notifications are cleared on explicit local sign-out where supported. |
| Temporary server/FCM failure | Queue retries; restarting the API retains pending deliveries. |
| Website | Enable browser notifications and verify both an open-tab alert and a background alert. |

To generate a real application event, use an existing flow, such as a simulated order fill or approval of a test account. The API automatically queues every `NotificationsService.notify` event for the user's registered devices. A console test message tests transport only; include `userId` and `href` data to test the app's foreground filtering/navigation. Do not use a console campaign as the only end-to-end test.

## Delivery behavior and diagnosis

* **Run the API continuously.** The checked-in `render.yaml` uses `plan: free`. A sleeping/suspended service cannot process the queue when an event is created elsewhere or dispatch retries. Choose an always-on API deployment/worker for prompt delivery. This change does not purchase a hosting plan.
* The queue is checked every **2 seconds** while the API runs. Jobs are written in the same transaction as notifications. Workers claim committed rows with PostgreSQL leases, support multiple API instances, and retry transient FCM errors up to **8 attempts** with increasing delays. Each device has its own delivery record.
* Android uses high transport priority, a high-importance `activity` channel, default sound, and a monochrome status icon. iOS uses visible APNs alerts with sound. Notifications expire after **24 hours**. Background notifications are rendered by the OS; foreground alerts are rendered locally. Notification IDs are reused as tags to reduce retry duplicates. Transport acceptance is not proof of device display; crash/network ambiguity can still produce an occasional duplicate.
* Device registrations are encrypted and tied to an app session. Sign-out/revocation/expiry blocks later sends. Quick unlock creates a new session and rebinds the token when the app is unlocked. A phone deliberately locked out of its app session receives no new pushes until it unlocks; existing inbox history remains available after unlocking.
* FCM cannot guarantee an exact delivery time. Offline devices, Android force-stop, battery restrictions, notification permissions/channels, Focus/Do Not Disturb and Apple delivery policies can delay or suppress display. Opening the app refreshes the inbox even when a push was missed. Do not promise exact-time alarms using FCM.
* Logs use the `FirebasePush` prefix and contain error codes, never raw FCM tokens or SMS codes. `messaging/mismatched-credential` usually means app/API configs belong to different projects. `messaging/third-party-auth-error` usually means Apple credentials need attention. Expired/uninstalled-device tokens are removed automatically.

Read-only queue checks:

```sql
SELECT count(*) AS pending, min(next_attempt_at) AS oldest_due
FROM push_deliveries WHERE finished_at IS NULL;

SELECT last_error, count(*) FROM push_deliveries
WHERE last_error IS NOT NULL GROUP BY last_error;

SELECT platform, count(*) FROM push_devices GROUP BY platform;
```

If a device has no registration, confirm the new build has its Firebase file, Google Play services are available on Android, permission is allowed, and the API has `FIREBASE_PUSH_ENABLED=true`. For missing SMS, check Blaze billing, Phone provider, SMS region policy, quota, authorized web domain, Android certificate fingerprints and iOS APNs setup. If a code was verified but account creation failed, correct the form and request a fresh code because phone proofs are single use.

Reference: [Android FCM priority and limits](https://firebase.google.com/docs/cloud-messaging/android/message-priority).
