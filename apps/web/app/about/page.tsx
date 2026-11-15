import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/site/Blocks';
import { SiteFrame } from '@/components/site/SiteFrame';
import { getSiteName } from '@/lib/site-data';

// Rendered per request (course data is cached for 5 minutes), so a deploy never ships an empty course list.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteName();
  return { title: `About | ${name}`, description: `How ${name} teaches trading: live classes, a paper-trading practice account and mentor reviews.`, robots: { index: true, follow: true } };
}

export default async function About() {
  const { name } = await getSiteName();
  return (
    <SiteFrame>
      <PageIntro title={`About ${name}`} narrow>We teach trading the way it is practised: a little theory, a lot of doing, and an honest look at every trade afterwards.</PageIntro>
      <section className="ws-sec ws-sec-tight">
        <div className="ws-wrap ws-narrow ws-prose">
          <h2>Why a practice account comes first</h2>
          <p>Most beginners lose money while they are still learning what an order type or a margin call is. Our students make those mistakes on a paper-trading account with practice funds, where a mistake costs nothing but teaches the same lesson.</p>
          <h2>What we believe</h2>
          <ul>
            <li>Risk comes before returns. Every course covers position sizing and stop-losses.</li>
            <li>Plain language. If a term needs a glossary, we explain it in class.</li>
            <li>No promises of profit. Markets are uncertain, and we say so.</li>
          </ul>
          <h2>Talk to us</h2>
          <p>Questions about a course, a batch time or the practice app? <Link href="/contact">Leave your number</Link> and we’ll call you back.</p>
        </div>
      </section>
    </SiteFrame>
  );
}
