import type { MetadataRoute } from 'next';

import { SITE_URL, activeLocales, isLocale } from '@/lib/blog';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [locales, posts, categories] = await Promise.all([
    activeLocales(),
    db.blogPost.findMany({
      where: { status: 'published', publishedAt: { lte: new Date() } },
      select: { locale: true, slug: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
    }),
    db.blogCategory.findMany({ select: { slug: true } }),
  ]);
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    ...locales.map((l) => ({ url: `${SITE_URL}/blog/${l}`, changeFrequency: 'daily' as const, priority: 0.8 })),
    ...locales.flatMap((l) => categories.map((c) => ({ url: `${SITE_URL}/blog/${l}/category/${c.slug}`, priority: 0.5 }))),
    ...posts
      .filter((p) => isLocale(p.locale))
      .map((p) => ({ url: `${SITE_URL}/blog/${p.locale}/${p.slug}`, lastModified: p.updatedAt, priority: 0.7 })),
  ];
}
