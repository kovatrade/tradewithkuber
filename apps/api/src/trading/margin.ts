import { applyBps } from '../common/money';

/** Quantities are lots. A configured rupee amount applies to each lot independently. */
export function carryForwardMargin(value: bigint, lots: number, lotClass: string | undefined, bps: number, mini: number | null, mega: number | null): bigint {
  const amount = lotClass === 'MEGA' ? mega : mini;
  if (amount == null) return applyBps(value, bps);
  return BigInt(Math.round(amount * 100)) * BigInt(Math.abs(lots));
}
