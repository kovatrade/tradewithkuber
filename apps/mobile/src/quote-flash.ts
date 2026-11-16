/** Distinguish a new session high/low from an ordinary quote tick. */
export function quoteMove(previous: { value?: string; high?: string; low?: string }, next: { value?: string; high?: string; low?: string }): { up: boolean; extreme: boolean } | null {
  const higher = previous.high != null && next.high != null && Number(next.high) > Number(previous.high);
  const lower = previous.low != null && next.low != null && Number(next.low) < Number(previous.low);
  const changed = previous.value != null && next.value != null && Number(next.value) !== Number(previous.value);
  if (!higher && !lower && !changed) return null;
  return { up: higher && !lower ? true : lower && !higher ? false : Number(next.value) > Number(previous.value), extreme: higher || lower };
}
