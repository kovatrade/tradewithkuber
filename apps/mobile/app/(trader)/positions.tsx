import { BellButton, PositionsList, SearchButton, SummaryBlock } from '@/screens';
import { RiskBanner } from '@/risk';
import { Screen } from '@/ui';

/** Positions only (trades are in the Trade tab). */
export default function Portfolio() {
  return (
    <Screen title="Positions" right={<><SearchButton /><BellButton /></>}>
      <RiskBanner />
      <SummaryBlock compact detail />
      <PositionsList canTrade />
    </Screen>
  );
}
