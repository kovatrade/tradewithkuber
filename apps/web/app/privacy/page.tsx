import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/site/LegalPage';
import { getSiteName } from '@/lib/site-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteName();
  return { title: `Privacy policy | ${name}`, robots: { index: true, follow: true } };
}

export default async function Privacy() {
  const { name } = await getSiteName();
  return (
    <LegalPage title="Privacy policy" updated="15 November 2026">
      <p>This policy explains what {name} collects through this website and the practice app, why, and how it is protected.</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Call-back requests:</b> your name, mobile number, optional email, the course you chose and any message you write.</li>
        <li><b>Practice accounts:</b> your username, contact details given at sign-up, and your practice orders and positions (virtual money only).</li>
        <li><b>Security records:</b> sign-in times, device and IP address, used to protect accounts and investigate misuse.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To call you back about courses and batches you asked about.</li>
        <li>To run your practice account and show your history.</li>
        <li>To keep accounts secure and meet legal obligations.</li>
      </ul>
      <p>We do not sell your details or share them for advertising.</p>
      <h2>How it is protected</h2>
      <p>Mobile numbers and email addresses are stored encrypted. Access is limited to staff who need it, and staff actions are logged.</p>
      <h2>Your choices</h2>
      <p>You can ask us to stop contacting you, or to correct or delete your call-back request, through the <Link href="/contact">Contact</Link> page. Practice account holders can request an account reset from the app’s Settings.</p>
      <h2>Changes</h2>
      <p>If this policy changes, the new version is posted on this page with a new date.</p>
    </LegalPage>
  );
}
