import type { Metadata } from 'next';
import { EnquiryForm } from '@/components/site/EnquiryForm';
import { PageIntro } from '@/components/site/Blocks';
import { SiteFrame } from '@/components/site/SiteFrame';
import { getCourses, getSiteName } from '@/lib/site-data';

// Rendered per request (course data is cached for 5 minutes), so a deploy never ships an empty course list.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteName();
  return { title: `Contact | ${name}`, description: 'Ask about a course or the next batch. Leave your number and a mentor will call you back.', robots: { index: true, follow: true } };
}

export default async function Contact() {
  const [courses, { helplineUrl }] = await Promise.all([getCourses(), getSiteName()]);
  return (
    <SiteFrame>
      <PageIntro title="Talk to a mentor" narrow>Tell us a little about yourself and we’ll call you back, usually within one working day.</PageIntro>
      <section className="ws-sec ws-sec-tight">
        <div className="ws-wrap ws-narrow ws-contact">
          <EnquiryForm courses={courses ?? []} />
          {helplineUrl && (
            <aside className="ws-side-card">
              <h2>Prefer chat?</h2>
              <p>Message our helpline and we’ll reply during working hours.</p>
              <a className="ws-btn ws-btn-line" href={helplineUrl} target="_blank" rel="noopener noreferrer">Open chat</a>
            </aside>
          )}
        </div>
      </section>
    </SiteFrame>
  );
}
