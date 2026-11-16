import 'reflect-metadata';
import { carryForwardMargin } from '../src/trading/margin';
import { CONFIG_REGISTRY } from '../src/config-mgmt/registry';
import { recordDeviceLogin } from '../src/auth/shared-device';
import { PgDialect } from 'drizzle-orm/pg-core';

jest.mock('../src/common/crypto', () => ({ peppered: (v: string) => require('crypto').createHash('sha256').update(v).digest('hex') }));

describe('Carry-forward margin per lot', () => {
  it('uses mini and mega fixed rupee amounts for every lot', () => {
    expect(carryForwardMargin(9000000n, 3, 'MINI', 167, 1500.25, 12000)).toBe(450075n);
    expect(carryForwardMargin(9000000n, 3, 'MEGA', 167, 1500.25, 12000)).toBe(3600000n);
    expect(carryForwardMargin(9000000n, -3, 'MEGA', 167, 1500.25, 12000)).toBe(3600000n);
  });
  it('preserves percentage fallback independently for each lot class', () => {
    expect(carryForwardMargin(1000000n, 2, 'MINI', 167, null, 1000)).toBe(16700n);
    expect(carryForwardMargin(1000000n, 2, 'MEGA', 167, 1000, null)).toBe(16700n);
    expect(carryForwardMargin(1000000n, 2, 'MINI', 167, 0, null)).toBe(0n);
  });
  it('rejects negative or sub-paise configuration values', () => {
    const schema = CONFIG_REGISTRY['trading.carryForwardMarginPerMiniLot'].schema;
    expect(schema.safeParse(-1).success).toBe(false);
    expect(schema.safeParse(1.001).success).toBe(false);
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse(1500.25).success).toBe(true);
  });
});

describe('Shared installation alerts', () => {
  const deviceId = 'c21ce39b-dab4-4f8c-8b18-64a1430aabb3';
  function fixture(previous: any[] = []) {
    const selected = [previous, [{ id: 'admin' }]];
    const chain: any = { from: () => chain, innerJoin: () => chain, where: async () => selected.shift() ?? [] };
    const values = jest.fn((_row: any) => ({ onConflictDoUpdate: async () => [] }));
    const tx = { execute: jest.fn(), select: () => chain, insert: () => ({ values }) };
    const notifications = { notify: jest.fn() }, audit = { record: jest.fn() };
    const meta = { deviceId, ip: '127.0.0.1', userAgent: 'Test phone', deviceName: 'Android phone' };
    const run = (metadata = meta) => recordDeviceLogin(tx as any, { id: 'broker2', username: 'broker.two', role: 'BROKER' } as any, metadata, 'session', notifications as any, audit as any);
    return { tx, values, notifications, audit, run, meta };
  }
  it('stores the installation hash and does not flag its first account', async () => {
    const f = fixture(); await f.run();
    const row = f.values.mock.calls[0][0] as any;
    expect(row.deviceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain(deviceId);
    expect(f.notifications.notify).not.toHaveBeenCalled();
    const lock = new PgDialect().sqlToQuery(f.tx.execute.mock.calls[0][0]);
    expect(lock.sql).toContain('pg_advisory_xact_lock');
  });
  it('alerts administrators with both accounts, login times, device and IP', async () => {
    const f = fixture([{ id: 'broker1', username: 'broker.one', role: 'BROKER', at: new Date('2026-11-16T08:00:00Z'), ip: '10.0.0.1' }]);
    await f.run();
    expect(f.notifications.notify).toHaveBeenCalledWith(f.tx, 'admin', 'security.shared_device', expect.any(String), expect.stringMatching(/broker.one.*broker.two.*Android phone/));
    const body = f.notifications.notify.mock.calls[0][4];
    expect(body).toContain('10.0.0.1'); expect(body).toContain('127.0.0.1'); expect(body).toContain('IST');
    expect(f.audit.record).toHaveBeenCalledWith(f.tx, expect.objectContaining({ action: 'auth.shared_device' }));
  });
  it('does not group devices without a valid persistent identifier', async () => {
    const f = fixture(); await f.run({ ...f.meta, deviceId: '' });
    expect(f.tx.execute).not.toHaveBeenCalled(); expect(f.values).not.toHaveBeenCalled();
  });
});
