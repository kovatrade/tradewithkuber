import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppCollage } from '../AppCollage';
import { CtaBand, Points } from '../Blocks';
import { SiteFrame } from '../SiteFrame';
import { type Broker, fee } from '@/lib/site-data';
import { OFFERINGS } from './content';

/** Broker home page (preview, or live after registration). Layout follows the classic broker landing page. */
export function BrokerHome({ b, name, banner, base = '' }: { b: Broker; name: string; banner?: ReactNode; base?: string }) {
  const what = b.offerings.map((o) => OFFERINGS[o]?.title.toLowerCase()).filter(Boolean);
  const list = what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what[what.length - 1]}` : what[0] ?? 'markets';
  return (
    <SiteFrame broker={b} banner={banner}>
      <section className="ws-hero2">
        <div className="ws-wrap">
          <AppCollage />
          <h1>Trade and invest with {name}</h1>
          <p className="ws-hero2-sub">An online platform for {list}, with a free practice account and courses to learn before you trade.</p>
          <div className="ws-hero-cta ws-center-cta"><Link href={`${base}/open-account`} className="ws-btn ws-btn-main">Sign up for free</Link></div>
        </div>
      </section>

      <section className="ws-sec">
        <div className="ws-wrap ws-trust">
          <div>
            <h2>Trade with confidence</h2>
            <Points items={[
              ['Transparent charges', 'Account opening, brokerage and other charges are listed upfront, before you sign up.'],
              ['No tips, no gimmicks', 'No stock tips, no pressure to trade more, no gamified notifications.'],
              ['Learn and practise first', 'A free practice account with virtual money, and courses on markets, commodities and risk.'],
              ['Your money stays yours', 'Funds and holdings are handled under exchange and depository rules, and you get transaction alerts from them directly.'],
            ]} />
            <p className="ws-links"><Link href={`${base}/open-account`}>Open an account</Link><Link href="/courses">Explore courses</Link></p>
          </div>
          <div className="ws-price ws-price-col">
            <dl className="ws-price-nums">
              <div><dt>{fee(b.brokerage.accountOpening)}</dt><dd>Account opening</dd></div>
              <div><dt>{fee(b.brokerage.delivery)}</dt><dd>Equity delivery brokerage</dd></div>
              <div><dt>{fee(b.brokerage.intraday)}</dt><dd>Intraday and F&amp;O, per order</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="ws-strip">
        <div className="ws-wrap ws-strip-in">
          <b>Practice app</b>
          <p>Try every order type with virtual money before you trade for real, on web, Android and iPhone. <Link href="/download">Get the app</Link></p>
        </div>
      </section>

      <section className="ws-sec">
        <div className="ws-wrap ws-learn">
          <div className="ws-learn-art" aria-hidden="true"><span>Learn</span></div>
          <div>
            <h2>Free practice, structured learning</h2>
            <p>Live courses on stock markets, MCX commodities, charts and risk, with a mentor to review your practice trades.</p>
            <p className="ws-links"><Link href="/courses">Courses</Link><Link href="/support">Support &amp; FAQ</Link></p>
          </div>
        </div>
      </section>

      <CtaBand title={`Open an account with ${name}`} text={`Online account opening, ${fee(b.brokerage.delivery)} equity delivery and ${fee(b.brokerage.intraday)} intraday and F&O orders.`} primary={{ href: `${base}/open-account`, label: 'Sign up for free' }} />
    </SiteFrame>
  );
}
