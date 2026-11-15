import Link from 'next/link';
import { type Course, rupees } from '@/lib/site-data';

export function CourseCard({ c }: { c: Course }) {
  return (
    <article className="ws-course">
      <p className="ws-course-level">{c.level}</p>
      <h3><Link href={`/courses/${c.slug}`}>{c.title}</Link></h3>
      <p className="ws-course-sum">{c.summary}</p>
      <dl className="ws-course-facts">
        <div><dt>Duration</dt><dd>{c.duration}</dd></div>
        <div><dt>Modules</dt><dd>{c.modules.length}</dd></div>
        <div><dt>Fee</dt><dd>{rupees(c.fee)}</dd></div>
      </dl>
    </article>
  );
}
