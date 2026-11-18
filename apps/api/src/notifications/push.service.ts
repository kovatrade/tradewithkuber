import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { DbService } from '../db/db';
import { pushDevices, pushDeliveries, users } from '../db/schema';
import { externalPushAllowed } from './push-policy';
import { decryptField, encryptField } from '../common/crypto';
import { badInput } from '../common/errors';
import type { Actor } from '../common/context';
import { env } from '../config/env';
import { FirebaseService } from '../firebase/firebase.service';
import { notificationDestination } from './navigation';
import { presentNotification } from './presentation';

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('FirebasePush');
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  constructor(private readonly dbs: DbService, private readonly firebase: FirebaseService) {}

  async register(actor: Actor, token: string, platform: string, installationId: string) {
    if (!env().FIREBASE_PUSH_ENABLED) return false;
    if (!['android', 'ios', 'web'].includes(platform) || token.length < 20 || token.length > 4096 || !/^[\w-]{16,100}$/.test(installationId)) throw badInput('Invalid push registration.');
    const [account] = await this.dbs.db.select({ role: users.role, isDemo: users.isDemo }).from(users).where(eq(users.id, actor.userId));
    if (!account || !externalPushAllowed(account)) {
      await this.unregister(actor, installationId);
      return false;
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.dbs.db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${installationId}))`);
      const [existing] = await tx.select().from(pushDevices).where(eq(pushDevices.installationId, installationId));
      if (existing?.userId === actor.userId && existing.tokenHash === tokenHash) {
        await tx.update(pushDevices).set({ sessionId: actor.sessionId, updatedAt: new Date() }).where(eq(pushDevices.id, existing.id));
        return;
      }
      // Token rotation and account switching must remove the previous ownership and queued messages.
      await tx.delete(pushDevices).where(sql`${pushDevices.installationId} = ${installationId} OR ${pushDevices.tokenHash} = ${tokenHash}`);
      await tx.insert(pushDevices).values({ userId: actor.userId, sessionId: actor.sessionId, installationId, tokenHash, tokenEnc: encryptField(token, 'push_devices.token'), platform });
    });
    return true;
  }

  async unregister(actor: Actor, installationId: string) {
    await this.dbs.db.delete(pushDevices).where(and(eq(pushDevices.installationId, installationId), eq(pushDevices.userId, actor.userId)));
    return true;
  }

  onModuleInit() {
    if (!env().FIREBASE_PUSH_ENABLED) return;
    this.timer = setInterval(() => {
      if (!this.running) this.running = this.drain().catch(() => { this.log.error('Push queue processing failed; pending deliveries will retry.'); }).finally(() => { this.running = undefined; });
    }, 2000);
    this.timer.unref();
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.running; }

  /** SQL leases survive crashes and allow multiple API workers without sending before commit. */
  async drain() {
    const { rows } = await this.dbs.db.execute<{ id: string; device_id: string; attempts: number }>(sql`
      WITH due AS (
        SELECT id FROM push_deliveries WHERE finished_at IS NULL AND next_attempt_at <= now()
        ORDER BY next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED
      ) UPDATE push_deliveries p SET attempts = p.attempts + 1, next_attempt_at = now() + interval '2 minutes'
      FROM due WHERE p.id = due.id RETURNING p.id, p.device_id, p.attempts`);
    const results = await Promise.allSettled(rows.map(job => this.deliver(job)));
    if (results.some(r => r.status === 'rejected')) this.log.error('Push queue database update failed; leases will expire and retry.');
  }

  private async deliver(job: { id: string; device_id: string; attempts: number }) {
    try {
      const { rows: [n] } = await this.dbs.db.execute<{
        token_enc: string; notification_id: string; title: string; body: string; kind: string;
        user_id: string; role: Actor['role']; is_demo: boolean; created_at: Date;
      }>(sql`SELECT d.token_enc, n.id AS notification_id, n.title, n.body, n.kind, n.user_id, u.role, u.is_demo, n.created_at
        FROM push_deliveries p JOIN push_devices d ON d.id = p.device_id
        JOIN notifications n ON n.id = p.notification_id AND n.user_id = d.user_id
        JOIN users u ON u.id = d.user_id AND u.status = 'ACTIVE' AND u.role IN ('SUPER_ADMIN', 'DEVELOPER', 'BROKER') AND u.is_demo = false
        JOIN sessions s ON s.id = d.session_id AND s.user_id = d.user_id AND s.revoked_at IS NULL AND s.expires_at > now()
        WHERE p.id = ${job.id} AND n.created_at > now() - interval '24 hours'`);
      if (!n) { await this.finish(job.id, 'expired-or-signed-out'); return; }
      if (!externalPushAllowed({ role: n.role, isDemo: n.is_demo })) { await this.finish(job.id, 'in-app-only'); return; }
      const href = notificationDestination(n.role, n.kind) ?? '/notifications';
      const text = presentNotification(n);
      await this.firebase.messaging.send({
        token: decryptField(n.token_enc, 'push_devices.token'),
        notification: { title: text.title, body: text.body },
        data: { notificationId: n.notification_id, kind: n.kind, href, userId: n.user_id },
        android: { priority: 'high', ttl: 86_400_000, notification: { channelId: 'activity', sound: 'default', tag: n.notification_id } },
        apns: { headers: { 'apns-priority': '10', 'apns-push-type': 'alert', 'apns-collapse-id': n.notification_id, 'apns-expiration': String(Math.floor(new Date(n.created_at).getTime() / 1000) + 86400) }, payload: { aps: { sound: 'default' } } },
        webpush: { headers: { Urgency: 'high', TTL: '86400' }, notification: { tag: n.notification_id }, fcmOptions: { link: new URL(href, env().WEB_APP_URL).href } },
      });
      await this.finish(job.id);
    } catch (e) {
      const code = String((e as { code?: string }).code ?? 'push/unavailable').slice(0, 100);
      if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code)) {
        await this.dbs.db.delete(pushDevices).where(eq(pushDevices.id, job.device_id));
        return;
      }
      const permanent = ['messaging/invalid-argument', 'messaging/mismatched-credential'].includes(code);
      if (permanent || job.attempts >= 8) { await this.finish(job.id, code); this.log.error(`Push delivery exhausted: ${code}`); return; }
      const delay = Math.min(3600, 10 * 2 ** (job.attempts - 1)) + Math.floor(Math.random() * 10);
      await this.dbs.db.update(pushDeliveries).set({ nextAttemptAt: new Date(Date.now() + delay * 1000), lastError: code }).where(eq(pushDeliveries.id, job.id));
      this.log.warn(`Push delivery will retry: ${code}`);
    }
  }
  private async finish(id: string, lastError: string | null = null) {
    await this.dbs.db.update(pushDeliveries).set({ finishedAt: new Date(), lastError }).where(eq(pushDeliveries.id, id));
  }
}
