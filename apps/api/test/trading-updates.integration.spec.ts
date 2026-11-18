import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { DbService } from '../src/db/db';
import { AuditService } from '../src/audit/audit.service';
import { LedgerService } from '../src/ledger/ledger.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PasswordService } from '../src/auth/password.service';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { PaymentsService } from '../src/payments/payments.service';
import { OrdersService } from '../src/trading/orders.service';
import { SimulatedVenue } from '../src/trading/execution-venue';
import { CONFIG_REGISTRY } from '../src/config-mgmt/registry';
import { users, instruments, positions, orders, notifications, deviceAccountLogins } from '../src/db/schema';
import type { Actor } from '../src/common/context';

const suite = process.env.RUN_TRADING_INTEGRATION === 'true' ? describe : describe.skip;
jest.setTimeout(120000);
suite('isolated funding, exit, margin and shared-device regression checks', () => {
  let payments: PaymentsService;
  let db: DbService, ledger: LedgerService, orderSvc: OrdersService, usersSvc: UsersService, auth: AuthService;
  let trader: Actor, mini: any, mega: any, cash: string, first: any, second: any, admin: any;
  const overrides: Record<string, any> = { 'trading.enforceMarketHours': false, 'trading.brokerageBps': 0, 'trading.carryForwardMarginPerMiniLot': 1500.25, 'trading.carryForwardMarginPerMegaLot': 12000 };
  const quote: any = { bidMinor: 100000n, askMinor: 100000n, ltpMinor: 100000n, source: 'SIMULATED', ts: new Date() };
  const deviceId = randomUUID();
  const meta = { deviceId, ip: '127.0.0.1', userAgent: 'Integration test phone', deviceName: 'Test Android' };
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^\/tradedesk_trading_test_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Refusing a non-isolated database.');
    db = new DbService(); ledger = new LedgerService(db);
    const audit = new AuditService(db), alerts = new NotificationsService(db), passwords = new PasswordService();
    const config: any = { get: async (key: keyof typeof CONFIG_REGISTRY) => key in overrides ? overrides[key] : CONFIG_REGISTRY[key].default };
    const market: any = { quote: () => quote, instrument: (id: string) => id === mini?.id ? mini : id === mega?.id ? mega : undefined };
    const policy: any = { assertCanAccessUser: async () => {} };
    orderSvc = new OrdersService(db, ledger, config, market, new SimulatedVenue(), audit, alerts, policy, { assertConsented: async () => {} } as any);
    payments = new PaymentsService(db, ledger, config, audit, policy, alerts, orderSvc, { assertReplay: async () => {} } as any);
    usersSvc = new UsersService(db, audit, passwords, policy, ledger, orderSvc, market, config, alerts, {} as any);
    auth = new AuthService(db, passwords, audit, config, ledger, alerts, {} as any);
    const add = async (username: string, role: 'TRADER' | 'BROKER' | 'SUPER_ADMIN') => (await db.db.insert(users).values({ username, displayName: username, role, status: 'ACTIVE' }).returning())[0];
    admin = await add('admin.regression', 'SUPER_ADMIN');
    first = await add('broker.one', 'BROKER'); second = await add('broker.two', 'BROKER');
    const u = await add('trader.regression', 'TRADER');
    trader = { userId: u.id, role: 'TRADER', sessionId: randomUUID(), mfaVerified: false };
    for (const cls of ['MINI', 'MEGA'] as const) {
      const i = (await db.db.insert(instruments).values({ symbol: `GOLD-${cls}`, name: `Gold ${cls}`, exchange: 'MCX', segment: 'COMM', lotSize: 1, lotClass: cls, tickMinor: 1, refPriceMinor: 100000n }).returning())[0];
      if (cls === 'MINI') mini = i; else mega = i;
    }
    await db.db.transaction(async tx => {
      cash = await ledger.cashAccount(tx, trader.userId, 'SIMULATED');
      const funding = await ledger.systemAccount(tx, 'FUNDING_SOURCE', 'SIMULATED');
      for (const [kind, amount] of [['OPENING_BALANCE', 10000000n], ['DEPOSIT', 2500000n], ['WITHDRAWAL', -1000000n]] as const) {
        await ledger.post(tx, { idempotencyKey: randomUUID(), kind, mode: 'SIMULATED', memo: 'Regression funding', postings: [{ accountId: cash, amountMinor: amount }, { accountId: funding, amountMinor: -amount }] });
      }
    });
  });
  afterAll(async () => { await db?.onApplicationShutdown(); });
  it('keeps lifetime credits stable through withdrawals, entry, P&L, fees and an immediate exit', async () => {
    const before = await usersSvc.accountSummary(trader, trader.userId);
    expect(before.creditBalanceMinor).toBe(12500000n); expect(before.balanceMinor).toBe(11500000n);
    const opened = await orderSvc.place(trader, { instrumentId: mini.id, side: 'BUY', type: 'MARKET', quantity: 3, idempotencyKey: randomUUID() }, '127.0.0.1');
    expect(opened.status).toBe('FILLED');
    const [p] = await db.db.select().from(positions).where(eq(positions.instrumentId, mini.id));
    const preview = await orderSvc.preview(mini.id, 'BUY', 3);
    expect(preview.carryForwardMarginMinor).toBe(450075n);
    expect(preview.brokerageMinor).toBe(75000n);
    const carry = await orderSvc.carryForward(trader, p.id, '127.0.0.1');
    expect(carry.marginMinor).toBe(450075n);
    expect(await db.db.transaction(tx => orderSvc.marginUsed(tx, trader.userId))).toBe(450075n);
    expect((await usersSvc.accountSummary(trader, trader.userId)).creditBalanceMinor).toBe(12500000n);
    quote.bidMinor = 120000n; quote.ltpMinor = 120000n;
    // Close the entire position even when its size exceeds the normal per-order opening limit.
    overrides['trading.maxQtyPerOrder'] = 1;
    const key = randomUUID();
    const exits = await Promise.all([orderSvc.exitPosition(trader, p.id, key, '127.0.0.1'), orderSvc.exitPosition(trader, p.id, key, '127.0.0.1')]);
    expect(exits[0].id).toBe(exits[1].id); expect(exits[0].status).toBe('FILLED'); expect(exits[0].quantity).toBe(3);
    const after = await usersSvc.accountSummary(trader, trader.userId);
    expect(after.creditBalanceMinor).toBe(12500000n);
    expect(after.balanceMinor).toBe(11410000n); expect(after.realizedPnlMinor).toBe(60000n); expect(after.feesMinor).toBe(150000n);
    expect(after.marginUsedMinor).toBe(0n); expect(after.openPositions).toBe(0);
    await expect(orderSvc.exitPosition(trader, p.id, randomUUID(), '127.0.0.1')).rejects.toThrow(/already closed/i);
  });
  it('prevents another account exiting the trader position', async () => {
    const [p] = await db.db.select().from(positions).where(eq(positions.instrumentId, mini.id));
    await expect(orderSvc.exitPosition({ ...trader, userId: second.id }, p.id, randomUUID(), '127.0.0.1')).rejects.toThrow(/not found/i);
  });
  it('previews mega margin and charges mega brokerage on closing an existing short', async () => {
    const before = await usersSvc.accountSummary(trader, trader.userId);
    quote.askMinor = 110000n;
    expect((await orderSvc.preview(mega.id, 'BUY', 2)).carryForwardMarginMinor).toBe(2400000n);
    const [p] = await db.db.insert(positions).values({ userId: trader.userId, instrumentId: mega.id, mode: 'SIMULATED', netQty: -2, avgPriceMinor: 100000n }).returning();
    const out = await orderSvc.exitPosition(trader, p.id, randomUUID(), '127.0.0.1');
    expect(out.status).toBe('FILLED'); expect(out.side).toBe('BUY'); expect(out.quantity).toBe(2);
    const [closed] = await db.db.select().from(positions).where(eq(positions.id, p.id));
    expect(closed.netQty).toBe(0); expect(closed.realizedPnlMinor).toBe(-20000n);
    expect((await usersSvc.accountSummary(trader, trader.userId)).feesMinor - before.feesMinor).toBe(500000n);
  });
  it('does not reopen or reverse a position when different exit requests arrive together', async () => {
    quote.askMinor = quote.bidMinor = 100000n; overrides['trading.maxQtyPerOrder'] = 50;
    await orderSvc.place(trader, { instrumentId: mini.id, side: 'BUY', type: 'MARKET', quantity: 2, idempotencyKey: randomUUID() }, '127.0.0.1');
    const [p] = await db.db.select().from(positions).where(eq(positions.instrumentId, mini.id));
    const before = await usersSvc.accountSummary(trader, trader.userId);
    const results = await Promise.allSettled([orderSvc.exitPosition(trader, p.id, randomUUID(), '127.0.0.1'), orderSvc.exitPosition(trader, p.id, randomUUID(), '127.0.0.1')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.db.select().from(positions).where(eq(positions.id, p.id)))[0].netQty).toBe(0);
    const after = await usersSvc.accountSummary(trader, trader.userId);
    expect(after.feesMinor - before.feesMinor).toBe(50000n); expect(after.creditBalanceMinor).toBe(12500000n);
  });
  it('detects the second account after logout and saves full details to the admin inbox', async () => {
    const firstTokens: any = await db.serializable(tx => (auth as any).createSession(tx, first, meta, false));
    expect(await db.db.$count(notifications, eq(notifications.kind, 'security.shared_device'))).toBe(0);
    await auth.revokeSession({ userId: first.id, role: 'BROKER', sessionId: firstTokens.sessionId, mfaVerified: false }, firstTokens.sessionId, meta.ip);
    await db.serializable(tx => (auth as any).createSession(tx, second, meta, false));
    const notes = await db.db.select().from(notifications).where(and(eq(notifications.userId, admin.id), eq(notifications.kind, 'security.shared_device')));
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toMatch(/broker.one.*broker.two.*Test Android/); expect(notes[0].body).toContain('IST');
    const history = await db.db.select().from(deviceAccountLogins);
    expect(history).toHaveLength(2); expect(history[0].deviceHash).toBe(history[1].deviceHash);
    expect(history[0].deviceHash).not.toBe(deviceId);
    // Same IP on a different installation is not a same-device match.
    await db.serializable(tx => (auth as any).createSession(tx, second, { ...meta, deviceId: randomUUID() }, false));
    expect(await db.db.$count(notifications, eq(notifications.kind, 'security.shared_device'))).toBe(1);
  });
  async function fundedTrader(amount: bigint) {
    const [u] = await db.db.insert(users).values({ username: 'fixed.' + randomUUID().slice(0, 8), displayName: 'Fixed margin test', role: 'TRADER', status: 'ACTIVE' }).returning();
    const actor: Actor = { userId: u.id, role: 'TRADER', sessionId: randomUUID(), mfaVerified: false };
    const cash = await db.db.transaction(async tx => {
      const cash = await ledger.cashAccount(tx, u.id, 'SIMULATED'), fund = await ledger.systemAccount(tx, 'FUNDING_SOURCE', 'SIMULATED');
      await ledger.post(tx, { idempotencyKey: randomUUID(), kind: 'OPENING_BALANCE', mode: 'SIMULATED', memo: 'Fixed margin funding', postings: [{ accountId: cash, amountMinor: amount }, { accountId: fund, amountMinor: -amount }] }); return cash;
    }); return { actor, cash };
  }
  it('uses fixed Mini/Mega rates for previews, positions, pending buys and withdrawal limits', async () => {
    overrides['trading.maxQtyPerOrder'] = 50;
    quote.bidMinor = quote.askMinor = quote.ltpMinor = 100000n;
    const { actor } = await fundedTrader(20000000n);
    const place = (instrumentId: string, quantity: number, type: 'MARKET' | 'LIMIT' = 'MARKET') => orderSvc.place(actor, { instrumentId, side: 'BUY', type, quantity, ...(type === 'LIMIT' ? { limitPriceMinor: 1n } : {}), idempotencyKey: randomUUID() }, '127.0.0.1');
    expect((await orderSvc.preview(mini.id, 'BUY', 2)).intradayMarginMinor).toBe(1500000n);
    expect((await orderSvc.preview(mega.id, 'BUY', 2)).intradayMarginMinor).toBe(15000000n);
    quote.askMinor = 200000n;
    expect((await orderSvc.preview(mini.id, 'BUY', 2)).intradayMarginMinor).toBe(1500000n);
    quote.askMinor = 100000n;
    expect((await place(mini.id, 2)).status).toBe('FILLED');
    expect((await place(mega.id, 1)).status).toBe('FILLED');
    const pending = await place(mini.id, 3, 'LIMIT'); expect(pending.status).toBe('OPEN');
    const summary = await usersSvc.accountSummary(actor, actor.userId);
    expect(summary.marginUsedMinor).toBe(11250000n); expect(summary.availableMinor).toBe(8450000n);
    await expect(payments.request(actor, { type: 'WITHDRAWAL', amountMinor: 10000000n, idempotencyKey: randomUUID() }, '127.0.0.1')).rejects.toThrow(/withdrawable/);
    expect((await place(mini.id, 20)).rejectReason).toBe('Insufficient margin.');
    await orderSvc.cancel(actor, pending.id, '127.0.0.1');
    expect((await usersSvc.accountSummary(actor, actor.userId)).marginUsedMinor).toBe(9000000n);
    const activeMega = mega; mega = undefined;
    try { expect(await db.db.transaction(tx => orderSvc.marginUsed(tx, actor.userId))).toBe(9000000n); } finally { mega = activeMega; }
  });
  it('checks funds when turning carry-forward off but still permits an exit with low funds', async () => {
    const { actor, cash } = await fundedTrader(1000000n);
    expect((await orderSvc.place(actor, { instrumentId: mini.id, side: 'BUY', type: 'MARKET', quantity: 1, idempotencyKey: randomUUID() }, '127.0.0.1')).status).toBe('FILLED');
    const [p] = await db.db.select().from(positions).where(eq(positions.userId, actor.userId));
    await orderSvc.carryForward(actor, p.id, '127.0.0.1');
    await db.db.transaction(async tx => {
      const fund = await ledger.systemAccount(tx, 'FUNDING_SOURCE', 'SIMULATED');
      await ledger.post(tx, { idempotencyKey: randomUUID(), kind: 'WITHDRAWAL', mode: 'SIMULATED', memo: 'Withdraw free CF balance', postings: [{ accountId: cash, amountMinor: -500000n }, { accountId: fund, amountMinor: 500000n }] });
    });
    await expect(orderSvc.cancelCarryForward(actor, p.id, '127.0.0.1')).rejects.toThrow(/Insufficient funds for intraday margin/);
    expect((await orderSvc.exitPosition(actor, p.id, randomUUID(), '127.0.0.1')).status).toBe('FILLED');
    expect((await usersSvc.accountSummary(actor, actor.userId)).marginUsedMinor).toBe(0n);
  });

  async function shortScenario(funds = 10000000n) {
    quote.bidMinor = quote.askMinor = quote.ltpMinor = 100000n;
    overrides['trading.maxQtyPerOrder'] = 50;
    const { actor, cash } = await fundedTrader(funds);
    const place = (side: 'BUY' | 'SELL', quantity: number, extra: Record<string, any> = {}) => orderSvc.place(actor,
      { instrumentId: mini.id, side, quantity, type: 'MARKET', idempotencyKey: randomUUID(), ...extra }, '127.0.0.1');
    const position = async () => (await db.db.select().from(positions).where(and(eq(positions.userId, actor.userId), eq(positions.instrumentId, mini.id))))[0];
    const summary = () => usersSvc.accountSummary(actor, actor.userId);
    const match = async (price: bigint) => {
      quote.bidMinor = quote.askMinor = quote.ltpMinor = price;
      await (orderSvc as any).matchOpenLimits([{ ...quote, instrumentId: mini.id }]);
    };
    return { actor, cash, place, position, summary, match };
  }
  it('opens a short without a buy, averages additions, books partial covers and reverses with exact brokerage', async () => {
    const f = await shortScenario();
    expect((await f.place('SELL', 1)).status).toBe('FILLED');
    expect((await f.summary()).balanceMinor).toBe(9975000n); // fee only, no gross sale proceeds
    expect((await f.summary()).marginUsedMinor).toBe(750000n);
    expect((await f.position()).netQty).toBe(-1);
    quote.bidMinor = quote.askMinor = quote.ltpMinor = 120000n;
    await f.place('SELL', 1);
    expect(await f.position()).toMatchObject({ netQty: -2, avgPriceMinor: 110000n });
    expect((await f.summary()).unrealizedPnlMinor).toBe(-20000n);
    quote.bidMinor = quote.askMinor = quote.ltpMinor = 90000n;
    await f.place('BUY', 1);
    expect(await f.position()).toMatchObject({ netQty: -1, avgPriceMinor: 110000n, realizedPnlMinor: 20000n });
    quote.bidMinor = quote.askMinor = quote.ltpMinor = 130000n;
    await f.place('BUY', 3);
    expect(await f.position()).toMatchObject({ netQty: 2, avgPriceMinor: 130000n, realizedPnlMinor: 0n });
    expect(await f.summary()).toMatchObject({ balanceMinor: 9850000n, feesMinor: 150000n, marginUsedMinor: 1500000n, creditBalanceMinor: 10000000n });
    await f.place('SELL', 3);
    expect(await f.position()).toMatchObject({ netQty: -1, avgPriceMinor: 130000n });
    await orderSvc.exitPosition(f.actor, (await f.position()).id, randomUUID(), '127.0.0.1');
    expect((await f.position()).netQty).toBe(0);
    expect((await f.summary()).marginUsedMinor).toBe(0n);
  });
  it('requires margin and entry brokerage for shorts, but allows a cover with no free margin', async () => {
    const f = await shortScenario(775000n);
    expect((await f.place('SELL', 2)).rejectReason).toBe('Insufficient margin.');
    expect((await f.place('SELL', 1)).status).toBe('FILLED');
    expect((await f.summary()).availableMinor).toBe(0n);
    quote.askMinor = 110000n;
    expect((await f.place('BUY', 1)).status).toBe('FILLED');
    expect(await f.summary()).toMatchObject({ balanceMinor: 715000n, realizedPnlMinor: -10000n, feesMinor: 50000n, marginUsedMinor: 0n });
  });
  it('applies risk and funds checks to a reversal even when the resulting position is smaller', async () => {
    const f = await shortScenario();
    await f.place('BUY', 2);
    await db.db.update(users).set({ riskState: 'CUT' }).where(eq(users.id, f.actor.userId));
    expect((await f.place('SELL', 3)).rejectReason).toMatch(/new trades are paused/);
    expect((await f.place('SELL', 1)).status).toBe('FILLED'); // reductions remain possible
    await db.db.update(users).set({ riskState: 'OK' }).where(eq(users.id, f.actor.userId));
    quote.bidMinor = 1n; // realised closing loss must be counted before financing a reverse entry
    const balance = (await f.summary()).balanceMinor;
    await db.db.transaction(async tx => {
      const funding = await ledger.systemAccount(tx, 'FUNDING_SOURCE', 'SIMULATED');
      await ledger.post(tx, { idempotencyKey: randomUUID(), kind: 'WITHDRAWAL', mode: 'SIMULATED', memo: 'Reversal boundary', postings: [{ accountId: f.cash, amountMinor: 875000n - balance }, { accountId: funding, amountMinor: balance - 875000n }] });
    });
    expect((await f.place('SELL', 2)).rejectReason).toBe('Insufficient margin.');
    expect((await f.position()).netQty).toBe(1);
  });
  it('protects a short with BUY SL/TP without reserving duplicate margin and caps a trigger after a partial cover', async () => {
    const f = await shortScenario();
    await f.place('SELL', 2);
    const key = randomUUID();
    const slInput = { type: 'STOP_LOSS', triggerPriceMinor: 120000n, idempotencyKey: key };
    const sl = await f.place('BUY', 2, slInput);
    // Older orders have no requested_quantity; preserve their original size when capped too.
    await db.db.update(orders).set({ requestedQuantity: null }).where(eq(orders.id, sl.id));
    const tp = await f.place('BUY', 2, { type: 'TAKE_PROFIT', triggerPriceMinor: 80000n });
    expect(sl.status).toBe('OPEN'); expect(tp.status).toBe('OPEN');
    expect((await f.summary()).marginUsedMinor).toBe(1500000n);
    await f.place('BUY', 1);
    await f.match(125000n);
    const [filled] = await db.db.select().from(orders).where(eq(orders.id, sl.id));
    expect(filled).toMatchObject({ status: 'FILLED', quantity: 1, requestedQuantity: 2, fillPriceMinor: 125000n });
    expect((await f.position()).netQty).toBe(0);
    expect((await db.db.select().from(orders).where(eq(orders.id, tp.id)))[0].status).toBe('CANCELLED');
    expect((await f.place('BUY', 2, slInput)).id).toBe(sl.id); // replay original requested size
    expect(await f.summary()).toMatchObject({ balanceMinor: 9875000n, realizedPnlMinor: -25000n, feesMinor: 100000n, marginUsedMinor: 0n });
  });
  it('takes profit on a short when prices fall, and rejects protective orders in the wrong direction', async () => {
    const f = await shortScenario();
    await f.place('SELL', 1);
    expect((await f.place('SELL', 1, { type: 'STOP_LOSS', triggerPriceMinor: 80000n })).status).toBe('REJECTED');
    const tp = await f.place('BUY', 1, { type: 'TAKE_PROFIT', triggerPriceMinor: 80000n });
    await f.match(75000n);
    expect((await db.db.select().from(orders).where(eq(orders.id, tp.id)))[0].status).toBe('FILLED');
    expect(await f.position()).toMatchObject({ netQty: 0, realizedPnlMinor: 25000n });
  });
  it('cancels pending exits on manual exit so later price movements cannot reopen a position', async () => {
    const f = await shortScenario();
    await f.place('SELL', 1);
    const stop = await f.place('BUY', 1, { type: 'STOP_LOSS', triggerPriceMinor: 120000n });
    const limit = await f.place('BUY', 1, { type: 'LIMIT', limitPriceMinor: 80000n });
    expect(limit.reduceOnly).toBe(true);
    await orderSvc.exitPosition(f.actor, (await f.position()).id, randomUUID(), '127.0.0.1');
    await f.match(125000n); await f.match(75000n);
    expect((await f.position()).netQty).toBe(0);
    for (const o of [stop, limit]) expect((await db.db.select().from(orders).where(eq(orders.id, o.id)))[0].status).toBe('CANCELLED');
  });
  it('reserves pending short entries and rechecks fees and funds before a delayed fill', async () => {
    const f = await shortScenario(775000n);
    const pending = await f.place('SELL', 1, { type: 'LIMIT', limitPriceMinor: 120000n });
    expect(pending.status).toBe('OPEN'); expect(pending.reduceOnly).toBe(false);
    expect((await f.summary()).marginUsedMinor).toBe(750000n);
    await db.db.transaction(async tx => {
      const funding = await ledger.systemAccount(tx, 'FUNDING_SOURCE', 'SIMULATED');
      await ledger.post(tx, { idempotencyKey: randomUUID(), kind: 'WITHDRAWAL', mode: 'SIMULATED', memo: 'Use unreserved funds', postings: [{ accountId: f.cash, amountMinor: -25000n }, { accountId: funding, amountMinor: 25000n }] });
    });
    await f.match(125000n);
    expect((await db.db.select().from(orders).where(eq(orders.id, pending.id)))[0]).toMatchObject({ status: 'REJECTED', rejectReason: 'Insufficient margin.' });
    expect(await f.position()).toBeUndefined();
    expect((await f.summary()).marginUsedMinor).toBe(0n);
    const funded = await shortScenario();
    const sell = await funded.place('SELL', 2, { type: 'LIMIT', limitPriceMinor: 120000n });
    await funded.match(125000n);
    expect((await db.db.select().from(orders).where(eq(orders.id, sell.id)))[0].status).toBe('FILLED');
    expect(await funded.position()).toMatchObject({ netQty: -2, avgPriceMinor: 125000n });
    await orderSvc.carryForward(funded.actor, (await funded.position()).id, '127.0.0.1');
    expect((await funded.summary()).marginUsedMinor).toBe(300050n);
    await orderSvc.exitPosition(funded.actor, (await funded.position()).id, randomUUID(), '127.0.0.1');
    expect((await funded.summary()).marginUsedMinor).toBe(0n);
  });
  it('never lets an internal exit create a short after its original position was closed', async () => {
    const f = await shortScenario();
    await f.place('BUY', 1); await f.place('SELL', 1);
    expect((await f.place('SELL', 1, { reduceOnly: true })).status).toBe('REJECTED');
    expect((await f.position()).netQty).toBe(0);
  });
});
