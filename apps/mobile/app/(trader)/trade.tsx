import { TradeList } from '@/quick-trade';
import { Screen } from '@/ui';

/** Trade tab: executed and pending trades in one list, with search and filters. */
export default function Trade() {
  return (
    <Screen title="Trade" scroll={false}>
      <TradeList />
    </Screen>
  );
}
