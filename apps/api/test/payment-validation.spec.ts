import 'reflect-metadata';
import { validPaymentReference } from '../src/common/payment-reference';
import { PaymentEvidenceService } from '../src/payments/payment-evidence.service';
import { UsersService } from '../src/users/users.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaymentEvidenceInput } from '../src/payments/payment-evidence.types';
import { PaymentsService } from '../src/payments/payments.service';
import { accountText } from '../src/common/account-text';

describe('Payment evidence requirements', () => {
  it.each(['123456789012', 'HDFC123456789012', 'HDFCR52026111612345678', '  hdfc123456789012  '])('accepts supported reference %s', utr => {
    expect(validPaymentReference(utr)).toBe(true);
  });
  it.each(['', '000000000000', '213434242354354353234234', '1234567890123456', '1234567890123456789012', 'ABC-12345678', 'ABCDEFABCDEFABCD'])('rejects malformed reference %s', utr => {
    expect(validPaymentReference(utr)).toBe(false);
  });
  const input = { payeeAccountId: '4b9d6fbe-a349-48ee-8f11-92815fc05277', utr: '123456789012', payerName: 'Test Payer', paidAt: new Date(Date.now() - 60_000).toISOString(), proof: '' };
  const actor: any = { userId: 'broker', role: 'BROKER' };
  it('rejects a missing screenshot at GraphQL validation', async () => {
    const errors = await validate(plainToInstance(PaymentEvidenceInput, input));
    expect(errors.some(e => e.property === 'proof')).toBe(true);
  });
  it.each([undefined, '', ' ', 'data:image/png;base64,bm90LWFuLWltYWdl'])('rejects absent or invalid image before reading or writing the database', async proof => {
    const tx = { select: jest.fn(), insert: jest.fn() };
    const service = new PaymentEvidenceService({} as any, {} as any, {} as any);
    await expect(service.record(tx as any, actor, 'trader', 5000000n, { ...input, proof } as any)).rejects.toThrow(/screenshot|image|JPG|PNG/i);
    expect(tx.select).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
  it.each(['BROKER', 'SUPER_ADMIN'])('requires phone when %s creates a trader', async role => {
    const service = new UsersService(...Array(10).fill({}) as [any, any, any, any, any, any, any, any, any, any]);
    await expect(service.create({ ...actor, role }, { username: 'new.trader', displayName: 'Trader', role: 'TRADER', tempPassword: 'Strong!Pass123' }, '127.0.0.1')).rejects.toThrow(/Mobile number is required/);
  });
  it('requires opening payment evidence even for an admin-created trader', async () => {
    const service = new UsersService(...Array(10).fill({}) as [any, any, any, any, any, any, any, any, any, any]);
    await expect(service.create({ ...actor, role: 'SUPER_ADMIN' }, { username: 'new.trader', displayName: 'Trader', phone: '9876543210', role: 'TRADER', tempPassword: 'Strong!Pass123', openingAmountMinor: 5000000n }, '127.0.0.1')).rejects.toThrow(/payment details and screenshot/);
  });
  it('prevents admins bypassing evidence on regular-account deposits', async () => {
    const rows = [[], [{ id: 'trader', role: 'TRADER', status: 'ACTIVE', isDemo: false }]];
    const chain: any = { from: () => chain, where: async () => rows.shift() };
    const tx = { select: () => chain, insert: jest.fn() };
    const service = new PaymentsService({ serializable: (fn: any) => fn(tx) } as any, {} as any, { get: async () => 5000000n } as any, {} as any, { assertCanAccessUser: async () => {} } as any, {} as any, {} as any, {} as any);
    await expect(service.request({ ...actor, role: 'SUPER_ADMIN' }, { userId: 'trader', type: 'DEPOSIT', amountMinor: 5000000n, idempotencyKey: 'new-payment-123' }, '127.0.0.1')).rejects.toThrow(/payment screenshot/);
    expect(tx.insert).not.toHaveBeenCalled();
  });
  it('removes legacy mode labels only for regular ledger and statement descriptions', () => {
    expect(accountText('Deposit (virtual funds — no cash value)')).toBe('Deposit');
    expect(accountText('Simulated P&L BUY 5')).toBe('P&L BUY 5');
    expect(accountText('Deposit (virtual funds — no cash value)', true)).toContain('virtual');
  });
});
