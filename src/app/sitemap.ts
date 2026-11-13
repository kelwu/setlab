import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';
import { HELP_GUIDES } from '@/lib/setdrop/help-guides';

// Public, indexable pages only. Everything behind sign-in is left out (and
// disallowed in robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${BRAND.domain}`;
  const page = (path: string, priority: number, changeFrequency: 'weekly' | 'monthly' | 'yearly') =>
    ({ url: `${base}${path}`, changeFrequency, priority });
  return [
    page('/', 1, 'weekly'),
    page('/serato-to-rekordbox', 0.9, 'monthly'),
    page('/help', 0.6, 'monthly'),
    ...HELP_GUIDES.map(g => page(`/help/${g.slug}`, 0.5, 'monthly')),
    page('/terms', 0.2, 'yearly'),
    page('/privacy', 0.2, 'yearly'),
  ];
}
