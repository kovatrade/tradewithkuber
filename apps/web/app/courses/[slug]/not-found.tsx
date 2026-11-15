import Link from 'next/link';
import { SiteFrame } from '@/components/site/SiteFrame';

/** Unknown course link: point back to the course list. */
export default function CourseNotFound() {
  return (
    <SiteFrame>
      <section className="ws-page-head ws-404">
        <div className="ws-wrap ws-narrow">
          <h1>This course isn’t available</h1>
          <p className="ws-lede">It may have been renamed or closed. See the courses that are open now.</p>
          <div className="ws-hero-cta"><Link href="/courses" className="ws-btn ws-btn-main">See all courses</Link><Link href="/contact" className="ws-btn ws-btn-line">Talk to a mentor</Link></div>
        </div>
      </section>
    </SiteFrame>
  );
}
