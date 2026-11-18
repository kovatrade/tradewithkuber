import { carryForwardMargin, intradayMargin } from './margin';
import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Actor } from '../common/context';
import { AppError, badInput, conflict, notFound } from '../common/errors';
import { brokerageMinor, feeRule, type FeeRule } from './brokerage';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '../config-mgmt/config.service';
import { DbService, type Tx } from '../db/db';
import { orders, positions, users, instruments, type OrderRow } from '../db/schema';
import { LedgerService } from '../ledger/ledger.service';
import { MarketDataService, type Quote } from '../market/market-data.service';
import { NotificationsService, pubsub, TOPIC } from '../notifications/notifications.service';
import { PolicyService } from '../policy/policy.service';
import { SimulatedVenue, type Side } from './execution-venue';
import { requestContext } from '../common/request-context';
import { env } from '../config/env';
import { ConsentService } from '../consent/consent.service';
import { sessionStatus, type Sessions } from './market-hours';
import { DhanGlobalFeedService } from '../market/dhan-global-feed.service';
import { afterWipeFor } from '../wipe/visibility';

/** Today's date in India (YYYY-MM-DD). */
export const istDay = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export interface PlaceOrderInput {
  /** Internal only: close this position under the same cash-account lock as a normal fill. */
  closingPositionId?: string;
  /** Internal exits (risk, end of day, strategies) must not open reverse exposure. */
  reduceOnly?: boolean;
  instrumentId: string;
  side: Side;
  type: OrderType;
  quantity: number;
  limitPriceMinor?: bigint;
  /** STOP_LOSS / TAKE_PROFIT only. */
  triggerPriceMinor?: bigint;
  idempotencyKey: string;
}

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
const abs = (n: number) => (n < 0 ? -n : n);
const isTrigger = (t: string) => t === 'STOP_LOSS' || t === 'TAKE_PROFIT';
/** Reversing a position opens exposure even if its absolute size becomes smaller. */
const opensExposure = (net: number, signed: number) => net + signed !== 0 &&
  (net === 0 || Math.sign(net + signed) !== Math.sign(net) || abs(net + signed) > abs(net));
type HeldPosition = { netQty: number; avgPriceMinor: bigint; cfDate: string | null };

/**
 * Has the last traded price reached the trigger?
 * SELL stop-loss / BUY take-profit fire when LTP falls to the trigger;
 * BUY stop-loss / SELL take-profit fire when LTP rises to it.
 */
export function triggerHit(type: OrderType, side: Side, trigger: bigint, ltp: bigint): boolean {
  const fallsTo = (type === 'STOP_LOSS' && side === 'SELL') || (type === 'TAKE_PROFIT' && side === 'BUY');
  return fallsTo ? ltp <= trigger : ltp >= trigger;
}

/**
 * Paper-trading order management. Every fill here is SIMULATED (venue = 'SIMULATED',
 * account mode = SIMULATED) and is labelled as such everywhere it is shown.
 */
@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly log = new Logger('Orders');
  private matching = false;

  constructor(
    private readonly dbs: DbService,
    private readonly ledger: LedgerService,
    private readonly config: ConfigService,
    private readonly market: MarketDataService,
    private readonly venue: SimulatedVenue,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly policy: PolicyService,
    private readonly consent: ConsentService,
  ) {}

  onModuleInit() {
    this.market.onTick((qs) => void this.matchOpenLimits(qs));
  }

  // ------------------------------------------------------------------ helpers

  private async intradayRates() {
    const [mini, mega] = await Promise.all([this.config.get('trading.intradayMarginPerMiniLot'), this.config.get('trading.intradayMarginPerMegaLot')]);
    return { mini, mega };
  }

  private async positionMargin(p: HeldPosition | undefined, lotClass: string, rates: { mini: number; mega: number }) {
    if (!p?.netQty) return 0n;
    if (p.cfDate !== istDay()) return intradayMargin(p.netQty, lotClass, rates.mini, rates.mega);
    const [bps, mini, mega] = await Promise.all([this.config.get('trading.carryForwardMarginBps'), this.config.get('trading.carryForwardMarginPerMiniLot'), this.config.get('trading.carryForwardMarginPerMegaLot')]);
    return carryForwardMargin(BigInt(abs(p.netQty)) * p.avgPriceMinor, p.netQty, lotClass, bps, mini, mega);
  }

  private closingPnl(p: HeldPosition | undefined, signed: number, price: bigint) {
    if (!p?.netQty || Math.sign(p.netQty) === Math.sign(signed)) return 0n;
    return (price - p.avgPriceMinor) * BigInt(Math.min(abs(p.netQty), abs(signed))) * (p.netQty > 0 ? 1n : -1n);
  }

  async marginUsed(tx: Tx, userId: string, rates?: { mini: number; mega: number }): Promise<bigint> {
    rates ??= await this.intradayRates();
    const [cfBps, miniCf, megaCf] = await Promise.all([this.config.get('trading.carryForwardMarginBps'), this.config.get('trading.carryForwardMarginPerMiniLot'), this.config.get('trading.carryForwardMarginPerMegaLot')]);
    const today = istDay();
    const pos = await tx
      .select({ q: positions.netQty, p: positions.avgPriceMinor, cf: positions.cfDate, lotClass: instruments.lotClass })
      .from(positions)
      .innerJoin(instruments, eq(instruments.id, positions.instrumentId))
      .where(and(eq(positions.userId, userId), eq(positions.mode, 'SIMULATED')));
    const open = await tx
      .select({ q: orders.quantity, lotClass: instruments.lotClass })
      .from(orders)
      .innerJoin(instruments, eq(instruments.id, orders.instrumentId))
      .where(and(eq(orders.userId, userId), eq(orders.status, 'OPEN'), eq(orders.reduceOnly, false)));
    let used = 0n;
    // A position carried forward today holds the carry-forward margin instead of the intraday one.
    for (const r of pos) { const value = BigInt(abs(r.q)) * r.p; used += r.cf === today ? carryForwardMargin(value, r.q, r.lotClass, cfBps, miniCf, megaCf) : intradayMargin(r.q, r.lotClass, rates.mini, rates.mega); }
    for (const r of open) used += intradayMargin(r.q, r.lotClass, rates.mini, rates.mega);
    return used;
  }

  /** Session status for every configured exchange (for the order screen). */
  async sessions() {
    const [enforced, hours, holidays] = await Promise.all([
      this.config.get('trading.enforceMarketHours'),
      this.config.get('trading.marketHours'),
      this.config.get('trading.marketHolidays'),
    ]);
    const active = enforced && env().MARKET_HOURS === 'config';
    return {
      enforced: active,
      list: Object.keys(hours).map((ex) => {
        const st = sessionStatus(ex, hours as Sessions, holidays);
        return st;
      }),
    };
  }

  /** null when the exchange is open (or hours are not enforced), otherwise the reason. */
  private async closedReason(exchange: string): Promise<string | null> {
    const s = await this.sessions();
    return s.enforced ? s.list.find((x) => x.exchange === exchange)?.message ?? null : null;
  }

  /** Quote a would-be order (for the trade ticket): value and margins. Read-only. */
  async preview(instrumentId: string, side: Side, quantity: number, limitPriceMinor?: bigint, triggerPriceMinor?: bigint) {
    if(env().MARKET_FEED==='dhan'&&!this.market.hasVerifiedCatalog())throw badInput('Instrument catalog is unavailable or out of date. Wait for a successful refresh.');
    const q = this.market.quote(instrumentId);
    const inst = this.market.instrument(instrumentId);
    const calendar = await this.sessions();
    const closed = calendar.list.find(s => s.exchange === inst?.exchange)?.isOpen === false;
    if(env().MARKET_FEED==='dhan' && (!q || q.source!=='DHAN' || (!closed && Date.now()-q.ts.getTime()>60000)))throw badInput(closed ? 'Market is closed as per timing rules.' : 'Live prices are updating. Please try again.');
    if (!q) throw notFound('Instrument');
    const price = limitPriceMinor ?? triggerPriceMinor ?? (closed && (side === 'BUY' ? q.askMinor : q.bidMinor) <= 0n ? q.ltpMinor : this.venue.marketFillPrice(side, q));
    const value = price * BigInt(quantity);
    return {
      priceMinor: price,
      valueMinor: value,
      intradayMarginMinor: intradayMargin(quantity, inst?.lotClass, await this.config.get('trading.intradayMarginPerMiniLot'), await this.config.get('trading.intradayMarginPerMegaLot')),
      carryForwardMarginMinor: carryForwardMargin(value, quantity, this.market.instrument(instrumentId)?.lotClass, await this.config.get('trading.carryForwardMarginBps'), await this.config.get('trading.carryForwardMarginPerMiniLot'), await this.config.get('trading.carryForwardMarginPerMegaLot')),
      brokerageMinor: brokerageMinor(await feeRule(this.config), price, quantity, this.market.instrument(instrumentId)?.lotClass),
    };
  }

  // ------------------------------------------------------------------ place / cancel

  /**
   * Place an order for the actor's own account.
   * `automation` is for orders placed by a running strategy (algo/): the trader accepted the trading rules
   * when they started it (checked there), so the per-session consent check is skipped, and the order is
   * stamped with the strategy. Every other check below applies exactly as for a manual order.
   */
  async place(actor: Actor, input: PlaceOrderInput, ip: string, automation?: { strategyId?: string; reason?: 'risk' | 'eod' }): Promise<OrderRow> {
    input = { ...input };
    if (actor.role !== 'TRADER') throw new AppError('FORBIDDEN', 'Only traders can place orders on their own account.');
    if (!automation) await this.consent.assertConsented(actor); // rules accepted for this signed-in session
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw badInput('Quantity must be a positive whole number.');
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(input.idempotencyKey)) throw badInput('Invalid idempotency key.');
    if (input.type === 'LIMIT' && (!input.limitPriceMinor || input.limitPriceMinor <= 0n)) throw badInput('Enter a limit price.');
    if (input.type !== 'LIMIT' && input.limitPriceMinor) throw badInput('Only limit orders take a limit price.');
    if (isTrigger(input.type) && (!input.triggerPriceMinor || input.triggerPriceMinor <= 0n)) throw badInput('Enter a trigger price.');
    if (!isTrigger(input.type) && input.triggerPriceMinor) throw badInput('Only stop-loss and take-profit orders take a trigger price.');
    const inst = this.market.instrument(input.instrumentId);
    if (!inst) throw notFound('Instrument');
    for (const px of [input.limitPriceMinor, input.triggerPriceMinor])
      if (px && px % BigInt(inst.tickMinor) !== 0n) throw badInput(`Price must be a multiple of the tick size (${Number(inst.tickMinor) / 100}).`);

    const [cfgMin, cfgMax, cfgMaxPos, rates, fees, closed, cutPct] = await Promise.all([
      this.config.get('trading.minQty'),
      this.config.get('trading.maxQtyPerOrder'),
      this.config.get('trading.maxQtyPerInstrument'),
      this.intradayRates(),
      feeRule(this.config),
      this.closedReason(inst.exchange),
      this.config.get('risk.autoCutLossPct'),
    ]);

    const result = await this.dbs.serializable(async (tx) => {
      const [dup] = await tx.select().from(orders).where(and(eq(orders.userId, actor.userId), eq(orders.idempotencyKey, input.idempotencyKey)));
      if (dup) {
        if (dup.instrumentId !== inst.id || dup.type !== input.type || (!input.closingPositionId && (dup.side !== input.side || (dup.requestedQuantity ?? dup.quantity) !== input.quantity))) throw conflict('Idempotency key reused with different order details.');
        return { order: dup, replay: true };
      }

      const [u] = await tx.select().from(users).where(eq(users.id, actor.userId));
      if (u.mode !== 'SIMULATED') throw new AppError('NOT_ENABLED', 'Live trading is not enabled on this platform.');
      const cash = await this.ledger.cashAccount(tx, u.id, 'SIMULATED');
      await this.ledger.lock(tx, cash); // serialize this user's order flow

      if(!inst.active || (inst.expiry && inst.expiry <= new Date())) throw badInput('This contract is inactive or expired. Choose an available instrument.');
      if(env().MARKET_FEED==='dhan'&&!this.market.hasVerifiedCatalog())throw badInput('Instrument catalog is unavailable or out of date. Wait for a successful refresh.');
      const q = this.market.quote(inst.id)!;
      if (env().MARKET_FEED === 'dhan' && (!q || q.source !== 'DHAN' || Date.now() - q.ts.getTime() > 60_000 || (input.side === 'BUY' ? q.askMinor : q.bidMinor) <= 0n)) throw badInput(closed ?? 'Live prices are updating. Please try again.');
      const [pos] = await tx
        .select()
        .from(positions)
        .where(and(eq(positions.userId, u.id), eq(positions.instrumentId, inst.id), eq(positions.mode, 'SIMULATED')));
      const net = pos?.netQty ?? 0;
      if (input.closingPositionId) {
        if (!pos || pos.id !== input.closingPositionId || net === 0) throw conflict('This position is already closed.');
        input.side = net > 0 ? 'SELL' : 'BUY';
        input.quantity = abs(net);
      }
      const signed = input.side === 'BUY' ? input.quantity : -input.quantity;
      const after = net + signed;
      const opening = opensExposure(net, signed);
      const reduceOnly = !!input.reduceOnly || isTrigger(input.type) || (input.type === 'LIMIT' && net * signed < 0 && input.quantity <= abs(net));
      const fillPrice = input.type === 'MARKET' ? this.venue.marketFillPrice(input.side, q)
        : input.type === 'LIMIT' ? this.venue.limitFillPrice(input.side, input.limitPriceMinor!, q) : null;
      const refPrice = fillPrice ?? input.limitPriceMinor ?? input.triggerPriceMinor!;

      let reject: string | null = null;
      if (!input.closingPositionId && input.quantity < cfgMin) reject = `Minimum quantity is ${cfgMin}.`;
      else if (!input.closingPositionId && input.quantity > cfgMax) reject = `Maximum ${cfgMax} per order.`;
      else if (abs(after) > cfgMaxPos) reject = `Position limit is ${cfgMaxPos} for this instrument.`;
      else if (closed && automation?.reason !== 'eod') reject = closed; // the end-of-day cut runs at (and just after) the close
      else if (isTrigger(input.type) && triggerHit(input.type, input.side, input.triggerPriceMinor!, q.ltpMinor))
        reject = `Trigger ${(Number(input.triggerPriceMinor) / 100).toFixed(2)} is already reached (LTP ${(Number(q.ltpMinor) / 100).toFixed(2)}). Use a market order or move the trigger.`;
      else if (reduceOnly && (net * signed >= 0 || input.quantity > abs(net)))
        reject = 'This exit order must reduce an existing opposite position.';
      if (!reject && opening && u.riskState === 'CUT')
        reject = `Your loss reached ${cutPct}% of your funds, so your trades were cut and new trades are paused. Add funds to trade again.`;
      // Immediate fills replace current collateral; resting entries reserve their full size.
      if (!reject && (opening || (fillPrice === null && !reduceOnly))) {
        const delta = fillPrice === null ? intradayMargin(input.quantity, inst.lotClass, rates.mini, rates.mega)
          : intradayMargin(after, inst.lotClass, rates.mini, rates.mega) - await this.positionMargin(pos, inst.lotClass, rates);
        const need = delta + brokerageMinor(fees, refPrice, input.quantity, inst.lotClass)
          - (fillPrice === null ? 0n : this.closingPnl(pos, signed, refPrice));
        const balance = await this.ledger.balance(tx, cash);
        const free = balance - (await this.marginUsed(tx, u.id, rates));
        if (need > free) reject = 'Insufficient margin.';
      }

      const [o] = await tx
        .insert(orders)
        .values({
          userId: u.id,
          instrumentId: inst.id,
          side: input.side,
          type: input.type,
          quantity: input.quantity,
          requestedQuantity: input.quantity,
          reduceOnly,
          limitPriceMinor: input.limitPriceMinor ?? null,
          triggerPriceMinor: input.triggerPriceMinor ?? null,
          status: reject ? 'REJECTED' : 'OPEN',
          rejectReason: reject,
          mode: 'SIMULATED',
          venue: this.venue.name,
          idempotencyKey: input.idempotencyKey,
          placedById: actor.userId,
          clientIp: requestContext.get()?.ip ?? ip,
          userAgent: requestContext.get()?.userAgent,
          sessionId: actor.sessionId,
          requestId: requestContext.get()?.requestId,
          strategyId: automation?.strategyId ?? null,
        })
        .returning();

      let final = o;
      if (!reject && fillPrice !== null) final = await this.fill(tx, o, fillPrice, fees, false, cash);
      await this.audit.record(tx, {
        actor,
        action: reject ? 'order.rejected' : 'order.placed',
        entityType: 'order',
        entityId: o.id,
        outcome: reject ? 'DENIED' : 'SUCCESS',
        ip,
        metadata: { symbol: inst.symbol, side: o.side, type: o.type, qty: o.quantity, limit: o.limitPriceMinor, trigger: o.triggerPriceMinor, status: final.status, reason: reject, venue: 'SIMULATED', strategyId: automation?.strategyId, ...(automation?.reason === 'risk' ? { autoCut: true } : automation?.reason === 'eod' ? { eodCut: true } : {}) },
      });
      return { order: final, replay: false };
    });
    if (!result.replay) void pubsub.publish(TOPIC.orderUpdate(actor.userId), { orderUpdated: result.order });
    return result.order;
  }

  async cancel(actor: Actor, orderId: string, ip: string) {
    const o = await this.dbs.serializable(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (!o || o.userId !== actor.userId) throw notFound('Order');
      if (o.status !== 'OPEN') throw badInput(`Order is already ${o.status.toLowerCase()}.`);
      const [c] = await tx.update(orders).set({ status: 'CANCELLED', updatedAt: new Date() }).where(eq(orders.id, o.id)).returning();
      await this.audit.record(tx, { actor, action: 'order.cancelled', entityType: 'order', entityId: o.id, outcome: 'SUCCESS', ip });
      return c;
    });
    void pubsub.publish(TOPIC.orderUpdate(actor.userId), { orderUpdated: o });
    return o;
  }

  // ------------------------------------------------------------------ fills

  /** Apply a simulated fill: update the order and position, post P&L and fees to the ledger. */
  private async fill(tx: Tx, o: OrderRow, price: bigint, fees: FeeRule, triggered = false, lockedCashAccount?: string): Promise<OrderRow> {
    const [owner] = await tx.select({ brokerId: users.brokerId, isDemo: users.isDemo }).from(users).where(eq(users.id, o.userId));
    const [broker] = owner?.brokerId ? await tx.select().from(users).where(eq(users.id, owner.brokerId)) : [];
    const mega = this.market.instrument(o.instrumentId)?.lotClass === 'MEGA';
    const defaultRate = await this.config.get(mega ? 'broker.commissionPerMegaLot' : 'broker.commissionPerMiniLot');
    const rate = broker ? (mega ? broker.commissionMegaMinor : broker.commissionMiniMinor) ?? BigInt(Math.round(defaultRate * 100)) : 0n;
    const brokerCommissionMinor = rate * BigInt(o.quantity);
    const [filled] = await tx
      .update(orders)
      .set({ status: 'FILLED', quantity: o.quantity, requestedQuantity: o.requestedQuantity ?? o.quantity, brokerIdAtFill: owner?.brokerId ?? null, brokerCommissionMinor, fillPriceMinor: price, filledAt: new Date(), updatedAt: new Date(), ...(triggered ? { triggeredAt: new Date() } : {}) })
      .where(and(eq(orders.id, o.id), eq(orders.status, 'OPEN')))
      .returning();
    if (!filled) return o; // someone else filled/cancelled it

    await tx
      .insert(positions)
      .values({ userId: o.userId, instrumentId: o.instrumentId, mode: 'SIMULATED' })
      .onConflictDoNothing();
    const [p] = await tx
      .select()
      .from(positions)
      .where(and(eq(positions.userId, o.userId), eq(positions.instrumentId, o.instrumentId), eq(positions.mode, 'SIMULATED')))
      .for('update');

    const signed = o.side === 'BUY' ? o.quantity : -o.quantity;
    const net = p.netQty;
    let avg = p.avgPriceMinor;
    let realized = 0n;
    const newNet = net + signed;
    if (net === 0 || Math.sign(net) === Math.sign(signed)) {
      avg = (avg * BigInt(abs(net)) + price * BigInt(abs(signed))) / BigInt(abs(newNet));
    } else {
      const closed = Math.min(abs(net), abs(signed));
      realized = (price - avg) * BigInt(closed) * (net > 0 ? 1n : -1n);
      if (newNet === 0) avg = 0n;
      else if (Math.sign(newNet) !== Math.sign(net)) avg = price; // flipped: remainder opens at fill price
    }
    await tx
      .update(positions)
      .set({ netQty: newNet, avgPriceMinor: avg, realizedPnlMinor: p.realizedPnlMinor + realized, cfDate: null, updatedAt: new Date() }) // a changed quantity needs a fresh carry forward
      .where(eq(positions.id, p.id));

    // Once a position closes or changes direction, its old protective orders no longer apply.
    if (net !== 0 && (newNet === 0 || Math.sign(newNet) !== Math.sign(net))) {
      const cancelled = await tx.update(orders).set({ status: 'CANCELLED', updatedAt: new Date(), rejectReason: 'Protected position closed.' })
        .where(and(eq(orders.userId, o.userId), eq(orders.instrumentId, o.instrumentId), eq(orders.status, 'OPEN'), eq(orders.reduceOnly, true))).returning();
      for (const c of cancelled) await this.audit.record(tx, { action: 'order.cancelled', entityType: 'order', entityId: c.id, outcome: 'SUCCESS', metadata: { reason: 'Protected position closed.', closingOrderId: o.id, userId: o.userId } });
    }

    const cash = lockedCashAccount ?? await this.ledger.cashAccount(tx, o.userId, 'SIMULATED');
    if (realized !== 0n) {
      const pnlAcct = await this.ledger.systemAccount(tx, 'SIM_MARKET_PNL', 'SIMULATED');
      await this.ledger.post(tx, {
        idempotencyKey: `pnl:${o.id}`,
        kind: 'TRADE_PNL',
        mode: 'SIMULATED',
        memo: `Simulated P&L ${o.side} ${o.quantity}`,
        postings: [
          { accountId: cash, amountMinor: realized },
          { accountId: pnlAcct, amountMinor: -realized },
        ],
        refType: 'order',
        refId: o.id,
      });
    }
    const fee = brokerageMinor(fees, price, o.quantity, this.market.instrument(o.instrumentId)?.lotClass);
    if (fee > 0n) {
      const feeAcct = await this.ledger.systemAccount(tx, 'FEE_INCOME', 'SIMULATED');
      await this.ledger.post(tx, {
        idempotencyKey: `fee:${o.id}`,
        kind: 'FEE',
        mode: 'SIMULATED',
        memo: `Simulated brokerage ${o.side} ${o.quantity}`,
        postings: [
          { accountId: cash, amountMinor: -fee },
          { accountId: feeAcct, amountMinor: fee },
        ],
        refType: 'order',
        refId: o.id,
      });
    }
    await this.notifications.notify(
      tx,
      o.userId,
      'order.filled',
      triggered ? `${o.type === 'STOP_LOSS' ? 'Stop-loss' : 'Take-profit'} triggered` : `Simulated order filled`,
      `${o.side} ${o.quantity} @ ${(Number(price) / 100).toFixed(2)}${triggered ? ' at LTP' : ''} (simulated fill — not an exchange trade)`,
      owner?.isDemo,
    );
    return filled;
  }

  private async matchOpenLimits(changed: Quote[]) {
    if (this.matching) return;
    this.matching = true;
    try {
      const ids = changed.map((q) => q.instrumentId);
      const open = await this.dbs.db
        .select()
        .from(orders)
        .where(and(eq(orders.status, 'OPEN'), inArray(orders.type, ['LIMIT', 'STOP_LOSS', 'TAKE_PROFIT']), inArray(orders.instrumentId, ids)))
        .limit(500);
      if (!open.length) return;
      const fees = await feeRule(this.config);
      const sessions = await this.sessions();
      const rates = await this.intradayRates();
      const maxPosition = await this.config.get('trading.maxQtyPerInstrument');
      for (const o of open) {
        if(env().MARKET_FEED==='dhan'&&!this.market.hasVerifiedCatalog())continue;
        const q = this.market.quote(o.instrumentId);
        if (env().MARKET_FEED === 'dhan' && (!q || q.source !== 'DHAN' || Date.now() - q.ts.getTime() > 60_000)) continue;
        if (!q) continue;
        const inst = this.market.instrument(o.instrumentId);
        if (!inst || !inst.active || (inst.expiry && inst.expiry <= new Date())) continue;
        if (sessions.enforced && inst && sessions.list.find((x) => x.exchange === inst.exchange)?.isOpen === false) continue; // honor the same timing policy as order placement
        const trig = isTrigger(o.type);
        // SL/TP orders are passed at the last traded price once the LTP reaches the trigger.
        const px = trig ? (triggerHit(o.type, o.side, o.triggerPriceMinor!, q.ltpMinor) ? q.ltpMinor : null) : this.venue.limitFillPrice(o.side, o.limitPriceMinor!, q);
        if (px === null) continue;
        try {
          const filled = await this.dbs.serializable(async (tx) => {
            const cash = await this.ledger.cashAccount(tx, o.userId, 'SIMULATED');
            await this.ledger.lock(tx, cash);
            const [cur] = await tx.select().from(orders).where(eq(orders.id, o.id)).for('update');
            if (cur?.status !== 'OPEN') return null;
            const [p] = await tx.select().from(positions).where(and(eq(positions.userId, o.userId), eq(positions.instrumentId, o.instrumentId), eq(positions.mode, 'SIMULATED')));
            const net = p?.netQty ?? 0;
            const reducing = net * (cur.side === 'BUY' ? 1 : -1) < 0;
            if (cur.reduceOnly && !reducing) {
              const [cancelled] = await tx.update(orders).set({ status: 'CANCELLED', rejectReason: 'Protected position closed.', updatedAt: new Date() }).where(eq(orders.id, cur.id)).returning();
              await this.audit.record(tx, { action: 'order.cancelled', entityType: 'order', entityId: cur.id, outcome: 'SUCCESS', metadata: { reason: 'Protected position closed.', userId: o.userId } });
              return cancelled;
            }
            const quantity = cur.reduceOnly ? Math.min(cur.quantity, abs(net)) : cur.quantity;
            const signed = cur.side === 'BUY' ? quantity : -quantity;
            let reject: string | null = null;
            if (opensExposure(net, signed)) {
              const [owner] = await tx.select().from(users).where(eq(users.id, o.userId));
              if (owner.riskState === 'CUT') reject = 'New trades are paused after the loss limit was reached.';
              else if (abs(net + signed) > maxPosition) reject = `Position limit is ${maxPosition} for this instrument.`;
              else {
                const reserved = cur.reduceOnly ? 0n : intradayMargin(cur.quantity, inst.lotClass, rates.mini, rates.mega);
                const required = await this.marginUsed(tx, o.userId, rates) - reserved - await this.positionMargin(p, inst.lotClass, rates)
                  + intradayMargin(net + signed, inst.lotClass, rates.mini, rates.mega) + brokerageMinor(fees, px, quantity, inst.lotClass);
                if (required > await this.ledger.balance(tx, cash) + this.closingPnl(p, signed, px)) reject = 'Insufficient margin.';
              }
            }
            if (reject) {
              const [rejected] = await tx.update(orders).set({ status: 'REJECTED', rejectReason: reject, updatedAt: new Date() }).where(eq(orders.id, cur.id)).returning();
              await this.audit.record(tx, { action: 'order.rejected', entityType: 'order', entityId: cur.id, outcome: 'DENIED', metadata: { reason: reject, userId: o.userId } });
              await this.notifications.notify(tx, o.userId, 'order.rejected', 'Order rejected', reject);
              return rejected;
            }
            const f = await this.fill(tx, { ...cur, quantity, requestedQuantity: cur.requestedQuantity ?? cur.quantity }, px, fees, trig, cash);
            // System action (matcher): no request IP of its own, so record where the order was placed from.
            await this.audit.record(tx, { action: trig ? 'order.triggered' : 'order.filled', entityType: 'order', entityId: o.id, outcome: 'SUCCESS', metadata: { price: px, quantity, requestedQuantity: cur.requestedQuantity ?? cur.quantity, type: o.type, trigger: o.triggerPriceMinor, venue: 'SIMULATED', userId: o.userId, placedFromIp: o.clientIp, placedSessionId: o.sessionId } });
            return f;
          });
          if (filled) void pubsub.publish(TOPIC.orderUpdate(o.userId), { orderUpdated: filled });
        } catch (e) {
          this.log.error(`limit match failed for ${o.id}: ${(e as Error).message}`);
        }
      }
    } finally {
      this.matching = false;
    }
  }

  // ------------------------------------------------------------------ reads (scoped)

  async listOrders(actor: Actor, userId: string, opts: { status?: OrderRow['status'][]; limit: number; before?: Date }, ip?: string) {
    await this.policy.assertCanAccessUser(actor, userId, ip);
    return this.dbs.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          opts.status?.length ? inArray(orders.status, opts.status) : undefined,
          opts.before ? lt(orders.createdAt, opts.before) : undefined,
          afterWipeFor(actor, orders.createdAt, orders.userId),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(opts.limit);
  }

  /**
   * Carry an open position forward to the next day (it is then not cut at the end of the day). Needs the
   * carry-forward margin for the whole position to be available; the margin rule changes under the cash lock.
   */
  async carryForward(actor: Actor, positionId: string, ip: string) {
    return this.dbs.serializable(async (tx) => {
      const cash = await this.ledger.cashAccount(tx, actor.userId, 'SIMULATED');
      await this.ledger.lock(tx, cash);
      const [p] = await tx.select().from(positions).where(eq(positions.id, positionId)).for('update');
      if (!p || p.userId !== actor.userId) throw notFound('Position');
      if (p.netQty === 0) throw badInput('This position is already closed.');
      const today = istDay();
      if (p.cfDate === today) return { position: p, marginMinor: 0n };
      await tx.select({ id: users.id }).from(users).where(eq(users.id, p.userId)).for('update'); // one margin check at a time per trader
      const [rates, cfBps] = await Promise.all([this.intradayRates(), this.config.get('trading.carryForwardMarginBps')]);
      const value = p.avgPriceMinor * BigInt(abs(p.netQty));
      const cfMargin = carryForwardMargin(value, p.netQty, this.market.instrument(p.instrumentId)?.lotClass, cfBps, await this.config.get('trading.carryForwardMarginPerMiniLot'), await this.config.get('trading.carryForwardMarginPerMegaLot'));
      const extra = cfMargin - intradayMargin(p.netQty, this.market.instrument(p.instrumentId)?.lotClass, rates.mini, rates.mega);
      const free = (await this.ledger.balance(tx, cash)) - (await this.marginUsed(tx, p.userId, rates));
      const inst = this.market.instrument(p.instrumentId);
      if (extra > 0n && extra > free) {
        await this.audit.record(tx, { actor, action: 'position.carry_forward', entityType: 'position', entityId: p.id, outcome: 'DENIED', ip, metadata: { symbol: inst?.symbol, qty: p.netQty, cfMargin: cfMargin.toString(), free: free.toString() } });
        throw badInput(`CF margin is not enough: ₹${(Number(cfMargin) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is needed to carry this position forward. Without CF it will be auto cut at 11:30 PM.`);
      }
      const [u] = await tx.update(positions).set({ cfDate: today, updatedAt: new Date() }).where(eq(positions.id, p.id)).returning();
      await this.audit.record(tx, { actor, action: 'position.carry_forward', entityType: 'position', entityId: p.id, outcome: 'SUCCESS', ip, metadata: { symbol: inst?.symbol, qty: p.netQty, cfMargin: cfMargin.toString(), day: today } });
      return { position: u, marginMinor: cfMargin };
    });
  }

  /** One immediate, idempotent close using the normal execution and brokerage ledger path. */
  async exitPosition(actor: Actor, positionId: string, key: string, ip: string) {
    if (actor.role !== 'TRADER') throw new AppError('FORBIDDEN', 'Only traders can exit their own positions.');
    if (!/^[A-Za-z0-9_-]{8,60}$/.test(key)) throw badInput('Invalid idempotency key.');
    const [p] = await this.dbs.db.select().from(positions).where(and(eq(positions.id, positionId), eq(positions.userId, actor.userId)));
    if (!p) throw notFound('Position');
    const idempotencyKey = `exit-${p.id}-${key}`;
    const [existing] = await this.dbs.db.select().from(orders).where(and(eq(orders.userId, actor.userId), eq(orders.idempotencyKey, idempotencyKey)));
    if (existing) return existing;
    if (!p.netQty) throw conflict('This position is already closed.');
    try {
      return await this.place(actor, { closingPositionId: p.id, instrumentId: p.instrumentId, side: p.netQty > 0 ? 'SELL' : 'BUY', type: 'MARKET', quantity: abs(p.netQty), idempotencyKey }, ip);
    } catch (error) {
      // PostgreSQL may report a unique-key collision rather than a serialization failure
      // when identical close requests start together. Return the committed winner.
      if (((error as any)?.cause?.code ?? (error as any)?.code) === '23505') {
        const [replayed] = await this.dbs.db.select().from(orders).where(and(eq(orders.userId, actor.userId), eq(orders.idempotencyKey, idempotencyKey)));
        if (replayed) return replayed;
      }
      throw error;
    }
  }

  /** Exit every open position of the signed-in trader at market (one click "Square off all"). */
  async squareOffAll(actor: Actor, ip: string) {
    const open = await this.dbs.db.select().from(positions).where(and(eq(positions.userId, actor.userId), eq(positions.mode, 'SIMULATED'), sql`${positions.netQty} <> 0`));
    // Market closed: nothing is exited (same rule as a normal order).
    for (const ex of new Set(open.map((p) => this.market.instrument(p.instrumentId)?.exchange).filter((x): x is string => !!x))) {
      const reason = await this.closedReason(ex);
      if (reason) throw badInput(reason);
    }
    const maxQty = await this.config.get('trading.maxQtyPerOrder');
    const closed: string[] = [];
    const failed: string[] = [];
    for (const p of open) {
      const sym = this.market.instrument(p.instrumentId)?.symbol ?? p.instrumentId;
      let left = abs(p.netQty);
      while (left > 0) {
        const qty = Math.min(left, maxQty);
        const o = await this.place(actor, { instrumentId: p.instrumentId, side: p.netQty > 0 ? 'SELL' : 'BUY', type: 'MARKET', quantity: qty, reduceOnly: true, idempotencyKey: `sqoff-${randomUUID()}` }, ip)
          .catch((e: Error) => ({ status: 'ERROR', rejectReason: e.message }) as const);
        if (o.status !== 'FILLED') { failed.push(`${sym}: ${o.rejectReason ?? o.status}`); break; }
        left -= qty;
      }
      if (left === 0) closed.push(sym);
    }
    await this.dbs.db.transaction((tx) => this.audit.record(tx, { actor, action: 'position.square_off_all', entityType: 'user', entityId: actor.userId, outcome: failed.length ? 'FAILURE' : 'SUCCESS', ip, metadata: { closed, failed } }));
    return { closed, failed };
  }

  /** Return to fixed intraday margin, checking any additional funds required under the cash lock. */
  async cancelCarryForward(actor: Actor, positionId: string, ip: string) {
    return this.dbs.serializable(async (tx) => {
      const cash = await this.ledger.cashAccount(tx, actor.userId, 'SIMULATED');
      await this.ledger.lock(tx, cash);
      const [p] = await tx.select().from(positions).where(eq(positions.id, positionId)).for('update');
      if (!p || p.userId !== actor.userId) throw notFound('Position');
      if (!p.cfDate) return p;
      if (p.cfDate === istDay() && p.netQty !== 0) {
        const [rates, cfBps, miniCf, megaCf] = await Promise.all([this.intradayRates(), this.config.get('trading.carryForwardMarginBps'), this.config.get('trading.carryForwardMarginPerMiniLot'), this.config.get('trading.carryForwardMarginPerMegaLot')]);
        const lotClass = this.market.instrument(p.instrumentId)?.lotClass;
        const extra = intradayMargin(p.netQty, lotClass, rates.mini, rates.mega) - carryForwardMargin(p.avgPriceMinor * BigInt(abs(p.netQty)), p.netQty, lotClass, cfBps, miniCf, megaCf);
        if (extra > 0n) {
          const free = await this.ledger.balance(tx, cash) - await this.marginUsed(tx, actor.userId, rates);
          if (extra > free) throw badInput('Insufficient funds for intraday margin. Add funds or exit the position before turning carry forward off.');
        }
      }
      const [u] = await tx.update(positions).set({ cfDate: null, updatedAt: new Date() }).where(eq(positions.id, p.id)).returning();
      await this.audit.record(tx, { actor, action: 'position.carry_forward_off', entityType: 'position', entityId: p.id, outcome: 'SUCCESS', ip, metadata: { symbol: this.market.instrument(p.instrumentId)?.symbol, qty: p.netQty } });
      return u;
    });
  }

  async listPositions(actor: Actor, userId: string, ip?: string) {
    await this.policy.assertCanAccessUser(actor, userId, ip);
    return this.dbs.db
      .select()
      .from(positions)
      .where(and(eq(positions.userId, userId), sql`(${positions.netQty} <> 0 OR ${positions.realizedPnlMinor} <> 0)`))
      .orderBy(desc(positions.updatedAt));
  }
}
