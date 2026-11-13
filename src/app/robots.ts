import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Signed-in app screens and APIs: nothing useful to index.
      disallow: ['/api/', '/admin', '/account', '/dashboard', '/builder', '/crates', '/library',
        '/history', '/gigs', '/output', '/convert', '/id', '/invoice'],
    },
    sitemap: `https://${BRAND.domain}/sitemap.xml`,
  };
}
