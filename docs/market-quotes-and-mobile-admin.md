# Quote continuity and mobile administration

## Closed-market data

The API retains the last Dhan quote, its previous close, OHLC, exchange trade time, volume and depth. Day change is `LTP − previous close`; percentage change is rounded to two decimal places. A missing previous close produces an unavailable change, rather than treating the full LTP as a gain.

The Dhan previous-close feed packet supplies the reference price. Domestic REST quote snapshots also derive it from `last_price − net_change`. The feed's OHLC close is deliberately not used as a previous close: after market close it can represent the current session's closing price.

Snapshots refresh at startup, after reconnecting Dhan or refreshing the catalog, and every minute. Requests contain at most 1,000 instruments with a delay between batches to respect the provider limit. New stream prices take precedence over older REST responses. US/global quotes retain data from the existing global stream; the domestic REST endpoint is not used for them.

Last-known quotes are saved to the existing `integration_state` table every 15 seconds and on graceful shutdown, then restored on restart. A provider failure retains saved prices. Display timestamps remain the last exchange trade time where supplied. Missing trade times and other unavailable fields are not invented. No new migration or environment variables are required.

Closed-market tickets display one message, such as “Market is closed as per commodity timing rules.” Cost previews can use last-known quotes after close. This does not refresh their timestamps or allow stale-price execution. During market hours, the existing fresh-quote execution checks remain active.

Use `MARKET_HOURS=config` on the deployed API and enable `trading.enforceMarketHours` in Configuration so server execution enforces the configured exchange sessions and holidays. `always_open` is a development override. Verify exchange open/close times in `trading.marketHours` against your intended trading rules.

## Mobile administration

Sign in as Super Admin, open **Settings → Administration**, and select any destination also available in the web sidebar. Native tools now cover configuration changes and version history, mini/mega lot controls and labels, activity filters and CSV export, login/consent records, audit verification and details, reconciliation summaries, archives and retention, app releases, and course enquiries. Existing account, payment-account, commission, Dhan and reset tools remain accessible there.

Transactions include review and history filters, dates, pagination, payment evidence and reviewer details. Login and consent records support pagination, detailed records and CSV sharing. App downloads support selecting an APK on the device, uploading it, publishing an Apple link and removing releases, subject to the same server storage configuration as the web.

Admin role checks, MFA, step-up verification and maker/checker rules are enforced by the existing API. Configuration edits use the same schemas and database values as the web; a pending proposal still requires its normal approval.

## Deployment verification

1. Deploy the API and web changes, and build/install the updated Android APK.
2. Confirm **Market data** shows a valid Dhan connection and verified catalog. REST snapshots need the existing Dhan client ID and an active authorized access token; reconnect Dhan if authorization has expired.
3. For a known instrument, compare LTP, previous close, change, percentage and last trade time during and after the session. For the supplied GOLD example, 134,550 minus 136,705 must show −2,155.00 (−1.58%).
4. Restart the API after a quote has been saved and verify the last-known values remain visible. Quotes should update when the provider sends new data.
5. After close, check that the ticket shows one timing message and disables trading. During an open session with stale data, orders must remain blocked until fresh quotes arrive.
6. As Super Admin, check the Administration menu and complete a permitted configuration change. As Broker/Trader, confirm admin destinations remain inaccessible.
