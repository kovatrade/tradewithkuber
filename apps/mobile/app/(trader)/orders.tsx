import { TradeBook } from '@/quick-trade';
import { GuideButton } from '@/screens';
import { Screen } from '@/ui';

/** Orders tab: trade book with Success / Pending / Rejected filters. */
export default function Orders() {
  return (
    <Screen title="Orders" scroll={false} right={<GuideButton />}>
      <TradeBook />
    </Screen>
  );
}
