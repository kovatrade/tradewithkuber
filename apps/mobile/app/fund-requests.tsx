import { RequestsList } from '@/screens';
import { Screen } from '@/ui';

/** Add-funds and withdrawal requests, opened from Settings. */
export default function FundRequests() {
  return (
    <Screen back title="Fund requests">
      <RequestsList canCancel />
    </Screen>
  );
}
