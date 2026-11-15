import { BellButton, SearchButton } from '@/screens';
import { TradeBook } from '@/quick-trade';
import { Screen } from '@/ui';

/** Trade tab: the trade book (executed, pending and rejected trades). */
export default function Trade() {
  return (
    <Screen title="Trades" scroll={false} right={<><SearchButton /><BellButton /></>}>
      <TradeBook />
    </Screen>
  );
}
