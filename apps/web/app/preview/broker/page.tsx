import type { Metadata } from 'next';
import { AdminGate, PreviewBanner } from '@/components/site/broker/AdminGate';
import { BrokerHome } from '@/components/site/broker/BrokerHome';
import { getBroker, getSiteName } from '@/lib/site-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Broker website preview', robots: { index: false, follow: false } };

export default async function BrokerPreview() {
  const [b, { name }] = await Promise.all([getBroker(), getSiteName()]);
  if (!b) return <p style={{ padding: 40 }}>Settings could not be loaded. Refresh in a minute.</p>;
  return <AdminGate><BrokerHome b={b} name={name} base="/preview/broker" banner={<PreviewBanner mode={b.mode} />} /></AdminGate>;
}
