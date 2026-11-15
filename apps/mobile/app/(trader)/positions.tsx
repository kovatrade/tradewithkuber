import { GuideButton, PositionsList, PositionsSummary } from '@/screens';
import { RiskBanner } from '@/risk';
import { Screen } from '@/ui';

/** Positions only (trades are in the Trade tab). Header: logo and the "नियम" (guidelines) button. */
export default function Portfolio() {
  return (
    <Screen title="" right={<GuideButton blink />}>
      <RiskBanner />
      <PositionsSummary />
      <PositionsList canTrade />
    </Screen>
  );
}
