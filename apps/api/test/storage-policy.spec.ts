import 'reflect-metadata';
import { parse } from 'graphql';
import { PgDialect } from 'drizzle-orm/pg-core';
import { activityPlugin } from '../src/logging/activity.plugin';
import { ALWAYS_QUIET, LogMaintenanceService } from '../src/logging/log-maintenance.service';
import { requestContext } from '../src/common/request-context';

describe('minimal activity storage', () => {
  const run = async (query: string, errors?: unknown[]) => {
    const record = jest.fn();
    const plugin = activityPlugin(() => ({ record } as any), () => new Set(ALWAYS_QUIET)) as any;
    const handler = await plugin.requestDidStart({ request: {} });
    const document = parse(query);
    await handler.didResolveOperation({ document, operation: document.definitions[0] });
    await requestContext.run({ requestId: 'test', ip: '127.0.0.1', userAgent: 'test', client: 'web', startedAt: Date.now() }, () =>
      handler.willSendResponse({ response: { body: { kind: 'single', singleResult: { errors } } }, contextValue: {} }));
    return record;
  };
  it.each(ALWAYS_QUIET)('does not store successful background %s refreshes', async field => {
    expect(await run(`query { ${field} { id } }`)).not.toHaveBeenCalled();
  });
  it('keeps failed refreshes, account actions, security reads and mixed operations', async () => {
    expect(await run('query { orders { id } }', [{ extensions: { code: 'FORBIDDEN' } }])).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'ERROR' }));
    expect(await run('mutation { placeOrder { id } }')).toHaveBeenCalled();
    expect(await run('query { loginHistory { id } }')).toHaveBeenCalled();
    expect(await run('query { quotes { id } loginHistory { id } }')).toHaveBeenCalled();
    expect(await run('query { orders { id } accountSummary { balance } }')).not.toHaveBeenCalled();
  });
});

it('purges only completed push delivery jobs older than seven days, preserving the inbox', async () => {
  const execute = jest.fn().mockResolvedValue({ rows: [{ n: '3' }] });
  const db = { execute, delete: () => ({ where: () => ({ returning: async () => [] }) }) };
  const service = new LogMaintenanceService({ db } as any, { get: async (key: string) => key === 'logs.activityRetentionDays' ? 365 : true } as any, {} as any);
  const now = new Date('2026-11-18T12:00:00Z');
  expect((await service.purge(now)).pushJobs).toBe(3);
  const query = new PgDialect().sqlToQuery(execute.mock.calls[1][0]);
  expect(query.sql).toContain('DELETE FROM push_deliveries WHERE finished_at <');
  expect(query.sql).not.toContain('DELETE FROM notifications');
  expect(query.params).toEqual([new Date('2026-11-11T12:00:00Z')]);
});
