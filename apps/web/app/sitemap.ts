import type { MetadataRoute } from 'next';
import { getCourses } from '@/lib/site-data';

const SITE = (process.env.SITE_URL || 'https://tradewithkuber.com').replace(/\/+$/, '');
export const dynamic = 'force-dynamic';

/** Pages of the public course website. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const courses = (await getCourses()) ?? [];
  return [
    ...['', '/courses', '/pricing', '/about', '/support', '/contact', '/privacy', '/terms'].map((p) => ({ url: `${SITE}${p}`, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.6 })),
    ...courses.map((c) => ({ url: `${SITE}/courses/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
