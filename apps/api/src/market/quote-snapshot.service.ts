import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db';
import { integrationState, type InstrumentRow } from '../db/schema';
import { DhanCredentialsService } from './dhan-credentials.service';
import type { Quote } from './market-data.service';
import { env } from '../config/env';

const KEY = 'market.quotes.v1';
const money = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? BigInt(Math.round(v * 100)) : undefined;
export function dhanTradeTime(value: unknown): Date | undefined {
  if (typeof value !== 'string') return;
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(value);
  const d = new Date(
    m
      ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}+05:30`
      : /[Zz]|[+-]\d\d:\d\d$/.test(value)
        ? value
        : value.replace(' ', 'T') + '+05:30',
  );
  return Number.isFinite(d.getTime()) && d.getUTCFullYear() >= 2000 && d.getTime() <= Date.now() + 300000
    ? d
    : undefined;
}

export function snapshotQuote(i: InstrumentRow, value: any): Quote | undefined {
  const ltp = money(value?.last_price);
  if (!ltp) return;
  // net_change is the provider's day-on-day change; OHLC close may be the current session close after hours.
  const change =
    typeof value.net_change === 'number' && Number.isFinite(value.net_change)
      ? BigInt(Math.round(value.net_change * 100))
      : undefined;
  const previous = change !== undefined && ltp - change > 0n ? ltp - change : 0n;
  const lastTradeAt = dhanTradeTime(value.last_trade_time);
  const buy = value.depth?.buy ?? [],
    sell = value.depth?.sell ?? [];
  const depth = Array.from({ length: Math.min(5, Math.max(buy.length, sell.length)) }, (_, n) => ({
    bidQty: Math.max(0, Number(buy[n]?.quantity) || 0),
    askQty: Math.max(0, Number(sell[n]?.quantity) || 0),
    bidPrice: money(buy[n]?.price) ?? 0n,
    askPrice: money(sell[n]?.price) ?? 0n,
  }));
  return {
    instrumentId: i.id,
    symbol: i.symbol,
    source: 'DHAN',
    ltpMinor: ltp,
    bidMinor: depth[0]?.bidPrice ?? 0n,
    askMinor: depth[0]?.askPrice ?? 0n,
    openMinor: money(value.ohlc?.open),
    highMinor: money(value.ohlc?.high) ?? 0n,
    lowMinor: money(value.ohlc?.low) ?? 0n,
    prevCloseMinor: previous,
    avgPriceMinor: money(value.average_price),
    lowerCircuitMinor: money(value.lower_circuit_limit),
    upperCircuitMinor: money(value.upper_circuit_limit),
    volume:
      typeof value.volume === 'number' && Number.isFinite(value.volume) && value.volume >= 0 ? value.volume : undefined,
    depth,
    lastTradeAt,
    ts: lastTradeAt ?? new Date(0),
  };
}

@Injectable()
export class QuoteSnapshotService {
  private readonly log = new Logger('QuoteSnapshot');
  private refreshing?: Promise<Quote[]>;
  constructor(
    private readonly dbs: DbService,
    private readonly credentials: DhanCredentialsService,
  ) {}
  onCredentialsChange(fn: () => void) {
    this.credentials.onChange(fn);
  }
  async load(): Promise<Quote[]> {
    const [row] = await this.dbs.db.select().from(integrationState).where(eq(integrationState.name, KEY));
    const data = row?.value as any;
    if (!Array.isArray(data?.quotes)) return [];
    return data.quotes.flatMap((raw: any) => {
      try {
        if (raw.source !== 'DHAN' || typeof raw.instrumentId !== 'string') return [];
        const q = {
          ...raw,
          ts: new Date(raw.ts),
          lastTradeAt: dhanTradeTime(raw.lastTradeAt),
        };
        for (const k of [
          'ltpMinor',
          'bidMinor',
          'askMinor',
          'highMinor',
          'lowMinor',
          'prevCloseMinor',
          'openMinor',
          'avgPriceMinor',
          'lowerCircuitMinor',
          'upperCircuitMinor',
        ])
          if (q[k] != null) q[k] = BigInt(q[k]);
        q.depth = raw.depth?.map((level: any) => ({
          ...level,
          bidPrice: BigInt(level.bidPrice),
          askPrice: BigInt(level.askPrice),
        }));
        if (
          ['ltpMinor', 'bidMinor', 'askMinor', 'highMinor', 'lowMinor', 'prevCloseMinor'].some(
            (k) => typeof q[k] !== 'bigint' || q[k] < 0n,
          )
        )
          return [];
        if (q.ltpMinor <= 0n || !Number.isFinite(q.ts.getTime()) || q.ts.getTime() > Date.now() + 300000) return [];
        return [q as Quote];
      } catch {
        return [];
      }
    });
  }
  async save(quotes: Quote[]) {
    const value = JSON.parse(
      JSON.stringify({ quotes: quotes.filter((q) => q.source === 'DHAN') }, (_k, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      ),
    );
    await this.dbs.db
      .insert(integrationState)
      .values({ name: KEY, value })
      .onConflictDoUpdate({ target: integrationState.name, set: { value, updatedAt: new Date() } });
  }
  async clear() {
    await this.dbs.db.delete(integrationState).where(eq(integrationState.name, KEY));
  }
  refresh(instruments: InstrumentRow[]) {
    return (this.refreshing ??= this.fetch(instruments).finally(() => {
      this.refreshing = undefined;
    }));
  }
  private async fetch(instruments: InstrumentRow[]): Promise<Quote[]> {
    const token = await this.credentials.token();
    if (!token || !env().DHAN_CLIENT_ID) return [];
    const domestic = instruments.filter(
      (i) => i.dhanSegment && i.dhanSegment !== 'INX_EQ' && /^\d+$/.test(i.dhanSecurityId ?? ''),
    );
    const quotes: Quote[] = [];
    for (let offset = 0; offset < domestic.length; offset += 1000) {
      // Dhan permits one snapshot request per second, including multi-instrument requests.
      if (offset) await new Promise((resolve) => setTimeout(resolve, 1100));
      const group = domestic.slice(offset, offset + 1000),
        body: Record<string, number[]> = {};
      for (const i of group) (body[i.dhanSegment!] ??= []).push(Number(i.dhanSecurityId));
      try {
        const res = await fetch('https://api.dhan.co/v2/marketfeed/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'access-token': token, 'client-id': env().DHAN_CLIENT_ID! },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result: any = await res.json();
        if (result.status !== 'success') throw new Error('Snapshot unavailable');
        for (const i of group) {
          const q = snapshotQuote(i, result.data?.[i.dhanSegment!]?.[i.dhanSecurityId!]);
          if (q) quotes.push(q);
        }
      } catch (error) {
        this.log.warn(`Quote snapshot refresh failed: ${(error as Error).message}. Last received quotes are retained.`);
        break;
      }
    }
    return quotes;
  }
}
