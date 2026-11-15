import type { Metadata } from 'next';
import Link from 'next/link';
import { AppCollage } from '@/components/site/AppCollage';
import { CtaBand, Points } from '@/components/site/Blocks';
import { CourseCard } from '@/components/site/CourseCard';
import { Orbit } from '@/components/site/Orbit';
import { SiteFrame } from '@/components/site/SiteFrame';
import { BrokerHome } from '@/components/site/broker/BrokerHome';
import { getBroker, getCourses, getSiteName, rupees } from '@/lib/site-data';

// Rendered per request (course data is cached for 5 minutes), so a deploy never ships an empty course list.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteName();
  return { title: `${name}: trading courses with a practice account`, description: 'Live online courses on stock markets, MCX commodities, technical analysis and risk, with a paper-trading account to practise every lesson.', robots: { index: true, follow: true } };
}

/** Public website home (separate from the trading portal, which starts at /login). */
export default async function Home() {
  const [courses, { name }, broker] = await Promise.all([getCourses().then((c) => c ?? []), getSiteName(), getBroker()]);
  // Broker website only once it is switched to live (after SEBI registration).
  if (broker?.mode === 'live') return <BrokerHome b={broker} name={name} />;
  const from = courses.length ? courses.reduce((m, c) => Math.min(m, Number(c.fee)), Infinity) : null;
  return (
    <SiteFrame>
      <section className="ws-hero2">
        <div className="ws-wrap">
          <AppCollage />
          <h1>Learn trading. Practise without risk.</h1>
          <p className="ws-hero2-sub">Live courses on stocks, MCX commodities, charts and F&amp;O, with a paper-trading app to practise every lesson.</p>
          <div className="ws-hero-cta ws-center-cta"><Link href="/open-account" className="ws-btn ws-btn-main">Sign up for free</Link><Link href="/courses" className="ws-btn ws-btn-line">Explore courses</Link></div>
        </div>
      </section>

      <section className="ws-sec">
        <div className="ws-wrap ws-trust">
          <div>
            <h2>Learn with confidence</h2>
            <Points items={[
              ['Practice before money', 'Every student gets a paper-trading account with virtual money, so mistakes cost nothing while you learn.'],
              ['No tips, no hype', 'We teach how markets and risk work. No stock tips, no promised returns, no pressure to trade.'],
              ['Everything in one place', 'Live classes, recordings, the practice app and weekly reviews with a mentor, under one login.'],
              ['Fees shown upfront', 'One fee per course, listed on the course page. Nothing to buy inside the course.'],
            ]} />
            <p className="ws-links"><Link href="/courses">See all courses</Link><Link href="/download">Get the practice app</Link></p>
          </div>
          <Orbit />
        </div>
      </section>

      <section className="ws-strip">
        <div className="ws-wrap ws-strip-in">
          <b>Practice app</b>
          <p>Watchlists, live MCX prices, orders, positions and carry forward, on web, Android and iPhone, with virtual money. <Link href="/download">Get the app</Link></p>
        </div>
      </section>

      <section className="ws-sec">
        <div className="ws-wrap ws-price">
          <div>
            <h2>Simple pricing</h2>
            <p>One fee per course and a free practice account while you learn. No hidden charges.</p>
            <Link href="/courses">See course fees</Link>
          </div>
          <dl className="ws-price-nums">
            <div><dt>₹0</dt><dd>Practice account with virtual money</dd></div>
            <div><dt>{from !== null && Number.isFinite(from) ? rupees(String(from)) : '—'}</dt><dd>Courses starting from</dd></div>
            <div><dt>{courses.length || '—'}</dt><dd>Courses from beginner to advanced</dd></div>
          </dl>
        </div>
      </section>

      {courses.length > 0 && (
        <section className="ws-sec ws-sec-alt">
          <div className="ws-wrap">
            <div className="ws-sec-head"><h2>Popular courses</h2><Link href="/courses" className="ws-more">All courses</Link></div>
            <div className="ws-course-grid">{courses.slice(0, 3).map((c) => <CourseCard key={c.slug} c={c} />)}</div>
          </div>
        </section>
      )}

      <CtaBand title={`Start learning with ${name}`} text={<>Open a free practice account, or talk to a mentor about a course. Questions first? See <Link href="/support">Support &amp; FAQ</Link>.</>} primary={{ href: '/open-account', label: 'Sign up for free' }} secondary={{ href: '/contact', label: 'Talk to a mentor' }} />
    </SiteFrame>
  );
}
