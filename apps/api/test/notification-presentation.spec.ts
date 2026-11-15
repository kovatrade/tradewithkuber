import 'reflect-metadata';
import { notificationText, presentNotification } from '../src/notifications/presentation';
import { NotificationsService, pubsub } from '../src/notifications/notifications.service';

jest.mock('../src/config/env', () => ({ env: () => ({ FIREBASE_PUSH_ENABLED: false }) }));

describe('Notification amount privacy', () => {
  it.each([
    ['jarvis: ₹100000.00 (simulated)', 'jarvis: ₹••••'],
    ['Opening amount of ₹51,000.', 'Opening amount of ₹••••.'],
    ['₹1,000.00 has been credited (virtual).', '₹•••• has been credited.'],
    ['Paid INR 1,000 and Rs. 500.50', 'Paid INR •••• and Rs. ••••'],
    ['Loss ₹-1,000.00', 'Loss ₹••••'],
    ['BUY 5 MCX @ 45000.50', 'BUY 5 MCX @ ••••'],
    ['Loss alert: 80% of your funds', 'Loss alert: 80% of your funds'],
  ])('protects %s', (source, expected) => expect(notificationText(source)).toBe(expected));
  it('retains demo wording while still masking money', () => {
    expect(presentNotification({ title: 'Demo: Deposit approved', body: '₹50000 (virtual)' })).toEqual({ title: 'Demo: Deposit approved', body: '₹•••• (virtual)' });
  });
  it('is safe to apply again to already masked queued notifications', () => {
    const note = { id: 'note', title: 'Deposit approved', body: '₹50000 has been credited (virtual).' };
    expect(presentNotification(presentNotification(note))).toEqual(presentNotification(note));
  });
  it('stores and publishes only masked text', async () => {
    const values = jest.fn((row: any) => ({ returning: async () => [{ id: 'note', ...row }] }));
    const tx = { insert: () => ({ values }) };
    const publish = jest.spyOn(pubsub, 'publish').mockResolvedValue();
    const result = await new NotificationsService({} as any).notify(tx as any, 'user', 'payment.review', 'Deposit awaiting review', 'jarvis: ₹100000.00 (simulated)');
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ body: 'jarvis: ₹••••' }));
    await new Promise(resolve => setImmediate(resolve));
    expect(publish).toHaveBeenCalledWith(expect.any(String), { notificationAdded: result });
    publish.mockRestore();
  });
  it('masks preexisting inbox messages when they are read', async () => {
    const chain: any = { from: () => chain, where: () => chain, orderBy: () => chain, limit: async () => [{ id: 'old', title: 'Deposit approved', body: '₹50000 (virtual)' }] };
    const service = new NotificationsService({ db: { select: () => chain } } as any);
    expect(await service.list('user', 10)).toEqual([{ id: 'old', title: 'Deposit approved', body: '₹••••' }]);
  });
});
