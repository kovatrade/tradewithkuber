import 'reflect-metadata';
import { FirebaseService } from '../src/firebase/firebase.service';
import { AuthService } from '../src/auth/auth.service';
import { PushService } from '../src/notifications/push.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PgDialect } from 'drizzle-orm/pg-core';

const config = { SMS_PROVIDER: 'firebase', FIREBASE_PUSH_ENABLED: true, FIREBASE_PROJECT_ID: 'test-project', HASH_PEPPER: 'test-pepper'.repeat(5), WEB_APP_URL: 'https://example.test' };
jest.mock('../src/config/env', () => ({ env: () => config }));
jest.mock('firebase-admin/app', () => ({ getApps: () => [{ name: 'tradedesk' }] }));
const verifyIdToken = jest.fn();
jest.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }));
jest.mock('../src/common/crypto', () => ({ ...jest.requireActual('../src/common/crypto'), decryptField: () => 'device-token' }));

describe('Firebase SMS ownership', () => {
  const service = new FirebaseService();
  const phone = '+919876543210';
  const claim = () => ({ uid: 'firebase-user', auth_time: Math.floor(Date.now() / 1000), phone_number: phone, firebase: { sign_in_provider: 'phone' } });
  beforeEach(() => verifyIdToken.mockReset());
  it('verifies revocation and derives the same replay key across refreshed tokens', async () => {
    verifyIdToken.mockResolvedValue(claim());
    const first = await service.verifyPhone('firebase:first-token', phone);
    expect(await service.verifyPhone('firebase:refreshed-token', phone)).toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyIdToken).toHaveBeenCalledWith('first-token', true);
  });
  it.each(['other phone', 'stale sign-in', 'future sign-in', 'different provider', 'revoked'])('rejects %s', async reason => {
    const token = claim();
    if (reason === 'other phone') token.phone_number = '+919999999999';
    if (reason === 'stale sign-in') token.auth_time -= 301;
    if (reason === 'future sign-in') token.auth_time += 60;
    if (reason === 'different provider') token.firebase.sign_in_provider = 'password';
    if (reason === 'revoked') verifyIdToken.mockRejectedValue(new Error('revoked'));
    else verifyIdToken.mockResolvedValue(token);
    await expect(service.verifyPhone('firebase:token', phone)).rejects.toThrow();
  });
  it('rejects an ordinary SMS code and oversized proof before contacting Firebase', async () => {
    await expect(service.verifyPhone('123456', phone)).rejects.toThrow();
    await expect(service.verifyPhone('firebase:' + 'x'.repeat(8192), phone)).rejects.toThrow();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});

describe('Firebase proof consumption', () => {
  function fixture() {
    const selected: unknown[][] = [];
    const chain: any = { from: () => chain, where: () => chain, orderBy: () => chain, limit: () => chain, for: () => chain, then: (resolve: any) => Promise.resolve(selected.shift() ?? []).then(resolve) };
    const consumed = new Set<string>();
    const tx = {
      select: () => chain,
      insert: () => ({ values: (value: any) => ({ onConflictDoNothing: () => ({ returning: async () => { if (consumed.has(value.assertionHash)) return []; consumed.add(value.assertionHash); return [value]; } }) }) }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    };
    const firebase = { verifyPhone: jest.fn(async (proof: string, phone: string) => { if (proof !== 'firebase:valid' || phone !== '+919876543210') throw new Error('invalid'); return 'assertion'; }) };
    const service = new AuthService({ serializable: (fn: any) => fn(tx) } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, firebase as any);
    return { service, selected, tx, firebase };
  }
  it('requires a live purpose-specific challenge and prevents proof reuse for another operation', async () => {
    const f = fixture();
    f.selected.push([{ id: 'signup', attempts: 0 }]);
    expect(await (f.service as any).consumeOtp(f.tx, '+919876543210', 'signup', 'firebase:valid')).toBe(true);
    f.selected.push([{ id: 'reset', attempts: 0 }]);
    expect(await (f.service as any).consumeOtp(f.tx, '+919876543210', 'reset', 'firebase:valid')).toBe(false);
  });
  it('rejects legacy numeric codes when Firebase is selected', async () => {
    const f = fixture(); f.selected.push([{ id: 'signup', attempts: 0 }]);
    expect(await (f.service as any).consumeOtp(f.tx, '+919876543210', 'signup', '123456')).toBe(false);
  });
  it('does not verify a proof for an expired challenge', async () => {
    const f = fixture(); f.selected.push([]);
    expect(await (f.service as any).consumeOtp(f.tx, '+919876543210', 'signup', 'firebase:valid')).toBe(false);
    expect(f.firebase.verifyPhone).not.toHaveBeenCalled();
  });
});

describe('Durable FCM delivery', () => {
  const dialect = new PgDialect();
  const job = { id: 'job', device_id: 'device', attempts: 1 };
  const note = { token_enc: 'encrypted', notification_id: 'note', title: 'Order filled', body: 'Simulated order', kind: 'order.filled', user_id: 'owner', role: 'BROKER', is_demo: false, created_at: new Date() };
  function fixture() {
    const execute = jest.fn().mockResolvedValueOnce({ rows: [job] }).mockResolvedValueOnce({ rows: [note] });
    const updates: any[] = [];
    const db = { execute, update: () => ({ set: (value: any) => { updates.push(value); return { where: async () => [] }; } }), delete: jest.fn(() => ({ where: async () => [] })) };
    const send = jest.fn().mockResolvedValue('message');
    return { execute, updates, db, send, service: new PushService({ db } as any, { messaging: { send } } as any) };
  }
  it('queues each recipient in the notification transaction without calling FCM', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [] });
    const tx = { insert: () => ({ values: () => ({ returning: async () => [{ id: 'note' }] }) }), execute };
    const transaction = jest.fn((fn: any) => fn(tx));
    const db = { transaction };
    await new NotificationsService({ db } as any).notify(db as any, 'trader', 'order.filled', 'Filled', 'Body');
    expect(transaction).toHaveBeenCalledTimes(1);
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain('INSERT INTO push_deliveries');
    expect(query.sql).toContain('s.revoked_at IS NULL');
    expect(query.sql).toContain("u.role IN ('SUPER_ADMIN', 'BROKER')");
    expect(query.sql).toContain('u.is_demo = false');
    expect(query.params).toEqual(['note', 'trader']);
  });
  it('claims committed jobs with a lease and sends visible high priority alerts', async () => {
    const f = fixture(); await f.service.drain();
    expect(dialect.sqlToQuery(f.execute.mock.calls[0][0]).sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(dialect.sqlToQuery(f.execute.mock.calls[1][0]).sql).toContain('s.revoked_at IS NULL');
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ notification: { title: note.title, body: 'order' }, data: expect.objectContaining({ userId: 'owner' }), android: expect.objectContaining({ priority: 'high', notification: expect.objectContaining({ channelId: 'activity', tag: 'note' }) }) }));
    const query = dialect.sqlToQuery(f.execute.mock.calls[1][0]);
    expect(query.sql).toContain("u.role IN ('SUPER_ADMIN', 'BROKER')");
    expect(query.sql).toContain('u.is_demo = false');
    expect(f.updates[0]).toEqual({ finishedAt: expect.any(Date), lastError: null });
  });
  it('delivers notifications while Firebase SMS is disabled', async () => {
    const previous = config.SMS_PROVIDER;
    config.SMS_PROVIDER = 'dev';
    try { const f = fixture(); await f.service.drain(); expect(f.send).toHaveBeenCalledTimes(1); }
    finally { config.SMS_PROVIDER = previous; }
  });
  it('rejects a test notification when the current session has no device registration', async () => {
    const where = jest.fn((_condition: any) => ({ limit: async () => [] }));
    const tx = { select: () => ({ from: () => ({ where }) }), insert: jest.fn() };
    const db = { select: () => ({ from: () => ({ where: async () => [{ role: 'BROKER', isDemo: false }] }) }), transaction: (fn: any) => fn(tx) };
    await expect(new NotificationsService({ db } as any).sendTest({ userId: 'owner', sessionId: 'current-session', role: 'TRADER', mfaVerified: false })).rejects.toThrow(/Allow notifications/);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(dialect.sqlToQuery(where.mock.calls[0][0]).params).toEqual(['owner', 'current-session']);
  });
  it.each([
    ['TRADER', false], ['TRADER', true], ['BROKER', true], ['SUPER_ADMIN', true],
  ])('blocks queued external notifications for %s, demo=%s', async (role, isDemo) => {
    const f = fixture();
    f.execute.mockReset().mockResolvedValueOnce({ rows: [job] }).mockResolvedValueOnce({ rows: [{ ...note, role, is_demo: isDemo }] });
    await f.service.drain();
    expect(f.send).not.toHaveBeenCalled();
    expect(f.updates[0].lastError).toBe('in-app-only');
  });
  it.each(['BROKER', 'SUPER_ADMIN'])('continues external delivery for %s', async role => {
    const f = fixture();
    f.execute.mockReset().mockResolvedValueOnce({ rows: [job] }).mockResolvedValueOnce({ rows: [{ ...note, role }] });
    await f.service.drain();
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it.each([['TRADER', false], ['TRADER', true], ['BROKER', true], ['SUPER_ADMIN', true]])('declines token registration and test pushes for %s, demo=%s', async (role, isDemo) => {
    const deleted = jest.fn();
    const db = { select: () => ({ from: () => ({ where: async () => [{ role, isDemo }] }) }), delete: () => ({ where: deleted }) };
    // A stale staff claim cannot override the current database account policy.
    const actor = { userId: 'owner', sessionId: 'session', role: 'SUPER_ADMIN' as const, mfaVerified: true };
    const send = jest.fn();
    await expect(new PushService({ db } as any, { messaging: { send } } as any).register(actor, 'a-valid-long-device-token', 'android', 'installation-12345')).resolves.toBe(false);
    expect(deleted).toHaveBeenCalledTimes(1);
    await expect(new NotificationsService({ db } as any).sendTest(actor)).rejects.toThrow(/inside the app only/);
    expect(send).not.toHaveBeenCalled();
  });
  it('retries temporary FCM errors without marking the job delivered', async () => {
    const f = fixture(); f.send.mockRejectedValue({ code: 'messaging/server-unavailable' }); await f.service.drain();
    expect(f.updates[0]).toEqual({ nextAttemptAt: expect.any(Date), lastError: 'messaging/server-unavailable' });
  });
  it('removes expired device tokens', async () => {
    const f = fixture(); f.send.mockRejectedValue({ code: 'messaging/registration-token-not-registered' }); await f.service.drain();
    expect(f.db.delete).toHaveBeenCalled();
  });
  it('does not send alerts for signed-out sessions or notifications older than the TTL', async () => {
    const f = fixture(); f.execute.mockReset().mockResolvedValueOnce({ rows: [job] }).mockResolvedValueOnce({ rows: [] }); await f.service.drain();
    expect(f.send).not.toHaveBeenCalled(); expect(f.updates[0].lastError).toBe('expired-or-signed-out');
  });
  it('stops retries after eight failed attempts', async () => {
    const f = fixture(); f.execute.mockReset().mockResolvedValueOnce({ rows: [{ ...job, attempts: 8 }] }).mockResolvedValueOnce({ rows: [note] });
    f.send.mockRejectedValue({ code: 'messaging/server-unavailable' }); await f.service.drain();
    expect(f.updates[0].finishedAt).toBeInstanceOf(Date);
  });
});
