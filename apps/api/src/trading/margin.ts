import { applyBps } from '../common/money';

/** Fixed rupees per lot. Market price does not change the required intraday margin. */
export function intradayMargin(lots: number, lotClass: string | undefined, mini: number, mega: number): bigint {
  const amount = lotClass === 'MEGA' ? mega : mini;
  return BigInt(Math.round(amount * 100)) * BigInt(Math.abs(lots));
}

/** Quantities are lots. A configured rupee amount applies to each lot independently. */
export function carryForwardMargin(value: bigint, lots: number, lotClass: string | undefined, bps: number, mini: number | null, mega: number | null): bigint {
  const amount = lotClass === 'MEGA' ? mega : mini;
  if (amount == null) return applyBps(value, bps);
  return BigInt(Math.round(amount * 100)) * BigInt(Math.abs(lots));
}
