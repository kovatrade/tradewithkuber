import { LedgerList } from '@/screens';
import { Screen } from '@/ui';

export default function Ledger() {
  return <Screen back title="Transactions" scroll={false}><LedgerList virtual /></Screen>;
}
