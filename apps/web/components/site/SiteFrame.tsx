import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/icons';
import { type Broker, getCourses, getSiteName } from '@/lib/site-data';
import { Regulatory } from './broker/Regulatory';
import { PortalLink } from './PortalLink';
import '@/app/site.css';

/**
 * Frame for the public course website (home, courses, about, contact). Kept apart from the trading portal: its own
 * header, footer and styles (all scoped under .ws); the portal is reached only through Log in.
 */
export async function SiteFrame({ children, broker, banner }: { children: ReactNode; broker?: Broker | null; banner?: ReactNode }) {
  const [{ name }, courses] = await Promise.all([getSiteName(), getCourses()]);
  return (
    <div className="ws">
      <a className="ws-skip" href="#main">Skip to content</a>
      {banner}
      <header className="ws-head">
        <div className="ws-wrap ws-head-in">
          <Link href="/" className="ws-brand" aria-label={`${name} home`}><Logo size={30} /><span>{name}</span></Link>
          <nav className="ws-nav" aria-label="Website">
            <Link href="/courses">Courses</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/about">About</Link>
            <Link href="/support">Support</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <div className="ws-head-cta">
            <PortalLink />
            <Link href="/open-account" className="ws-btn ws-btn-main ws-btn-sm">Sign up</Link>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="ws-foot">
        <div className="ws-wrap ws-foot-in">
          <div className="ws-foot-brand">
            <Link href="/" className="ws-brand"><Logo size={26} /><span>{name}</span></Link>
            <p>{broker ? 'Trading and investing, with a free practice account and courses to learn first.' : 'Trading education with live classes and a paper-trading practice account.'}</p>
          </div>
          <nav className="ws-foot-links" aria-label="Footer">
            <div><h2>Courses</h2>{(courses ?? []).slice(0, 6).map((c) => <Link key={c.slug} href={`/courses/${c.slug}`}>{c.title}</Link>)}<Link href="/courses">All courses</Link></div>
            <div><h2>Learn</h2><Link href="/pricing">Pricing</Link><Link href="/download">Practice app</Link><Link href="/contact">Talk to a mentor</Link></div>
            <div><h2>Company</h2><Link href="/about">About</Link><Link href="/support">Support &amp; FAQ</Link><Link href="/contact">Contact</Link></div>
            <div><h2>Account</h2><Link href="/open-account">Open an account</Link><Link href="/login">Log in</Link><Link href="/terms">Terms of use</Link><Link href="/privacy">Privacy policy</Link></div>
          </nav>
        </div>
        {broker && <Regulatory b={broker} name={name} />}
        <div className="ws-wrap ws-disclaimer">
          {broker ? <p>The practice account and courses are for learning; practice orders use virtual money and are not sent to an exchange.</p> : <p>{name} offers education and a paper-trading practice account that uses virtual money only. Nothing on this website is investment advice or a recommendation to buy or sell. Trading in shares, commodities and derivatives carries a high risk of loss; past results do not predict future returns. Course content is for learning purposes.</p>}
          <p>© {new Date().getFullYear()} {name}</p>
        </div>
      </footer>
    </div>
  );
}
