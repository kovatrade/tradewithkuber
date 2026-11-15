import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Shared sections of the public website. Each repeated block lives here once, so every page that shows it
 * looks and behaves the same.
 */

/** Page title and intro under the header. `center` for landing pages. */
export function PageIntro({ title, children, center, narrow, crumb }: { title: string; children?: ReactNode; center?: boolean; narrow?: boolean; crumb?: { href: string; label: string } }) {
  return (
    <section className={`ws-page-head${center ? ' ws-center' : ''}`}>
      <div className={`ws-wrap${narrow ? ' ws-narrow' : ''}`}>
        {crumb && <p className="ws-crumb"><Link href={crumb.href}>{crumb.label}</Link></p>}
        <h1>{title}</h1>
        {children && <div className="ws-lede">{children}</div>}
      </div>
    </section>
  );
}

/** A real sequence (numbered). */
export function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className="ws-steps">
      {items.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}
    </ol>
  );
}

/** Short titled points (benefits, beliefs). */
export function Points({ items }: { items: [string, string][] }) {
  return (
    <div className="ws-points">
      {items.map(([t, d]) => <div key={t}><h3>{t}</h3><p>{d}</p></div>)}
    </div>
  );
}

/** Question-and-answer list (expand to read). */
export function Faq({ items }: { items: [string, string][] }) {
  return <div className="ws-faq">{items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>;
}

/** Grid of things with a small drawn mark, e.g. what you can practise. */
export function FeatureGrid({ items }: { items: { title: string; text: string; mark: ReactNode }[] }) {
  return (
    <div className="ws-features">
      {items.map((f) => <div key={f.title} className="ws-feature"><span className="ws-feature-mark" aria-hidden="true">{f.mark}</span><div><h3>{f.title}</h3><p>{f.text}</p></div></div>)}
    </div>
  );
}

/** Closing call to action at the end of a page. */
export function CtaBand({ title, text, primary, secondary }: { title: string; text: ReactNode; primary: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return (
    <section className="ws-sec">
      <div className="ws-wrap ws-cta2">
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="ws-hero-cta">
          <Link href={primary.href} className="ws-btn ws-btn-main">{primary.label}</Link>
          {secondary && <Link href={secondary.href} className="ws-btn ws-btn-line">{secondary.label}</Link>}
        </div>
      </div>
    </section>
  );
}

/** Small line drawings used as feature marks (original, single colour). */
export const Marks = {
  stocks: <svg viewBox="0 0 40 40"><path d="M5 31h30M8 26l8-8 6 5 10-12" /><path d="M27 11h5v5" /></svg>,
  commodity: <svg viewBox="0 0 40 40"><path d="M9 28h22l-3-9H12zM14 19l2-6h8l2 6" /><path d="M6 32h28" /></svg>,
  fo: <svg viewBox="0 0 40 40"><rect x="7" y="9" width="11" height="22" rx="2" /><rect x="22" y="15" width="11" height="16" rx="2" /><path d="M12.5 5v4M27.5 11v4M12.5 31v4M27.5 31v4" /></svg>,
  charts: <svg viewBox="0 0 40 40"><path d="M10 8v24M18 12v16M26 6v26M34 14v12" /><rect x="7.5" y="14" width="5" height="10" rx="1" /><rect x="23.5" y="11" width="5" height="12" rx="1" /></svg>,
};

/** Split section like the classic broker pages: a drawing on one side, a titled list on the other. */
export function Split({ title, art, children, titleBelowArt }: { title: string; art: ReactNode; children: ReactNode; titleBelowArt?: boolean }) {
  return (
    <>
      {!titleBelowArt && <h2 className="ws-h-center">{title}</h2>}
      <div className="ws-split">
        <div className="ws-split-art">
          <div className="ws-split-pic" aria-hidden="true">{art}</div>
          {titleBelowArt && <h2>{title}</h2>}
        </div>
        <div className="ws-split-body">{children}</div>
      </div>
    </>
  );
}

/** Numbered steps as rows (01, 02, 03) with dividers. */
export function StepRows({ items }: { items: string[] }) {
  return (
    <ol className="ws-steprows">
      {items.map((t, i) => <li key={t}><span>{String(i + 1).padStart(2, '0')}</span>{t}</li>)}
    </ol>
  );
}

/** Centered note with a link, e.g. "Already have an account?". */
export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ws-sec ws-note">
      <div className="ws-wrap ws-narrow"><h2>{title}</h2><p>{children}</p></div>
    </section>
  );
}

/** Drawings for the split sections (original, brand colours). */
export const Art = {
  steps: (
    <svg viewBox="0 0 320 200">
      <ellipse cx="160" cy="110" rx="150" ry="80" fill="#eef5f2" />
      <rect x="40" y="40" width="150" height="100" rx="10" fill="#13283b" />
      <rect x="52" y="54" width="90" height="8" rx="4" fill="#2fd3a0" /><rect x="52" y="70" width="120" height="6" rx="3" fill="#4f6070" /><rect x="52" y="82" width="100" height="6" rx="3" fill="#4f6070" />
      <rect x="20" y="110" width="80" height="60" rx="8" fill="#f2c14e" /><path d="M34 150c10-14 18 8 28-6s14 6 22-2" stroke="#13283b" strokeWidth="2.5" fill="none" />
      <rect x="170" y="90" width="120" height="80" rx="10" fill="#fff" stroke="#d9e3df" />
      <circle cx="230" cy="122" r="16" fill="#08a77b" /><circle cx="230" cy="117" r="6" fill="#fff" /><path d="M219 132a11 9 0 0 1 22 0" fill="#fff" />
      <rect x="196" y="148" width="68" height="8" rx="4" fill="#d9e3df" />
      <circle cx="115" cy="118" r="14" fill="#cf4a3f" /><path d="M111 111l9 7-9 7z" fill="#fff" />
    </svg>
  ),
  benefits: (
    <svg viewBox="0 0 320 220">
      <circle cx="210" cy="100" r="90" fill="none" stroke="#d9e3df" strokeDasharray="4 6" /><circle cx="210" cy="100" r="60" fill="none" stroke="#d9e3df" strokeDasharray="4 6" />
      <rect x="60" y="120" width="70" height="90" rx="8" fill="#eef5f2" />
      <rect x="140" y="40" width="10" height="70" fill="#13283b" /><rect x="170" y="70" width="10" height="50" fill="#cf4a3f" /><rect x="200" y="50" width="10" height="40" fill="#13283b" />
      <path d="M80 200a40 40 0 0 1 40-40v40z" fill="#08a77b" />
      <text x="230" y="190" fontSize="34" fontFamily="sans-serif" fill="#f2a33a">%</text>
      <text x="215" y="108" fontSize="22" fontFamily="sans-serif" fill="#08a77b">₹</text>
      {[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={40 + c * 12} cy={60 + r * 12} r="2.5" fill="#cf4a3f" />))}
    </svg>
  ),
};
