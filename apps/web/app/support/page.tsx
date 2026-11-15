import type { Metadata } from 'next';
import Link from 'next/link';
import { CtaBand, Faq, PageIntro } from '@/components/site/Blocks';
import { SiteFrame } from '@/components/site/SiteFrame';
import { ACCOUNT_FAQ } from '@/components/site/content';
import { getSiteName } from '@/lib/site-data';

// Rendered per request (site name comes from configuration).
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteName();
  return { title: `Support & FAQ | ${name}`, description: 'Answers about courses, classes, the practice app, fees and your account.', robots: { index: true, follow: true } };
}

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: 'Courses and classes', items: [
    ['Do I need trading experience?', 'No. Stock Market Foundations starts from zero. Each course page shows its level; if you are unsure, leave your number on the Contact page and a mentor will help you choose.'],
    ['How are classes held?', 'Live online, with recordings you can watch again and weekly review sessions. Each course page shows its format and duration.'],
    ['What language are classes in?', 'Ask us about the batch you are interested in when we call you; we will tell you the language and timings of upcoming batches.'],
    ['Will a course make me profitable?', 'Nobody can promise that. The courses teach how markets work and how to manage risk; trading always carries a risk of loss.'],
  ] },
  { title: 'Practice account', items: [...ACCOUNT_FAQ, ['I forgot my password', 'Use “Forgot password?” on the log-in page, or ask your mentor to reset your account.']] },
  { title: 'Fees and enrolment', items: [
    ['How much does a course cost?', 'Every course has one fee, shown on the Pricing page and on the course page. The practice account is free while you learn.'],
    ['How do I enrol?', 'Leave your number on a course page or the Contact page. A mentor calls you, confirms the batch and shares the payment details.'],
  ] },
];

export default async function Support() {
  return (
    <SiteFrame>
      <PageIntro title="Support & FAQ" narrow>Answers to the questions students ask most. Can’t find yours? <Link href="/contact">Talk to a mentor</Link>.</PageIntro>
      <section className="ws-sec ws-sec-tight">
        <div className="ws-wrap ws-narrow">
          {GROUPS.map((g) => (
            <div key={g.title} className="ws-faq-group">
              <h2>{g.title}</h2>
              <Faq items={g.items} />
            </div>
          ))}
        </div>
      </section>
      <CtaBand title="Still have a question?" text="Leave your number and a mentor will call you back, usually within one working day." primary={{ href: '/contact', label: 'Talk to a mentor' }} secondary={{ href: '/open-account', label: 'Open an account' }} />
    </SiteFrame>
  );
}
