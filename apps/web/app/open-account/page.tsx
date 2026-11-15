import type { Metadata } from 'next';
import Link from 'next/link';
import { AppCollage } from '@/components/site/AppCollage';
import { Art, CtaBand, Faq, FeatureGrid, Marks, Note, PageIntro, Points, Split, StepRows } from '@/components/site/Blocks';
import { SignupBox } from '@/components/site/SignupBox';
import { ACCOUNT_FAQ } from '@/components/site/content';
import { SiteFrame } from '@/components/site/SiteFrame';
import { BrokerOpenAccount } from '@/components/site/broker/BrokerOpenAccount';
import { getBroker, getSiteName } from '@/lib/site-data';

// Rendered per request (site name comes from configuration).
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteName();
  return { title: `Open a free practice account | ${name}`, description: 'Sign up with your mobile number for a free paper-trading account with practice funds.', robots: { index: true, follow: true } };
}

export default async function OpenAccount() {
  const [{ name }, broker] = await Promise.all([getSiteName(), getBroker()]);
  if (broker?.mode === 'live') return <BrokerOpenAccount b={broker} name={name} />;
  return (
    <SiteFrame>
      <PageIntro title="Open a free practice account" center>Practise trading with practice funds on web, Android and iPhone, and learn with live courses when you’re ready.</PageIntro>

      <section className="ws-sec ws-sec-flush">
        <div className="ws-wrap ws-open">
          <div className="ws-open-art"><AppCollage compact /></div>
          <SignupBox more={<>Want a guided start? <Link href="/contact">Talk to a mentor</Link></>} />
        </div>
      </section>

      <Note title="Already have a practice account?"><Link href="/login">Log in</Link>, or <Link href="/download">get the app</Link> for Android and iPhone.</Note>

      <section className="ws-sec">
        <div className="ws-wrap">
          <h2 className="ws-h-center">What you can practise</h2>
          <FeatureGrid items={[
            { title: 'MCX commodities', text: 'Gold, Silver, Crude Oil, Natural Gas and base metals, in mini and mega lots.', mark: Marks.commodity },
            { title: 'Orders and positions', text: 'Market, limit and stop-loss orders, live and booked P&L.', mark: Marks.stocks },
            { title: 'Margins and carry forward', text: 'See margin per lot and what carrying a position overnight needs.', mark: Marks.fo },
            { title: 'Charts', text: 'Read candlestick charts and test the setups you learn in class.', mark: Marks.charts },
          ]} />
          <div className="ws-center-cta"><Link href="/courses" className="ws-btn ws-btn-line">Explore courses</Link></div>
        </div>
      </section>

      <section className="ws-sec ws-sec-alt">
        <div className="ws-wrap">
          <Split title="Steps to open your account" art={Art.steps}>
            <StepRows items={['Verify your mobile number', 'Choose your name, username and password', 'Start practising once approved']} />
          </Split>
        </div>
      </section>

      <section className="ws-sec">
        <div className="ws-wrap">
          <Split title={`Why practise with ${name}`} art={Art.benefits} titleBelowArt>
            <Points items={[
            ['No real money at risk', 'Every order uses practice funds, so mistakes teach you without costing you.'],
            ['Live prices, real rules', 'MCX timings, lot sizes, margins and auto cut at market close work as they do in real trading.'],
            ['No spam or gimmicks', 'No stock tips and no push to trade more. The app is for practice and learning.'],
            ['Learn alongside', 'Join a course when you want structure, and review your practice trades with a mentor.'],
          ]} />
          </Split>
        </div>
      </section>

      <section className="ws-sec ws-sec-alt">
        <div className="ws-wrap ws-faq-wrap">
          <h2>FAQs</h2>
          <Faq items={ACCOUNT_FAQ} />
        </div>
      </section>

      <CtaBand title={`Start practising with ${name}`} text="A free practice account, live prices and practice funds." primary={{ href: '/open-account', label: 'Sign up for free' }} secondary={{ href: '/courses', label: 'Explore courses' }} />
    </SiteFrame>
  );
}
