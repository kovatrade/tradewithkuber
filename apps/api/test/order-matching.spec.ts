import 'reflect-metadata';
import { OrdersService } from '../src/trading/orders.service';
import { SimulatedVenue } from '../src/trading/execution-venue';
import { CONFIG_REGISTRY } from '../src/config-mgmt/registry';

const settings = { MARKET_FEED: 'simulated', MARKET_HOURS: 'always_open' };
jest.mock('../src/config/env', () => ({ env: () => settings }));

describe('resting orders follow the configured market timing policy', () => {
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-11-17T18:00:00+05:30')); });
  afterEach(() => jest.useRealTimers());

  function fixture(type: 'LIMIT' | 'STOP_LOSS', hours: string, enforce = true, time?: string) {
    settings.MARKET_HOURS = hours;
    if (time) jest.setSystemTime(new Date(time));
    const order = { id: 'order', userId: 'trader', instrumentId: 'instrument', status: 'OPEN', type,
      side: type === 'LIMIT' ? 'BUY' : 'SELL', limitPriceMinor: 630000n, triggerPriceMinor: 245000n };
    const quote = { instrumentId: 'instrument', ltpMinor: type === 'LIMIT' ? 629000n : 244000n, askMinor: 629100n, bidMinor: 628900n };
    const tx = { select: () => ({ from: () => ({ where: () => ({ for: async () => [order] }) }) }) };
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [order] }) }) }) };
    const config = { get: async (key: keyof typeof CONFIG_REGISTRY) => key === 'trading.enforceMarketHours' ? enforce : CONFIG_REGISTRY[key].default };
    const audit = { record: jest.fn() };
    const service = new OrdersService({ db, serializable: (fn: any) => fn(tx) } as any,
      { cashAccount: async () => 'cash', lock: async () => {} } as any, config as any,
      { quote: () => quote, instrument: () => ({ exchange: 'NSE' }) } as any,
      new SimulatedVenue(), audit as any, {} as any, {} as any, {} as any);
    const fill = jest.spyOn(service as any, 'fill').mockResolvedValue(null);
    return { service, fill, quote };
  }

  it.each(['LIMIT', 'STOP_LOSS'] as const)('fills %s after exchange hours when always-open mode is selected', async type => {
    const f = fixture(type, 'always_open');
    expect((await f.service.sessions()).list.find(s => s.exchange === 'NSE')?.isOpen).toBe(false);
    await (f.service as any).matchOpenLimits([f.quote]);
    expect(f.fill).toHaveBeenCalledTimes(1);
  });
  it.each(['LIMIT', 'STOP_LOSS'] as const)('fills %s after exchange hours when the administrator disables timing enforcement', async type => {
    const f = fixture(type, 'config', false);
    await (f.service as any).matchOpenLimits([f.quote]);
    expect(f.fill).toHaveBeenCalledTimes(1);
  });
  it.each(['LIMIT', 'STOP_LOSS'] as const)('keeps %s open when exchange timing is enforced and the exchange is closed', async type => {
    const f = fixture(type, 'config');
    await (f.service as any).matchOpenLimits([f.quote]);
    expect(f.fill).not.toHaveBeenCalled();
  });
  it.each(['LIMIT', 'STOP_LOSS'] as const)('fills %s during an enforced exchange session', async type => {
    const f = fixture(type, 'config', true, '2026-11-17T12:00:00+05:30');
    await (f.service as any).matchOpenLimits([f.quote]);
    expect(f.fill).toHaveBeenCalledTimes(1);
  });
});
