# Developer role and order latency

## Role and deployment

- Apply migration `0037_developer_role` through the normal API deployment migration step, then deploy the API/web and distribute a new APK.
- Super Admin can create an account with account type **Developer** from Accounts, on web or mobile. The account uses the existing account activation path.
- Developer signs in with username/password and can use all administration screens without mandatory authenticator setup. Super Admin authenticator enforcement remains.
- Only Developer may begin a Dhan connection. Both the GraphQL mutation and credential service enforce this; the callback rechecks that the initiating account is still an active Developer. Super Admin can view feed health and refresh the catalogue, but cannot authorize/reconnect Dhan.
- Existing Dhan credentials/connections remain in use; this change does not erase or force renewal of the current authorization.
- Existing saved session policies remain valid. Where no explicit Developer policy exists, the configured Super Admin session policy applies. This does not apply the Super Admin MFA requirement to Developer.
- Developer retains its actual role in sessions, audit entries and push routing; it is not impersonated as Super Admin. Developer gets administrative notifications. Trader/demo external push restrictions remain.

## Latency findings and safe changes

The user confirmed Render is in Singapore and Neon is in AWS Ohio (`us-east-2`). This is a substantial network distance for an order transaction containing sequential database operations. It is a strong explanation for higher production latency, not a measured attribution of every millisecond.

The emulator's default development URL is `http://10.0.2.2:4000`; production GitHub APK builds default to `https://tradewithkuber.onrender.com`, unless the repository variable `MOBILE_API_URL` overrides it. EAS profiles have their own configured public URLs. The running emulator logs `[api] using ...` show its actual address; shell environment overrides cannot be inferred from repository files.

Changes:

- Reuse the cash account already loaded and locked in the order transaction, avoiding another insert-on-conflict plus select during the fill. Locking, balance checks, brokerage, ledger writes, audit and idempotency remain.
- Do not start an additional cost-preview request just because the trader tapped Buy/Sell.
- Trade mutation responses include `Server-Timing: app;dur=...`. Render logs include `event: order_timing`, request ID, operation, duration and outcome. These records contain no credentials or order amounts.
- APK logs include `[order-timing] total=...ms server=app;dur=...`. Total includes network, proxy and client parsing time; the difference is not a pure network benchmark.

Measure the same account/order on emulator and phone against the same live URL after deployment. Inspect the APK logs with Android Studio Logcat or `adb logcat`, filtering for `order-timing`. Correlate with Render `order_timing` events. Do not place test trades against a user's account without authorization.

The likely main infrastructure improvement is to put the database near the API. Neon supports Singapore (`aws-ap-southeast-1`), but moving region requires a new project and a controlled data migration, not a region toggle. Keep the source database and encryption keys, verify a backup/restore and ledger/account totals, and plan a write-free cutover before switching connection strings. No production region, database or environment setting was changed during this task.

References: https://neon.com/docs/introduction/regions and https://render.com/docs/regions
