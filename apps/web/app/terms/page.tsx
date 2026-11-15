import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/site/LegalPage';
import { getSiteName } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteName();
  return { title: `Terms of use | ${name}`, robots: { index: true, follow: true } };
}

export default async function Terms() {
  const { name } = await getSiteName();
  return (
    <LegalPage title="Terms of use" updated="15 November 2026">
      <p>By using this website or the {name} practice app you agree to these terms.</p>
      <h2>Education only</h2>
      <p>Courses, classes and material are for learning. Nothing on this website, in class or in the app is investment advice or a recommendation to buy or sell any security, commodity or derivative. Decisions you make with real money are your own.</p>
      <h2>Practice account</h2>
      <ul>
        <li>The practice app uses virtual money. Orders are simulated and are never sent to an exchange.</li>
        <li>Practice results do not predict real trading results. Real trading carries a high risk of loss.</li>
        <li>Keep your log-in details private. You are responsible for activity on your account.</li>
        <li>Accounts may be suspended for misuse, such as attempts to break or overload the app.</li>
      </ul>
      <h2>Courses and fees</h2>
      <p>Course fees are listed on the <Link href="/pricing">Pricing</Link> page. Batch dates, the final fee and payment details are confirmed by a mentor before you pay. Course content and schedules may change; we will tell enrolled students about changes that affect them.</p>
      <h2>Content</h2>
      <p>Course material and class recordings are for your personal learning and may not be shared or resold.</p>
      <h2>Contact</h2>
      <p>Questions about these terms? Use the <Link href="/contact">Contact</Link> page.</p>
    </LegalPage>
  );
}
