import { useLocalSearchParams } from 'expo-router';
import { SearchView } from '@/screens';

/** Instrument search. `?mode=add` opens the simple contract picker; additions save immediately to `?list=` (0 or 1). */
export default function Search() {
  const { mode, list } = useLocalSearchParams<{ mode?: string; list?: string }>();
  return <SearchView addMode={mode === 'add'} listIndex={list === '1' ? 1 : 0} />;
}
