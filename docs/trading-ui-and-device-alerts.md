# Trading display and device alerts

- Watchlist **Credit balance** is the lifetime sum of positive posted opening funds and deposits. Withdrawals, trade P&L, brokerage and held margin do not change it. The existing available balance continues to control withdrawals and order affordability; positions show the changing account figures.
- Order tickets show **Market price → Order value → BRK → Intraday margin → C/F margin**. Watchlist entry offers market orders. Open the instrument from Positions to use Limit or SL.
- A position's **Exit** button submits an immediate market close. The API determines the current position size under its normal order lock, posts P&L and brokerage through the existing ledger, and makes retries idempotent. Market-hours and trading-consent checks still apply. It can close a position larger than the per-order opening limit without reopening or reversing it.

## Carry-forward configuration

In Super Admin Configuration, set:

- `trading.carryForwardMarginPerMiniLot`: rupees required for one mini lot.
- `trading.carryForwardMarginPerMegaLot`: rupees required for one mega lot.

For example, a value of `1500.25` requires ₹4,500.75 for three lots. Each setting defaults to `null`, preserving the existing percentage calculation until an amount is configured. A numeric zero explicitly sets zero margin. Changes use the existing configuration approval/history workflow. Previews, carry-forward checks and held margin all use these settings.

## Same-device login alerts

Web and mobile send a persistent random installation/browser identifier with successful sign-ins. The API stores its hash and account login history independently of sessions, so logout does not erase it. When another account signs in with the same identifier, active Super Admins receive a saved `security.shared_device` notification with both account names/roles, login times in IST, IP addresses, device description and a device reference. The full event is also saved in audit history. Notifications open the inbox so all details can be read.

Tracking starts with updated clients. Separate browser profiles, cleared storage or a new installation may have a different identifier; this is not hardware fingerprinting. Shared IP addresses alone do not trigger alerts.

## Deployment

Apply migration `0035_device_account_logins` before serving the updated API. Deploy the API before the web/new APK, since clients request the new `creditBalance` field and `exitPosition` mutation. No new environment variables or dependencies are required. Existing API startup migration commands apply the new table.

Validation includes isolated PostgreSQL regression tests for lifetime credits, withdrawal independence, mini/mega margin and brokerage, duplicate/concurrent exits, cross-account restrictions and shared-device alerts after logout. The integration suite requires `RUN_TRADING_INTEGRATION=true` and a separately migrated local database named `tradedesk_trading_test_*`; it refuses other database names/hosts.
