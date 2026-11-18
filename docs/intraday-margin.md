# Fixed intraday margin

Intraday margin is a fixed rupee amount per lot:

| Lot class | Initial margin for one lot | For two lots |
| --- | --- | --- |
| Mini | ₹7,500 | ₹15,000 |
| Mega | ₹75,000 | ₹1,50,000 |

Administrators can edit **Intraday margin per Mini lot** and **Intraday margin per Mega lot** in Configuration on web and mobile. Values support paise precision. The shared API supplies the labels, rupee units and numeric controls to both clients.

The old percentage-based intraday setting is removed from active configuration and calculations. Existing stored versions of that setting remain in the database for historical traceability; they are ignored. The fixed settings use the above defaults until an administrator saves another amount. No new environment variable or database migration is required.

The same fixed amounts apply to previews, new-order affordability, open intraday positions, pending-order reservations, account summaries and withdrawable balances. Persisted instrument lot classes are used for held-margin calculations even if an instrument is no longer in the live feed. Prices can change order value, P&L and brokerage without changing the fixed intraday amount per lot.

Carry-forward keeps its separately configured margin rules. Switching either way is serialized with orders/withdrawals through the cash-account lock. Turning carry-forward off is rejected when the fixed intraday requirement would need more free funds than the account has. Closing a position remains permitted with low free margin and applies the normal brokerage and P&L calculation.

## Rollout

Deploy the API. Current web/mobile clients load the new settings from API metadata; this change does not require another APK build.

The new rates recalculate held/available margin for existing intraday positions and pending orders immediately after deployment. Ledger cash, lifetime credits, trade prices and historical financial entries are not rewritten. Accounts with less free margin may need more funds before opening another position or withdrawing; they can still close positions.
