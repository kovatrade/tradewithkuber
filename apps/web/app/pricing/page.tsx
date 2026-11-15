import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/site/Blocks';
import { SiteFrame } from '@/components/site/SiteFrame';
import { fee, getBroker, getCourses, getSiteName, rupees } from '@/lib/site-data';

// Rendered per request (course data is cached for 5 minutes).
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteName();
  return { title: `Pricing | ${name}`, description: 'Course fees, duration and what every course includes. The practice account is free while you learn.', robots: { index: true, follow: true } };
}

export default async function Pricing() {
  const [courses, broker] = await Promise.all([getCourses(), getBroker()]);
  const live = broker?.mode === 'live';
  return (
    <SiteFrame>
      <PageIntro title="Pricing">One fee per course. The practice account, class recordings and weekly reviews are included.</PageIntro>
      <section className="ws-sec ws-sec-tight">
        <div className="ws-wrap">
          {live && broker && (
            <div className="ws-brokerage">
              <h2>Account and brokerage charges</h2>
              <dl className="ws-price-nums">
                <div><dt>{fee(broker.brokerage.accountOpening)}</dt><dd>Account opening</dd></div>
                <div><dt>{fee(broker.brokerage.delivery)}</dt><dd>Equity delivery</dd></div>
                <div><dt>{fee(broker.brokerage.intraday)}</dt><dd>Intraday, per order</dd></div>
                <div><dt>{fee(broker.brokerage.fo)}</dt><dd>F&amp;O, per order</dd></div>
              </dl>
              <p className="ws-fine">Statutory charges (STT, exchange and SEBI fees, stamp duty, GST) are extra, as set by the government and exchanges.</p>
              <h2>Course fees</h2>
            </div>
          )}
          <div className="ws-price-free">
            <p className="ws-price-big">₹0</p>
            <div><h2>Practice account</h2><p>Paper trading with virtual money on web, Android and iPhone, free for every student while you learn.</p></div>
          </div>
          {courses === null ? <p className="ws-empty">Fees could not be loaded right now. Please refresh in a minute.</p> : courses.length === 0 ? <p className="ws-empty">New batches are being planned. <Link href="/contact">Leave your number</Link>.</p> : (
            <div className="ws-table-wrap">
              <table className="ws-table">
                <caption className="ws-sr">Course fees</caption>
                <thead><tr><th scope="col">Course</th><th scope="col">Level</th><th scope="col">Duration</th><th scope="col">Modules</th><th scope="col" className="ws-num">Fee</th></tr></thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.slug}>
                      <th scope="row"><Link href={`/courses/${c.slug}`}>{c.title}</Link></th>
                      <td data-label="Level">{c.level}</td><td data-label="Duration">{c.duration}</td><td data-label="Modules">{c.modules.length}</td><td className="ws-num">{rupees(c.fee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="ws-incl">
            <h2>Every course includes</h2>
            <ul>
              <li>Live online classes with a mentor</li>
              <li>Recordings of every class</li>
              <li>The practice app with virtual money</li>
              <li>Weekly reviews of your practice trades</li>
            </ul>
            <p>Fees are confirmed when a mentor calls you, together with batch dates and payment details. <Link href="/contact">Ask for a call back</Link>.</p>
          </div>
        </div>
      </section>
    </SiteFrame>
  );
}
