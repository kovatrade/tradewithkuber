import type { Metadata } from 'next';
import Link from 'next/link';
import { CourseCard } from '@/components/site/CourseCard';
import { PageIntro } from '@/components/site/Blocks';
import { SiteFrame } from '@/components/site/SiteFrame';
import { getCourses, getSiteName } from '@/lib/site-data';

// Rendered per request (course data is cached for 5 minutes), so a deploy never ships an empty course list.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getSiteName();
  return { title: `Courses | ${name}`, description: 'Stock market, MCX commodity, technical analysis, F&O and risk management courses with a paper-trading practice account.', robots: { index: true, follow: true } };
}

export default async function Courses() {
  const courses = await getCourses();
  return (
    <SiteFrame>
      <PageIntro title="Courses">Every course has live classes and a practice account. Start with Foundations if you are new; go straight to MCX or charts if you already trade.</PageIntro>
      <section className="ws-sec ws-sec-tight">
        <div className="ws-wrap">
          {courses === null ? <p className="ws-empty">Courses could not be loaded right now. Please refresh in a minute, or <Link href="/contact">ask us directly</Link>.</p>
            : courses.length ? <div className="ws-course-grid">{courses.map((c) => <CourseCard key={c.slug} c={c} />)}</div>
            : <p className="ws-empty">New batches are being planned. <Link href="/contact">Leave your number</Link> and we’ll tell you when they open.</p>}
        </div>
      </section>
    </SiteFrame>
  );
}
