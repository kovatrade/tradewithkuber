import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EnquiryForm } from '@/components/site/EnquiryForm';
import { SiteFrame } from '@/components/site/SiteFrame';
import { getCourses, getSiteName, rupees } from '@/lib/site-data';

// Rendered per request (course data is cached for 5 minutes), so a deploy never ships an empty course list.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [courses, { name }] = await Promise.all([getCourses(), getSiteName()]);
  const c = courses?.find((x) => x.slug === slug);
  return c ? { title: `${c.title} | ${name}`, description: c.summary, robots: { index: true, follow: true } } : { title: `Course | ${name}` };
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;
  const courses = (await getCourses()) ?? [];
  const c = courses.find((x) => x.slug === slug);
  if (!c) notFound();
  return (
    <SiteFrame>
      <section className="ws-page-head ws-course-head">
        <div className="ws-wrap">
          <p className="ws-crumb"><Link href="/courses">Courses</Link></p>
          <h1>{c.title}</h1>
          <p className="ws-lede">{c.summary}</p>
          <dl className="ws-course-facts ws-course-facts-lg">
            <div><dt>Level</dt><dd>{c.level}</dd></div>
            <div><dt>Duration</dt><dd>{c.duration}</dd></div>
            <div><dt>Fee</dt><dd>{rupees(c.fee)}</dd></div>
            <div><dt>Format</dt><dd>{c.format}</dd></div>
          </dl>
        </div>
      </section>
      <section className="ws-sec ws-sec-tight">
        <div className="ws-wrap ws-detail">
          <div className="ws-detail-main">
            <h2>What you’ll be able to do</h2>
            <ul className="ws-outcomes">{c.outcomes.map((o) => <li key={o}>{o}</li>)}</ul>
            <h2>Modules</h2>
            <ol className="ws-modules">
              {c.modules.map((m) => (
                <li key={m.title}>
                  <h3>{m.title}</h3>
                  <ul>{m.topics.map((t) => <li key={t}>{t}</li>)}</ul>
                </li>
              ))}
            </ol>
          </div>
          <aside className="ws-detail-side" aria-label="Enrol">
            <div className="ws-side-card">
              <p className="ws-side-fee">{rupees(c.fee)}</p>
              <p className="ws-side-note">Includes the practice account for the length of the course.</p>
              <EnquiryForm courses={courses} defaultSlug={c.slug} compact />
            </div>
          </aside>
        </div>
      </section>
    </SiteFrame>
  );
}
