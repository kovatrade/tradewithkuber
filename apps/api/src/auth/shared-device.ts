import { and, eq, ne, sql , inArray} from 'drizzle-orm';
import { deviceAccountLogins, users, type UserRow } from '../db/schema';
import type { Tx } from '../db/db';
import { peppered } from '../common/crypto';
import type { ClientMeta } from './auth.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { AuditService } from '../audit/audit.service';

export async function recordDeviceLogin(tx: Tx, user: UserRow, meta: ClientMeta, sessionId: string, notifications: NotificationsService, audit: AuditService) {
  if (!meta.deviceId || !/^[a-f0-9-]{36}$/i.test(meta.deviceId)) return;
  const deviceHash = peppered(`login-device:${meta.deviceId}`);
  // Serialize account switches even when two accounts sign in simultaneously.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${deviceHash}, 0))`);
  const previous = await tx.select({ id: users.id, username: users.username, role: users.role, at: deviceAccountLogins.lastLoginAt, ip: deviceAccountLogins.ip })
    .from(deviceAccountLogins).innerJoin(users, eq(users.id, deviceAccountLogins.userId))
    .where(and(eq(deviceAccountLogins.deviceHash, deviceHash), ne(deviceAccountLogins.userId, user.id)));
  const now = new Date();
  const details = { lastLoginAt: now, deviceName: meta.deviceName?.slice(0, 120), userAgent: meta.userAgent.slice(0, 400), ip: meta.ip };
  await tx.insert(deviceAccountLogins).values({ deviceHash, userId: user.id, ...details })
    .onConflictDoUpdate({ target: [deviceAccountLogins.deviceHash, deviceAccountLogins.userId], set: details });
  if (!previous.length) return;
  const admins = await tx.select({ id: users.id }).from(users).where(and(inArray(users.role, ['SUPER_ADMIN', 'DEVELOPER']), eq(users.status, 'ACTIVE')));
  const stamp = (at: Date) => at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
  for (const other of previous) {
    const body = `${other.username} (${other.role}) signed in at ${stamp(other.at)} from IP ${other.ip ?? 'unknown'}. ${user.username} (${user.role}) signed in on the same device at ${stamp(now)} from IP ${meta.ip}. Device: ${meta.deviceName ?? meta.userAgent.slice(0, 120)}. Device reference: ${deviceHash.slice(0, 12)}. Session: ${sessionId}.`;
    for (const admin of admins) await notifications.notify(tx, admin.id, 'security.shared_device', 'Different accounts signed in on the same device', body);
  }
  await audit.record(tx, { actor: { userId: user.id, role: user.role }, action: 'auth.shared_device', entityType: 'session', entityId: sessionId, outcome: 'SUCCESS', ip: meta.ip, metadata: { deviceHash, deviceName: meta.deviceName, userAgent: meta.userAgent, previousAccounts: previous.map(p => ({ userId: p.id, username: p.username, role: p.role, lastLoginAt: p.at.toISOString(), ip: p.ip })) } });
}
