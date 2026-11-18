# Application data storage

The app does not persist every market tick or a database candle history. Instrument metadata and one latest quote checkpoint support instrument selection, trade references, market displays and recovery after a restart.

| Data | Storage and purpose |
| --- | --- |
| Instrument catalogue | One row per contract/security, updated when metadata changes. Stable IDs are referenced by watchlists, positions, orders and strategies. Retired contracts remain available for historical trade references. |
| Latest prices | One replaceable `market.quotes.v1` record in `integration_state`, not a timeline. Includes prices, previous close, OHLC, volume, last-trade time and the market-depth fields used by the app. Checkpoints are attempted once per minute when market data changes and on graceful shutdown. Identical checkpoints are not rewritten. |
| Ticks and candles | Process memory only. Minute candles are bounded to three days and daily candles to 365 bars per instrument. They disappear on restart. |
| Trading and funds | Orders, fills represented by orders, positions, ledger journals/entries, deposits, withdrawals, commissions and payment evidence are retained for account operation and reconciliation. |
| Security and administration | Accounts, sign-ins, sessions, consent, device sharing alerts, configuration versions and audit events support access control, account history and investigations. |
| Activity log | Successful routine price, chart, balance, position, order and badge refreshes are excluded. Mutations, failures and other meaningful access remain logged. Existing activity retention defaults to 365 days, with verified archives required before removal. Audit records are not deleted. |
| Notifications | In-app inbox records remain. Completed push delivery bookkeeping is removed after seven days by maintenance. Pending delivery jobs are preserved. |
| Strategies | Strategy definitions and bounded backtest results support the existing automation feature; these are not a stored market feed. |

This change does not delete existing activity/audit history or production data. The seven-day transport-job cleanup runs with normal log maintenance (`LOG_MAINTENANCE=on`). No migration or new environment variable is needed.

On an unexpected process crash, up to one minute of checkpoint updates may be lost. The feed and REST snapshot refresh restore provider data after restart; saved quote timestamps are preserved so stale prices are not treated as live. A graceful shutdown saves the latest changed checkpoint.

## Verify actual database usage after access is restored

The code audit cannot establish which Neon allowance was exhausted or which tables currently occupy the most space. These read-only queries show database size and the largest application tables (row counts are estimates):

```sql
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

SELECT relname AS table_name,
       n_live_tup AS estimated_rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

Database storage and database compute are different costs. Background risk, order matching, push delivery and market recovery still perform queries even with no users online. Lower storage volume alone does not eliminate that compute workload. Do not disable trading safeguards to reduce database usage.
