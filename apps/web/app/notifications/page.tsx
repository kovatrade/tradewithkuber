'use client';
import { Icon } from '@/components/icons';
import { Empty, ErrorState, PageHead, SkeletonRows } from '@/components/ui';
import { gql, subscribe } from '@/lib/api';
import { when } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { BROWSER_PUSH_ERROR_EVENT, browserPushSetupMessage, registerBrowserPush, sendBrowserTestNotification, canUseSystemPush } from '@/lib/push';

interface N { id: string; kind: string; title: string; body: string; readAt?: string; createdAt: string }
const ico = (k: string) => (k.startsWith('security') ? 'shield' : k.startsWith('payment') ? 'wallet' : k.startsWith('order') ? 'list' : 'bell') as 'bell';

export default function Notifications() {
  const { me } = useAuth();
  const systemPush = canUseSystemPush(me?.role, me?.isDemo);
  const [pushStatus, setPushStatus] = useState('');
  const [testingPush, setTestingPush] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const { data, loading, error, refetch } = useQuery<{ notifications: N[] }>(`{ notifications(limit:100){ id kind title body readAt createdAt } }`);
  const unread = data?.notifications.filter((n) => !n.readAt).length ?? 0;
  useEffect(() => {
    const setupError = browserPushSetupMessage();
    if (setupError) setPushStatus(setupError);
    const registrationError = (event: Event) => setPushStatus((event as CustomEvent<string>).detail);
    window.addEventListener(BROWSER_PUSH_ERROR_EVENT, registrationError);
    return () => window.removeEventListener(BROWSER_PUSH_ERROR_EVENT, registrationError);
  }, []);
  useEffect(() => subscribe('subscription { notificationAdded { id } }', {}, () => { void refetch(); }), [refetch]);
  useEffect(() => { const refresh = () => { void refetch(); }; window.addEventListener('focus', refresh); window.addEventListener('td:notification', refresh); return () => { window.removeEventListener('focus', refresh); window.removeEventListener('td:notification', refresh); }; }, [refetch]);
  return (
    <div style={{ maxWidth: 760 }}>
      <PageHead title="Notifications" sub={unread ? `${unread} unread` : undefined}>
        {unread > 0 && <button className="btn btn-sm" onClick={async () => { await gql(`mutation { markNotificationsRead }`).catch(() => undefined); void refetch(); }}><Icon name="check" size={16} />Mark all as read</button>}
      </PageHead>
      {systemPush && <div className="stack" style={{ marginBottom: 16 }}>
        <button className="btn" disabled={enablingPush || testingPush} onClick={async () => {
          setEnablingPush(true); setPushStatus('Enabling browser notifications…');
          try { await registerBrowserPush(true); setPushStatus('Browser notifications enabled for this sign-in.'); }
          catch (e) { setPushStatus((e as Error).message); }
          finally { setEnablingPush(false); }
        }}>{enablingPush ? 'Enabling…' : 'Enable browser notifications'}</button>
        <button className="btn" disabled={testingPush || enablingPush} onClick={async () => {
          setTestingPush(true);
          setPushStatus('Registering browser and sending test notification…');
          try { await sendBrowserTestNotification(); setPushStatus('Test notification queued.'); void refetch(); }
          catch (e) { setPushStatus((e as Error).message); }
          finally { setTestingPush(false); }
        }}>{testingPush ? 'Sending…' : 'Send test notification'}</button>
        {pushStatus && <p role="status" className="t2">{pushStatus}</p>}
      </div>}
      {loading && !data ? <SkeletonRows /> : error && !data ? <ErrorState error={error} retry={refetch} /> : !data!.notifications.length ? <Empty icon="bell" title="You’re all caught up">Order fills, fund requests and security alerts appear here.</Empty> : (
        <div className="list">{data!.notifications.map((n) => (
          <div key={n.id} className="list-row" style={{ alignItems: 'flex-start' }}>
            <span className="mark" style={n.readAt ? undefined : { background: 'var(--brand-soft)', color: 'var(--brand)' }}><Icon name={ico(n.kind)} size={18} /></span>
            <div className="grow"><div className="spread"><span className={n.readAt ? 'w5' : 'w6'}>{n.title}</span><span className="t3 num">{when(n.createdAt)}</span></div><div className="t2 sm">{n.body}</div></div>
            {!n.readAt && <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--brand)', marginTop: 8 }} />}
          </div>
        ))}</div>
      )}
    </div>
  );
}
