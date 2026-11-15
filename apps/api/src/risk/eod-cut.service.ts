import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/context';
import { ConfigService } from '../config-mgmt/config.service';
import { DbService } from '../db/db';
import { orders, positions, users } from '../db/schema';
import { MarketDataService } from '../market/market-data.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../trading/orders.service';

const IST_MS = 5.5 * 3600_000;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * End-of-day auto cut: when an exchange closes (for MCX, 23:30 IST) every open position on it that was not carried
 * forward for today is cut at market. Runs on trading days only, once per exchange per day, and keeps retrying
 * for `trading.autoCutWindowMinutes` after the close if a cut fails (for example, no fresh quote).
 */
@Injectable()
export class EodCutService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('EodCut');
  private timer?: NodeJS.Timeout;
  private running = false;
  /** exchange|IST date already finished. */
  private done = new Set<string>();

  constructor(
    private readonly dbs: DbService,
    private readonly market: MarketDataService,
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return; // tests call run() directly
    this.timer = setInterval(() => void this.run(), 20_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Cut what is due now. `now` is for tests. Returns the exchanges handled. */
  async run(now = new Date()): Promise<string[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const [on, exchanges, windowMin, hours, holidays] = await Promise.all([
        this.config.get('trading.autoCutAtClose'),
        this.config.get('trading.autoCutExchanges'),
        this.config.get('trading.autoCutWindowMinutes'),
        this.config.get('trading.marketHours'),
        this.config.get('trading.marketHolidays'),
      ]);
      if (!on) return [];
      const ist = new Date(now.getTime() + IST_MS);
      const day = ist.toISOString().slice(0, 10);
      const dow = ist.getUTCDay();
      if (dow === 0 || dow === 6 || holidays.includes(day)) return [];
      const nowMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      const handled: string[] = [];
      for (const ex of exchanges) {
        const h = hours[ex];
        if (!h || h.open > h.close) continue; // overnight sessions are not cut here
        const close = minutes(h.close);
        if (nowMin < close || nowMin > close + windowMin) continue;
        const key = `${ex}|${day}`;
        if (this.done.has(key)) continue;
        const failed = await this.cutExchange(ex, day);
        if (failed === 0) this.done.add(key);
        handled.push(ex);
      }
      if (this.done.size > 200) this.done = new Set([...this.done].slice(-50));
      return handled;
    } catch (e) {
      this.log.error(`Auto cut failed: ${(e as Error).message}`);
      return [];
    } finally {
      this.running = false;
    }
  }

  /** Cut every open, not-carried-forward position on this exchange. Returns how many could not be cut. */
  private async cutExchange(exchange: string, day: string): Promise<number> {
    const open = await this.dbs.db.select().from(positions)
      .where(and(ne(positions.netQty, 0), eq(positions.mode, 'SIMULATED'), or(isNull(positions.cfDate), ne(positions.cfDate, day))));
    const due = open.filter((p) => this.market.instrument(p.instrumentId)?.exchange === exchange);
    if (!due.length) return 0;
    const maxQty = await this.config.get('trading.maxQtyPerOrder');
    let failedCount = 0;
    const byUser = new Map<string, typeof due>();
    for (const p of due) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
    for (const [userId, list] of byUser) {
      const actor: Actor = { userId, role: 'TRADER', sessionId: userId, mfaVerified: true };
      // Pending orders on this exchange would reopen a trade after the cut.
      const pending = await this.dbs.db.select({ id: orders.id, instrumentId: orders.instrumentId }).from(orders).where(and(eq(orders.userId, userId), eq(orders.status, 'OPEN')));
      for (const o of pending) if (this.market.instrument(o.instrumentId)?.exchange === exchange) await this.orders.cancel(actor, o.id, 'eod').catch(() => undefined);
      const cut: string[] = [];
      const failed: string[] = [];
      for (const p of list) {
        const sym = this.market.instrument(p.instrumentId)?.symbol ?? p.instrumentId;
        let left = Math.abs(p.netQty);
        while (left > 0) {
          const qty = Math.min(left, maxQty);
          const o = await this.orders.place(actor, { instrumentId: p.instrumentId, side: p.netQty > 0 ? 'SELL' : 'BUY', type: 'MARKET', quantity: qty, idempotencyKey: `eod-${randomUUID()}` }, 'eod', { reason: 'eod' })
            .catch((e: Error) => ({ status: 'ERROR', rejectReason: e.message }) as const);
          if (o.status !== 'FILLED') { failed.push(`${sym}: ${o.rejectReason ?? o.status}`); break; }
          left -= qty;
        }
        if (left === 0) cut.push(`${sym} ${p.netQty > 0 ? '+' : ''}${p.netQty}`);
      }
      failedCount += failed.length;
      if (!cut.length && !failed.length) continue;
      const [u] = await this.dbs.db.select({ username: users.username, brokerId: users.brokerId }).from(users).where(eq(users.id, userId));
      const body = `${exchange} closed: positions without Carry Forward were cut at market. ${cut.length ? `Cut: ${cut.join(', ')}.` : ''}${failed.length ? ` Not cut yet (will retry): ${failed.join('; ')}.` : ''}`;
      await this.dbs.db.transaction(async (tx) => {
        if (cut.length) await this.notifications.notify(tx, userId, 'trading.eod_cut', `Auto cut at ${exchange} close`, body);
        if (u?.brokerId && cut.length) await this.notifications.notify(tx, u.brokerId, 'trading.eod_cut', `${u.username}: auto cut at ${exchange} close`, body);
        await this.audit.record(tx, { actor: null, action: 'trading.eod_cut', entityType: 'user', entityId: userId, outcome: failed.length ? 'FAILURE' : 'SUCCESS', metadata: { exchange, day, cut, failed } });
      });
      this.log.warn(`EOD cut ${u?.username} on ${exchange}: ${cut.length} cut, ${failed.length} failed`);
    }
    return failedCount;
  }
}
