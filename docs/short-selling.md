# Short positions and brokerage

Selling from a flat position opens a short. Buying reduces a short; selling reduces a long.
A larger opposite market order closes the existing position and opens the remainder in the
other direction, subject to entry margin, loss limits and position limits. The existing
SIMULATED execution venue remains in use; this does not introduce options contracts or
enable LIVE execution.

Entry sells fill at bid and buy-to-cover orders at ask. Short realised P&L is
`(average sell price - cover price) × lots closed`. Increasing a short updates its weighted
average entry. Brokerage is charged on every filled lot on both sides. Gross sale proceeds
are not credited to the cash balance. Intraday collateral uses the absolute position size
and the configured Mini/Mega fixed rates; carry-forward and automatic cuts apply to both
directions. Reducing or closing a position remains possible when free collateral is low.

SL and TP protect existing opposite positions only. They and ordinary limit exits are
reduce-only: a trigger is capped to remaining lots, and pending exits are cancelled when
the protected position closes or reverses. The original requested quantity is retained for
idempotent retries. Pending entry orders reserve their full fixed margin and are checked
again for funds, fees, risk state and position size when they match. A delayed entry that
fails those checks is rejected and saved in the notification inbox.

Market Details on web and mobile shows BRK Buy and BRK Sell for one lot, calculated by
the API using the same fee rule as execution. These are estimates if turnover-based fees
are configured. The order ticket no longer contains a BRK row.

## Deployment and checks

- Include migration `0038_reduce_only_orders.sql` and its journal entry. Migrate the API
  database before starting the updated API (the standard Render startup runs migrations).
  Existing SL/TP and pending SELL limit exits become reduce-only. Existing cash, fees and
  historical fills are unchanged.
- Deploy the API and web, then distribute the rebuilt mobile APK. No new environment
  variables are required. Old APKs still contain the old Sell-first restriction in the full
  instrument order screen.
- On a test account: sell one lot with no holdings, verify a negative quantity, buy it back,
  and compare realised P&L and both brokerage charges. Test a short BUY SL above market and
  BUY TP below market, then a manual exit; no remaining exit may reopen the position.
- Automated coverage: the normal API e2e suite tests the Sell-first/Buy-cover flow through
  GraphQL. The isolated trading integration suite additionally tests weighted averages,
  reversals, low collateral, partial protective fills, idempotency, delayed entries,
  carry-forward, and protection against stale internal exits.
