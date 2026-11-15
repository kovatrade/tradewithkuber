import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppCollage } from '../AppCollage';
import { Art, CtaBand, Faq, FeatureGrid, Marks, Note, PageIntro, Points, Split, StepRows } from '../Blocks';
import { SignupBox } from '../SignupBox';
import { SiteFrame } from '../SiteFrame';
import { type Broker, fee } from '@/lib/site-data';
import { ACCOUNT_TYPES, BROKER_FAQ, OFFERINGS } from './content';

/** Broker account-opening page (preview, or live after registration). */
export function BrokerOpenAccount({ b, name, banner, preview }: { b: Broker; name: string; banner?: ReactNode; preview?: boolean }) {
  const demat = !!b.dpRegNo.trim();
  return (
    <SiteFrame broker={b} banner={banner}>
      <PageIntro title={`Open a free ${demat ? 'demat and ' : ''}trading account online`} center>
        Account opening {fee(b.brokerage.accountOpening) === '₹0' ? 'is free' : `costs ${fee(b.brokerage.accountOpening)}`}. Equity delivery {fee(b.brokerage.delivery)}, intraday and F&amp;O {fee(b.brokerage.intraday)} per order.
      </PageIntro>

      <section className="ws-sec ws-sec-flush">
        <div className="ws-wrap ws-open">
          <div className="ws-open-art"><AppCollage compact /></div>
          {preview ? <div className="ws-signup"><h2>Sign up now</h2><p className="ws-signup-sub">Disabled in preview. Sign-up opens when the site goes live.</p><button className="ws-btn ws-btn-main" disabled>Get OTP</button></div> : <SignupBox more={b.accountTypes.includes('NRI') ? <>Looking to open an NRI account? <Link href="/contact">Talk to us</Link></> : <>Need help? <Link href="/contact">Talk to us</Link></>} />}
        </div>
      </section>

      <Note title="Already have an account?"><Link href="/login">Log in</Link> to trade, or <Link href="/download">get the app</Link> for Android and iPhone.</Note>

      <section className="ws-sec">
        <div className="ws-wrap">
          <h2 className="ws-h-center">Investment options with {name}</h2>
          <FeatureGrid items={b.offerings.map((o) => ({ title: OFFERINGS[o].title, text: OFFERINGS[o].text, mark: Marks[OFFERINGS[o].mark] }))} />
          <div className="ws-center-cta"><Link href="/pricing" className="ws-btn ws-btn-line">See charges</Link></div>
        </div>
      </section>

      <section className="ws-sec ws-sec-alt">
        <div className="ws-wrap">
          <Split title={`Steps to open an account with ${name}`} art={Art.steps}>
            <StepRows items={['Enter the requested details', 'Complete e-sign and verification', 'Start trading']} />
          </Split>
        </div>
      </section>

      <section className="ws-sec">
        <div className="ws-wrap">
          <Split title={`Benefits of an account with ${name}`} art={Art.benefits} titleBelowArt>
            <Points items={[
            ['Clear pricing', `${fee(b.brokerage.delivery)} equity delivery, ${fee(b.brokerage.intraday)} intraday and F&O per order. Other charges are listed on the Pricing page.`],
            ['Simple apps', 'Watchlists, orders and positions on web, Android and iPhone.'],
            ['No spam or gimmicks', 'No tips, no pressure to trade, no gamified notifications.'],
            ['Learn as you go', 'A free practice account and courses on markets and risk.'],
          ]} />
          </Split>
        </div>
      </section>

      {b.accountTypes.length > 0 && (
        <section className="ws-sec ws-sec-alt">
          <div className="ws-wrap">
            <h2 className="ws-h-center">Explore account types</h2>
            <div className="ws-types">{b.accountTypes.map((t) => <div key={t} className="ws-type"><span className="ws-type-ic" aria-hidden="true">{ACCOUNT_TYPES[t][0].slice(0, 1)}</span><div><h3>{ACCOUNT_TYPES[t][0]}</h3><p>{ACCOUNT_TYPES[t][1]}</p></div></div>)}</div>
          </div>
        </section>
      )}

      <section className="ws-sec">
        <div className="ws-wrap ws-faq-wrap">
          <h2>FAQs</h2>
          <Faq items={BROKER_FAQ} />
        </div>
      </section>

      <CtaBand title={`Open an account with ${name}`} text={`Online account opening, ${fee(b.brokerage.delivery)} equity delivery and ${fee(b.brokerage.intraday)} intraday and F&O orders.`} primary={{ href: '#main', label: 'Sign up for free' }} />
    </SiteFrame>
  );
}
