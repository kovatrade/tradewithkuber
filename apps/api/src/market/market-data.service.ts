import { QuoteSnapshotService } from './quote-snapshot.service';
import { DhanCatalogService } from './dhan-catalog.service';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { roundToTick } from '../common/money';
import { DbService } from '../db/db';
import { instruments, watchlistItems, type InstrumentRow } from '../db/schema';
import { pubsub, TOPIC } from '../notifications/notifications.service';
import { env } from '../config/env';
import { DhanFeedService, DHAN_SEGMENT_MAP } from './dhan-feed.service';
import { DhanGlobalFeedService } from './dhan-global-feed.service';
import { CandleStore, type Bar, type CandleInterval } from './candles';
import { baseSymbol, defaultLotClass, defaultLotLabel, linkedMiniSymbol, MCX_LISTED } from '../trading/instrument-meta';

export interface Quote {
  instrumentId: string;
  symbol: string;
  ltpMinor: bigint;
  bidMinor: bigint;
  askMinor: bigint;
  highMinor: bigint;
  lowMinor: bigint;
  prevCloseMinor: bigint;
  openMinor?: bigint;
  volume?: number;
  lastTradeAt?: Date;
  avgPriceMinor?: bigint;
  lowerCircuitMinor?: bigint;
  upperCircuitMinor?: bigint;
  depth?: { bidQty: number; askQty: number; bidPrice: bigint; askPrice: bigint }[];
  ts: Date;
  source: 'SIMULATED' | 'DHAN';
}

/**
 * Market data source abstraction. This build ships only a SIMULATED random-walk feed for
 * paper trading. A licensed real-time feed (exchange vendor / broker API) can implement the
 * same interface; quotes always carry their `source` so the UI can label them honestly.
 */
export interface MarketDataProvider {
  quote(instrumentId: string): Quote | undefined;
  all(): Quote[];
}

@Injectable()
export class MarketDataService implements MarketDataProvider, OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('MarketData');
  private quotes = new Map<string, Quote>();
  private meta = new Map<string, InstrumentRow>();
  private timer?: NodeJS.Timeout;
  private snapshotTimer?: NodeJS.Timeout;
  private refreshTimer?: NodeJS.Timeout;
  private refreshPending?: Promise<void>;
  private savePending?: Promise<void>;
  private version = 0;
  private savedVersion = 0;
  private listeners: Array<(q: Quote[]) => void> = [];
  /** Mega contract id → linked Mini ids that copy its price. */
  private linked = new Map<string, string[]>();
  private readonly history = new CandleStore();
  constructor(
    private readonly dbs: DbService,
    private readonly dhanFeed: DhanFeedService,
    private readonly dhanGlobalFeed: DhanGlobalFeedService,
    @Optional() private readonly catalog?:DhanCatalogService,
    @Optional() private readonly snapshots?: QuoteSnapshotService,
  ) {}

  async onModuleInit() {
    this.catalog?.onChange(async()=>{await this.reload();if(env().MARKET_FEED==='dhan'){await this.startDhanFeed();void this.refreshSnapshots();}});
    await this.reload();
    if (env().MARKET_FEED === 'dhan' && this.snapshots) {
      for (const q of await this.snapshots.load()) if (this.meta.has(q.instrumentId)) this.quotes.set(q.instrumentId, q);
      this.withLinked([...this.quotes.values()]);
    }
    if (process.env.NODE_ENV !== 'test') {
      const feedMode = env().MARKET_FEED;
      if (feedMode === 'dhan') {
        await this.startDhanFeed();
        this.snapshots?.onCredentialsChange(() => { void this.refreshSnapshots(); });
        void this.refreshSnapshots();
        this.refreshTimer = setInterval(() => { void this.refreshSnapshots(); }, 60000);
        // Persist a recovery checkpoint, not a tick history. Live trading continues from memory.
        this.snapshotTimer = setInterval(() => { void this.saveSnapshots(); }, 60000);
        if(env().DHAN_CATALOG_SYNC==='on')this.catalog?.startSync();
      }
      this.timer = setInterval(() => this.tick(), 1000);
    }

  }

  private async startDhanFeed() {
    if(this.catalog && !await this.catalog.usable()){this.log.warn('Waiting for a verified Dhan catalog before subscribing.');return;}
    this.log.log(`Starting Dhan Live Market Feeds (Domestic + Global) for ${this.quotes.size} instruments`);
    const secToId = new Map<string, string>();
    const domesticSubs: Array<{ exchangeSegment: string; securityId: string }> = [];
    const globalSubs: Array<{ exchangeSegment: string; securityId: string }> = [];

    for (const [id, r] of this.meta.entries()) {
      if (r.dhanSecurityId && r.dhanSegment) {
        secToId.set(`${r.dhanSegment}:${r.dhanSecurityId}`, id);

        if (r.dhanSegment === 'INX_EQ') {
          globalSubs.push({ exchangeSegment: 'INX_EQ', securityId: r.dhanSecurityId });
        } else {
          domesticSubs.push({ exchangeSegment: r.dhanSegment, securityId: r.dhanSecurityId });
        }
      }
    }

    const onIncomingTick = (tick: import('./dhan-feed.service').DhanTick, segmentOverride?: string) => {
      const segmentStr = segmentOverride || DHAN_SEGMENT_MAP[tick.segmentCode] || '';
      const instId = secToId.get(`${segmentStr}:${tick.securityId}`);
      if (!instId) return;

      const q = this.quotes.get(instId);
      const m = this.meta.get(instId);
      if (!q || !m) return;

      if (tick.prevClose && tick.prevClose > 0) q.prevCloseMinor = BigInt(Math.round(tick.prevClose * 100));
      if (tick.open && tick.open > 0) {
        q.openMinor = BigInt(Math.round(tick.open * 100));
      }
      if (tick.high && tick.high > 0) q.highMinor = BigInt(Math.round(tick.high * 100));
      if (tick.low && tick.low > 0) q.lowMinor = BigInt(Math.round(tick.low * 100));
      if (tick.volume !== undefined) q.volume = tick.volume;
      if (tick.avgPrice && tick.avgPrice > 0) q.avgPriceMinor = BigInt(Math.round(tick.avgPrice * 100));
      if (tick.depth) q.depth = tick.depth.map(d => ({ bidQty: d.bidQty, askQty: d.askQty, bidPrice: BigInt(Math.round(d.bidPrice * 100)), askPrice: BigInt(Math.round(d.askPrice * 100)) }));

      // Previous-close/OHLC packets must not overwrite the latest traded price.
      if (!Number.isFinite(tick.ltp) || tick.ltp <= 0) {
        if (q.source === 'DHAN') { this.version++; void pubsub.publish(TOPIC.quotes, { quotes: this.withLinked([q]) }); }
        return;
      }
      const ltpMinor = BigInt(Math.round(tick.ltp * 100));

      q.ltpMinor = ltpMinor;
      if (tick.bid && tick.bid > 0) q.bidMinor = BigInt(Math.round(tick.bid * 100));
      if (tick.ask && tick.ask > 0) q.askMinor = BigInt(Math.round(tick.ask * 100));

      if (tick.high && tick.high > 0) {
        q.highMinor = BigInt(Math.round(tick.high * 100));
      } else if (ltpMinor > q.highMinor) {
        q.highMinor = ltpMinor;
      }

      if (tick.low && tick.low > 0) {
        q.lowMinor = BigInt(Math.round(tick.low * 100));
      } else if (ltpMinor < q.lowMinor) {
        q.lowMinor = ltpMinor;
      }

      // Never keep a trade time from the future: it would make every later REST price look older than this one.
      if (tick.lastTradeAt && tick.lastTradeAt.getUTCFullYear() >= 2000 && tick.lastTradeAt.getTime() <= Date.now() + 300_000) q.lastTradeAt = tick.lastTradeAt;
      q.ts = tick.timestamp;
      q.source = 'DHAN';

      this.emit([q]);
    };

    if (domesticSubs.length) {
      this.dhanFeed.onTick((tick) => onIncomingTick(tick));
      this.dhanFeed.setSubscriptions(domesticSubs);
      this.dhanFeed.connect();
    }

    if (globalSubs.length) {
      this.dhanGlobalFeed.onTick((tick) => onIncomingTick(tick, 'INX_EQ'));
      this.dhanGlobalFeed.setSubscriptions(globalSubs);
      this.dhanGlobalFeed.connect();
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    await this.refreshPending;
    await this.savePending;
    await this.saveSnapshots();
    this.history.clear();
  }

  private async refreshSnapshots() {
    if (!this.snapshots || this.refreshPending) return this.refreshPending;
    this.refreshPending = (async () => {
      if (this.catalog && !await this.catalog.usable()) return;
      const start = Date.now();
      const received = await this.snapshots!.refresh([...this.meta.values()]);
      const changed: Quote[] = [];
      for (const incoming of received) {
        const current = this.quotes.get(incoming.instrumentId);
        if (!this.meta.has(incoming.instrumentId)) continue;
        if (current?.source === 'DHAN' && (current.ts.getTime() >= start - 20000 || (current.lastTradeAt && (!incoming.lastTradeAt || current.lastTradeAt > incoming.lastTradeAt)))) {
          // A REST response must not replace a newer stream price or timestamp.
          if (current.prevCloseMinor <= 0n && incoming.prevCloseMinor > 0n) { current.prevCloseMinor = incoming.prevCloseMinor; changed.push(current); }
          continue;
        }
        const sessionDay = (d: Date) => new Date(d.getTime() + 19800000).toISOString().slice(0, 10);
        if (current?.source === 'DHAN' && current.lastTradeAt && incoming.lastTradeAt && sessionDay(current.lastTradeAt) === sessionDay(incoming.lastTradeAt)) {
          // Closed books sometimes omit OHLC/depth fields. Retain that session's last valid values.
          if (incoming.prevCloseMinor <= 0n) incoming.prevCloseMinor = current.prevCloseMinor;
          for (const key of ['bidMinor', 'askMinor', 'highMinor', 'lowMinor', 'openMinor', 'avgPriceMinor', 'lowerCircuitMinor', 'upperCircuitMinor'] as const) {
            if (!(incoming[key] && incoming[key]! > 0n)) incoming[key] = current[key] as bigint;
          }
          if (!incoming.depth?.some(d => d.bidPrice > 0n || d.askPrice > 0n)) incoming.depth = current.depth;
          incoming.volume ??= current.volume;
        }
        this.quotes.set(incoming.instrumentId, incoming); changed.push(incoming);
      }
      if (changed.length) this.emit(changed);
    })().catch(error => this.log.warn(`Could not refresh quote snapshots: ${(error as Error).message}`)).finally(() => { this.refreshPending = undefined; });
    return this.refreshPending;
  }

  private async saveSnapshots() {
    if (!this.snapshots || this.version === this.savedVersion || this.savePending) return;
    const version = this.version;
    this.savePending = this.snapshots.save([...this.quotes.values()]).then(() => { this.savedVersion = version; })
      .catch(() => { this.log.warn('Could not save last-known quotes; the next save will retry.'); }).finally(() => { this.savePending = undefined; });
    await this.savePending;
  }

  feedStatus() {
    return { domestic: this.dhanFeed.status(), global: this.dhanGlobalFeed.status() };
  }

  /** Clear transient market data after a platform reset. */
  async clearAll() {
    await this.refreshPending;
    await this.savePending;
    this.history.clear();
    this.quotes.clear();
    this.meta.clear();
    this.dhanFeed.setSubscriptions([]);
    this.dhanGlobalFeed.setSubscriptions([]);
    await this.snapshots?.clear();
    this.savedVersion = this.version;
  }

  /** Load instrument metadata; candle history exists only in this process. */
  async reload() {
    let rows = await this.dbs.db.select().from(instruments).where(eq(instruments.active, true));
    const fixed = await this.fixMcxLots(rows).catch((e) => { this.log.warn(`Could not correct MCX lot details: ${(e as Error).message}`); return false; });
    if (fixed) rows = await this.dbs.db.select().from(instruments).where(eq(instruments.active, true));
    const linkedChanged = await this.syncLinkedMinis(rows).catch((e) => { this.log.warn(`Could not update linked Mini scripts: ${(e as Error).message}`); return false; });
    if (linkedChanged) rows = await this.dbs.db.select().from(instruments).where(eq(instruments.active, true));
    await this.moveWatchlistsToLinkedMinis(rows).catch((e) => this.log.warn(`Could not move watchlists to linked Mini scripts: ${(e as Error).message}`));
    const now = Date.now();
    const liveIds=new Set(rows.map(r=>r.id));
    for(const id of this.meta.keys())if(!liveIds.has(id)){this.meta.delete(id);this.quotes.delete(id);this.history.forget(id);}
    for (const r of rows) {
      this.meta.set(r.id, r);
      if (this.quotes.has(r.id)) continue;
      const spread = BigInt(r.tickMinor) * 4n;
      this.quotes.set(r.id, {
        instrumentId: r.id,
        symbol: r.symbol,
        ltpMinor: r.refPriceMinor,
        bidMinor: r.refPriceMinor - spread,
        askMinor: r.refPriceMinor + spread,
        highMinor: r.refPriceMinor,
        lowMinor: r.refPriceMinor,
        prevCloseMinor: env().MARKET_FEED === 'dhan' ? 0n : (r.refPriceMinor * 97n) / 100n,
        ts: new Date(),
        source: 'SIMULATED',
      });
    }
    if (env().MARKET_FEED === 'dhan') {
      for (const q of this.quotes.values()) if (q.source !== 'DHAN') Object.assign(q, { ltpMinor: 0n, bidMinor: 0n, askMinor: 0n, highMinor: 0n, lowMinor: 0n, prevCloseMinor: 0n });
    }
    this.linked.clear();
    for (const r of rows) if (r.priceSourceId) this.linked.set(r.priceSourceId, [...(this.linked.get(r.priceSourceId) ?? []), r.id]);
    this.withLinked([...this.quotes.values()]);
    if (env().MARKET_FEED === 'simulated') {
      for (const r of rows) {
        if (this.history.has(r.id)) continue;
        const q = this.quotes.get(r.id)!;
        this.history.seed(r.id, Number(q.ltpMinor), Number(q.prevCloseMinor), r.tickMinor, now);
      }
    }
  }

  onTick(fn: (q: Quote[]) => void) {
    this.listeners.push(fn);
  }

  /** Test hook: set a deterministic price. */
  setPrice(instrumentId: string, ltpMinor: bigint) {
    const q = this.quotes.get(instrumentId);
    const m = this.meta.get(instrumentId);
    if (!q || !m) return;
    const spread = BigInt(m.tickMinor) * 2n;
    Object.assign(q, { ltpMinor, bidMinor: ltpMinor - spread, askMinor: ltpMinor + spread, ts: new Date() });
    this.emit([q]);
  }

  private tick() {
    const changed: Quote[] = [];
    if (env().MARKET_FEED === 'dhan') return; // Never substitute synthetic ticks for missing live instruments.
    for (const q of this.quotes.values()) {
      const m = this.meta.get(q.instrumentId);
      if (!m || m.priceSourceId) continue; // a linked Mini moves with its Mega
      // Skip simulated tick for real exchange instruments subscribed to Dhan feed
      if (Math.random() < 0.5) continue;
      const drift = (Math.random() - 0.5) * 0.0016; // ±0.08%
      const next = roundToTick(q.ltpMinor + BigInt(Math.round(Number(q.ltpMinor) * drift)), m.tickMinor);
      const ltp = next > 0n ? next : q.ltpMinor;
      const spreadTicks = BigInt(1 + Math.floor(Math.random() * 6));
      const t = BigInt(m.tickMinor);
      q.ltpMinor = ltp;
      q.bidMinor = ltp - t * spreadTicks;
      q.askMinor = ltp + t * spreadTicks;
      if (ltp > q.highMinor) q.highMinor = ltp;
      if (ltp < q.lowMinor) q.lowMinor = ltp;
      q.ts = new Date();
      changed.push(q);
    }
    if (changed.length) this.emit(changed);
  }

  /**
   * Copy each Mega quote onto its linked Mini scripts (same bid/ask/LTP; only the lot differs) and return the input
   * plus the updated Mini quotes, so they are published, recorded and matched together.
   */
  private withLinked(changed: Quote[]): Quote[] {
    if (!this.linked.size) return changed;
    const out = [...changed];
    for (const src of changed) {
      for (const id of this.linked.get(src.instrumentId) ?? []) {
        const m = this.meta.get(id);
        if (!m) continue;
        const copy = { ...src, instrumentId: id, symbol: m.symbol };
        const cur = this.quotes.get(id);
        if (cur) Object.assign(cur, copy); else this.quotes.set(id, copy);
        out.push(this.quotes.get(id)!);
      }
    }
    return out;
  }

  /**
   * Keep one linked Mini row per active Mega contract (GOLD → GOLDM-…-LNK, SILVER → SILVERM-…-LNK ...) and retire
   * linked rows whose Mega is no longer active. `rows` are the active instruments. Returns true when anything changed.
   */
  private async syncLinkedMinis(rows: InstrumentRow[]): Promise<boolean> {
    const active = new Map(rows.map((r) => [r.id, r]));
    const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
    let changed = false;
    for (const r of rows) {
      if (r.exchange !== 'MCX' || r.priceSourceId || !r.expiry) continue;
      const sym = linkedMiniSymbol(r.symbol, r.expiry);
      if (!sym) continue;
      const cur = bySymbol.get(sym);
      if (cur && cur.priceSourceId === r.id && cur.expiry?.getTime() === r.expiry.getTime() && cur.tickMinor === r.tickMinor) continue;
      const keep = { active: true, priceSourceId: r.id, expiry: r.expiry, tickMinor: r.tickMinor };
      await this.dbs.db.insert(instruments).values({
        symbol: sym, name: r.name.replace(/^\S+/, sym.split('-')[0]).slice(0, 120), exchange: 'MCX', segment: r.segment, lotSize: 1,
        lotClass: 'MINI', lotLabel: defaultLotLabel(sym), refPriceMinor: r.refPriceMinor, ...keep,
      }).onConflictDoUpdate({ target: instruments.symbol, set: keep });
      changed = true;
    }
    const orphans = rows.filter((r) => r.priceSourceId && !active.has(r.priceSourceId)).map((r) => r.id);
    if (orphans.length) {
      await this.dbs.db.update(instruments).set({ active: false }).where(inArray(instruments.id, orphans));
      changed = true;
    }
    return changed;
  }

  /**
   * The 7 MCX scripts carry their exchange lot: Mega or Mini by contract (COPPER = Mega, 2,500 kg; COPPERM = Mini,
   * 250 kg) and its size. Rows saved earlier with another lot type or size (COPPER as "Mini · 250 kg") are corrected,
   * since lot type also sets margin and brokerage. Returns true when anything changed.
   */
  private async fixMcxLots(rows: InstrumentRow[]): Promise<boolean> {
    let changed = false;
    for (const r of rows) {
      if (r.exchange !== 'MCX' || !MCX_LISTED[baseSymbol(r.symbol)]) continue;
      const lotClass = defaultLotClass('MCX', r.symbol), lotLabel = defaultLotLabel(r.symbol) ?? r.lotLabel;
      if (r.lotClass === lotClass && r.lotLabel === lotLabel) continue;
      await this.dbs.db.update(instruments).set({ lotClass, lotLabel }).where(eq(instruments.id, r.id));
      this.log.log(`MCX lot corrected: ${r.symbol} ${r.lotClass}/${r.lotLabel ?? '-'} -> ${lotClass}/${lotLabel ?? '-'}`);
      changed = true;
    }
    return changed;
  }

  /**
   * Watchlist rows still on a separate MCX mini contract (GOLDM, SILVERM ... from before Minis followed the Mega rate)
   * move to the nearest linked Mini, so the watchlist shows the same rate as the Mega. Open positions are not touched.
   */
  private async moveWatchlistsToLinkedMinis(rows: InstrumentRow[]) {
    const nearest = new Map<string, InstrumentRow>();
    for (const r of rows) {
      if (!r.priceSourceId || !r.expiry) continue;
      const b = baseSymbol(r.symbol), cur = nearest.get(b);
      if (!cur || cur.expiry! > r.expiry) nearest.set(b, r);
    }
    if (!nearest.size) return;
    const real = new Map(rows.filter((r) => r.exchange === 'MCX' && !r.priceSourceId && nearest.has(baseSymbol(r.symbol))).map((r) => [r.id, r]));
    if (!real.size) return;
    const items = await this.dbs.db.select().from(watchlistItems).where(inArray(watchlistItems.instrumentId, [...real.keys()]));
    for (const w of items) {
      const to = nearest.get(baseSymbol(real.get(w.instrumentId)!.symbol))!;
      await this.dbs.db.transaction(async (tx) => {
        await tx.insert(watchlistItems).values({ userId: w.userId, listIndex: w.listIndex, instrumentId: to.id, sortOrder: w.sortOrder, createdAt: w.createdAt, archivedAt: w.archivedAt }).onConflictDoNothing();
        await tx.delete(watchlistItems).where(eq(watchlistItems.id, w.id));
      });
    }
    if (items.length) this.log.log(`Moved ${items.length} watchlist row(s) to linked Mini scripts.`);
  }

  private emit(changed: Quote[]) {
    changed = this.withLinked(changed);
    if (changed.some(q => q.source === 'DHAN')) this.version++;
    for (const q of changed) {
      this.history.record(q.instrumentId, Number(q.ltpMinor), q.ts.getTime());
    }
    void pubsub.publish(TOPIC.quotes, { quotes: changed });
    for (const l of this.listeners) {
      try {
        l(changed);
      } catch (e) {
        this.log.error((e as Error).message);
      }
    }
  }

  quote(instrumentId: string) {
    const q=this.quotes.get(instrumentId);
    return env().MARKET_FEED==='dhan' && q?.source!=='DHAN'?undefined:q;
  }

  hasVerifiedCatalog(){return this.catalog?.isFresh()??true;}

  instrumentCount(){return this.meta.size;}

  all() {
    return [...this.quotes.values()].filter(q=>env().MARKET_FEED!=='dhan'||q.source==='DHAN');
  }

  /** Recent, process-local OHLC candles. No database reads or writes. */
  async candles(instrumentId: string, interval: CandleInterval, limit: number, before?: number): Promise<Bar[]> {
    return this.history.candles(instrumentId, interval, limit, before);
  }

  instrument(instrumentId: string) {
    return this.meta.get(instrumentId);
  }
}
