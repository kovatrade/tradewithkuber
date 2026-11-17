import 'reflect-metadata';
import { snapshotQuote, dhanTradeTime, QuoteSnapshotService } from '../src/market/quote-snapshot.service';
import { MarketDataService } from '../src/market/market-data.service';
import { toQuote } from '../src/common/mappers';
import { sessionStatus } from '../src/trading/market-hours';
import { OrdersService } from '../src/trading/orders.service';
import { CONFIG_REGISTRY } from '../src/config-mgmt/registry';

jest.mock('../src/config/env', () => ({
  env: () => ({ MARKET_FEED: 'dhan', MARKET_HOURS: 'config', DHAN_CLIENT_ID: 'test-client' }),
}));
const instrument: any = {
  id: 'gold',
  symbol: 'GOLD-04Dec2026-FUT',
  name: 'Gold',
  exchange: 'MCX',
  segment: 'FUT',
  category: 'COMMODITY',
  lotSize: 100,
  tickMinor: 100,
  refPriceMinor: 0n,
  active: true,
  dhanSegment: 'MCX_COMM',
  dhanSecurityId: '123',
};
const payload = {
  last_price: 134550,
  net_change: -2155,
  last_trade_time: '16/11/2026 23:54:59',
  average_price: 135100,
  volume: 0,
  ohlc: { open: 136199, close: 134550, high: 136055, low: 134200 },
  depth: { buy: [{ quantity: 5, price: 134500 }], sell: [{ quantity: 8, price: 134640 }] },
};

describe('complete last-known market quotes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-17T00:30:00+05:30'));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('retains the correct GOLD change after close, even when OHLC close becomes today’s close', () => {
    const q = toQuote(snapshotQuote(instrument, payload)!);
    expect(q).toMatchObject({
      ltp: '134550.00',
      close: '136705.00',
      change: '-2155.00',
      changePct: '-1.58',
      volume: '0',
      avgPrice: '135100.00',
      ts: new Date('2026-11-16T23:54:59+05:30'),
    });
    expect(q.depth?.levels).toHaveLength(1);
    expect(q.depth?.totalBidQty).toBe(5);
    expect(q.lowerCircuit).toBeUndefined();
  });
  it('shows unavailable change data honestly until a previous close is received', () => {
    const q = toQuote(snapshotQuote(instrument, { ...payload, net_change: undefined })!);
    expect(q.change).toBeUndefined();
    expect(q.changePct).toBeUndefined();
    expect(q.close).toBeUndefined();
    expect(toQuote(snapshotQuote(instrument, { ...payload, net_change: 0 })!).change).toBe('0.00');
  });
  it('does not give unknown exchange trade times a fresh timestamp', () => {
    expect(dhanTradeTime('01/01/1980 00:00:00')).toBeUndefined();
    expect(dhanTradeTime('invalid')).toBeUndefined();
    expect(dhanTradeTime('01/01/2099 00:00:00')).toBeUndefined();
    expect(snapshotQuote(instrument, { ...payload, last_trade_time: undefined })!.ts.getTime()).toBe(0);
  });
  function fixture() {
    let stored: any;
    const db: any = {
      select: () => ({ from: () => ({ where: async () => (stored ? [{ value: stored }] : []) }) }),
      insert: () => ({
        values: ({ value }: any) => ({
          onConflictDoUpdate: async () => {
            stored = value;
          },
        }),
      }),
      delete: () => ({
        where: async () => {
          stored = undefined;
        },
      }),
    };
    const snapshots = new QuoteSnapshotService({ db } as any, { token: async () => 'test' } as any);
    const feed: any = { setSubscriptions: jest.fn(), onTick: jest.fn(), connect: jest.fn() };
    const market = new MarketDataService({ db } as any, feed, feed, undefined, snapshots);
    (market as any).meta.set(instrument.id, instrument);
    return { snapshots, market, feed, db };
  }
  it('round-trips all quote fields through durable storage across a restart', async () => {
    const { snapshots } = fixture();
    const q = snapshotQuote(instrument, payload)!;
    await snapshots.save([q]);
    expect(await snapshots.load()).toEqual([q]);
    expect(toQuote((await snapshots.load())[0]).changePct).toBe('-1.58');
    await snapshots.clear();
    expect(await snapshots.load()).toEqual([]);
  });
  it('deduplicates snapshot refreshes and waits between batches to respect Dhan rate limits', async () => {
    const { snapshots } = fixture();
    const request = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: { MCX_COMM: { '123': payload } } })));
    // Each response must be independently readable, like real HTTP responses.
    request.mockImplementation(
      async () => new Response(JSON.stringify({ status: 'success', data: { MCX_COMM: { '123': payload } } })),
    );
    const instruments = Array.from({ length: 1001 }, (_, n) => ({
      ...instrument,
      id: `gold-${n}`,
      dhanSecurityId: String(n + 123),
    }));
    const first = snapshots.refresh(instruments);
    expect(snapshots.refresh(instruments)).toBe(first);
    await jest.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(100);
    await first;
    expect(request).toHaveBeenCalledTimes(2);
    const bodies = request.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(bodies[0].MCX_COMM).toHaveLength(1000);
    expect(bodies[1].MCX_COMM).toHaveLength(1);
  });
  it('rejects provider errors without returning invented prices', async () => {
    const { snapshots } = fixture();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('Rate limited', { status: 429 }));
    expect(await snapshots.refresh([instrument])).toEqual([]);
  });
  it('retains LTP, spread and exchange trade time when a previous-close-only packet arrives', async () => {
    const { market, feed } = fixture();
    const q = snapshotQuote(instrument, payload)!;
    (market as any).quotes.set(instrument.id, q);
    await (market as any).startDhanFeed();
    const receive = feed.onTick.mock.calls[0][0];
    receive({
      segmentCode: 5,
      securityId: '123',
      ltp: 134600,
      timestamp: new Date(),
      lastTradeAt: new Date('2026-11-16T23:55:00+05:30'),
    });
    receive({ segmentCode: 5, securityId: '123', ltp: 0, prevClose: 136705, timestamp: new Date() });
    expect(toQuote(market.quote('gold')!)).toMatchObject({
      ltp: '134600.00',
      bid: '134500.00',
      ask: '134640.00',
      change: '-2105.00',
      ts: new Date('2026-11-16T23:55:00+05:30'),
    });
  });
  it('does not overwrite a current stream price with a slow REST snapshot', async () => {
    const { market, snapshots } = fixture();
    const current = snapshotQuote(instrument, { ...payload, last_price: 134600, net_change: undefined })!;
    current.ts = new Date();
    (market as any).quotes.set(instrument.id, current);
    jest.spyOn(snapshots, 'refresh').mockResolvedValue([snapshotQuote(instrument, payload)!]);
    await (market as any).refreshSnapshots();
    expect(toQuote(market.quote('gold')!)).toMatchObject({ ltp: '134600.00', close: '136705.00', change: '-2105.00' });
  });
  it('retains the last complete spread and OHLC when the closed book omits those fields', async () => {
    const { market, snapshots } = fixture();
    const current = snapshotQuote(instrument, payload)!;
    (market as any).quotes.set(instrument.id, current);
    const incomplete = snapshotQuote(instrument, {
      ...payload,
      depth: undefined,
      ohlc: undefined,
      average_price: undefined,
      volume: undefined,
    })!;
    jest.spyOn(snapshots, 'refresh').mockResolvedValue([incomplete]);
    await (market as any).refreshSnapshots();
    expect(toQuote(market.quote('gold')!)).toMatchObject({
      bid: '134500.00',
      ask: '134640.00',
      open: '136199.00',
      high: '136055.00',
      low: '134200.00',
      volume: '0',
      avgPrice: '135100.00',
    });
  });
  it('keeps the snapshot after a provider failure and clears it on platform reset', async () => {
    const { market, snapshots } = fixture();
    const q = snapshotQuote(instrument, payload)!;
    (market as any).quotes.set(instrument.id, q);
    await snapshots.save([q]);
    jest.spyOn(snapshots, 'refresh').mockRejectedValue(new Error('Provider unavailable'));
    await (market as any).refreshSnapshots();
    expect(market.quote('gold')).toEqual(q);
    await market.clearAll();
    expect(await snapshots.load()).toEqual([]);
    expect(market.all()).toEqual([]);
  });
  it('uses the new session baseline without carrying yesterday’s OHLC into missing fields', async () => {
    jest.setSystemTime(new Date('2026-11-17T12:00:00+05:30'));
    const { market, snapshots } = fixture();
    (market as any).quotes.set(instrument.id, snapshotQuote(instrument, payload)!);
    const next = snapshotQuote(instrument, {
      last_price: 134650,
      net_change: 100,
      last_trade_time: '17/11/2026 09:15:00',
    })!;
    jest.spyOn(snapshots, 'refresh').mockResolvedValue([next]);
    await (market as any).refreshSnapshots();
    expect(toQuote(market.quote('gold')!)).toMatchObject({
      ltp: '134650.00',
      close: '134550.00',
      change: '100.00',
      changePct: '0.07',
    });
    expect(toQuote(market.quote('gold')!).open).toBeUndefined();
    expect(toQuote(market.quote('gold')!).high).toBeUndefined();
    (market as any).quotes.set(instrument.id, snapshotQuote(instrument, payload)!);
    jest.mocked(snapshots.refresh).mockResolvedValue([snapshotQuote(instrument, { last_price: 134650, last_trade_time: '17/11/2026 09:15:00' })!]);
    await (market as any).refreshSnapshots();
    expect(toQuote(market.quote('gold')!).change).toBeUndefined();
  });
  it('uses one concise closure message for weekdays, weekends and holidays', () => {
    const sessions = { MCX: { open: '09:00', close: '23:55' } };
    for (const at of ['2026-11-17T00:30:00+05:30', '2026-11-15T12:00:00+05:30', '2026-11-16T12:00:00+05:30']) {
      expect(sessionStatus('MCX', sessions, ['2026-11-16'], new Date(at))).toMatchObject({
        isOpen: false,
        message: 'Market is closed as per commodity timing rules.',
      });
    }
    expect(sessionStatus('MCX', sessions, [], new Date('2026-11-17T12:00:00+05:30')).isOpen).toBe(true);
  });
  it('permits closed-market cost previews using last-known prices without making the quote fresh', async () => {
    const q = snapshotQuote(instrument, payload)!;
    const config = { get: async (key: keyof typeof CONFIG_REGISTRY) => CONFIG_REGISTRY[key].default };
    const market = { instrument: () => instrument, quote: () => q, hasVerifiedCatalog: () => true };
    const venue = { marketFillPrice: jest.fn(() => q.askMinor) };
    const orders = new OrdersService(
      {} as any,
      {} as any,
      config as any,
      market as any,
      venue as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const before = q.ts.getTime();
    const preview = await orders.preview('gold', 'BUY', 1);
    expect(preview.priceMinor).toBeGreaterThan(0n);
    expect(q.ts.getTime()).toBe(before);
    jest.setSystemTime(new Date('2026-11-17T12:00:00+05:30'));
    await expect(orders.preview('gold', 'BUY', 1)).rejects.toThrow('Live prices are updating');
  });
  it('still refuses to execute an order using a stale restored quote', async () => {
    jest.setSystemTime(new Date('2026-11-17T12:00:00+05:30'));
    const q = snapshotQuote(instrument, payload)!;
    const results = [[], [{ id: 'trader', mode: 'SIMULATED' }]];
    const tx = { select: () => ({ from: () => ({ where: async () => results.shift() }) }) };
    const config = { get: async (key: keyof typeof CONFIG_REGISTRY) => CONFIG_REGISTRY[key].default };
    const venue = { marketFillPrice: jest.fn() };
    const service = new OrdersService(
      { serializable: (fn: any) => fn(tx) } as any,
      { cashAccount: async () => 'cash', lock: async () => {} } as any,
      config as any,
      { quote: () => q, instrument: () => instrument, hasVerifiedCatalog: () => true } as any,
      venue as any,
      {} as any,
      {} as any,
      {} as any,
      { assertConsented: async () => {} } as any,
    );
    await expect(
      service.place(
        { role: 'TRADER', userId: 'trader', sessionId: 'session' } as any,
        { instrumentId: 'gold', quantity: 1, type: 'MARKET', side: 'BUY', idempotencyKey: 'stale-order-1' },
        '127.0.0.1',
      ),
    ).rejects.toThrow('Live prices are updating');
    expect(venue.marketFillPrice).not.toHaveBeenCalled();
  });
});
