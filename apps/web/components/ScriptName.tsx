import type { ReactNode } from 'react';
import { expiryLabel, fullName, marketOf } from '@/lib/format';

export interface ScriptInst { symbol?: string; name?: string; expiry?: string | null; exchange?: string; category?: string }

/**
 * A script's name the same way everywhere (watchlist, orders, positions, search, trade ticket):
 * NAME in bold capitals, then the expiry, then the market badge (MCX). `extra` follows the badge.
 */
export function ScriptName({ i, size = 'md', extra, className = '' }: { i?: ScriptInst | null; size?: 'sm' | 'md' | 'lg'; extra?: ReactNode; className?: string }) {
  if (!i) return <span className="script-name">—</span>;
  const market = marketOf(i);
  return (
    <span className={`script-identity sn-${size} ${className}`}>
      <span className="script-name">{fullName(i)}</span>
      {i.expiry && <span className="script-expiry">{expiryLabel(i.expiry)}</span>}
      {market && <span className="script-market">{market}</span>}
      {extra}
    </span>
  );
}
