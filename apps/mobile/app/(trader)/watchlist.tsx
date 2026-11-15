import { AccountClock, BrokerWhatsAppButton, HelplineButton, Ticker, WatchlistBlock } from '@/screens';
import { Screen } from '@/ui';
import { RiskBanner } from '@/risk';

/** One watchlist. Header: account ID with the time below it (theme and notifications are in Settings). */
export default function Watchlist() {
  return (
    <Screen title="Watchlist" scroll={false} right={<><BrokerWhatsAppButton /><HelplineButton /><AccountClock /></>}>
      <WatchlistBlock header={<><RiskBanner /><Ticker /></>} />
    </Screen>
  );
}
