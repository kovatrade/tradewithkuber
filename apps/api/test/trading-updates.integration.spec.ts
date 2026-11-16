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
import { OrdersService } from '../src/trading/orders.service';
import { SimulatedVenue } from '../src/trading/execution-venue';
import { CONFIG_REGISTRY } from '../src/config-mgmt/registry';
import { users, instruments, positions, orders, notifications, deviceAccountLogins } from '../src/db/schema';
import type { Actor } from '../src/common/context';

const suite = process.env.RUN_TRADING_INTEGRATION === 'true' ? describe : describe.skip;
jest.setTimeout(120000);
suite('isolated funding, exit, margin and shared-device regression checks', () => {
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
    expect(await db.db.transaction(tx => orderSvc.marginUsed(tx, trader.userId, 20))).toBe(450075n);
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
});
