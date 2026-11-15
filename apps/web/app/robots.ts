import type { MetadataRoute } from 'next';

const SITE = (process.env.SITE_URL || 'https://tradewithkuber.com').replace(/\/+$/, '');

/** Search engines may index the course website; the trading portal stays out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/courses', '/pricing', '/about', '/support', '/contact', '/privacy', '/terms', '/download'], disallow: ['/preview', '/login', '/trader', '/broker', '/admin', '/account', '/notifications', '/mfa-setup', '/graphql', '/api-console', '/app-files'] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
