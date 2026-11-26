import { SITE_URL, T, isLocale, livePosts } from '@/lib/blog';
import { db } from '@/lib/db';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return new Response('Not found', { status: 404 });
  const posts = await db.blogPost.findMany({
    where: livePosts(locale),
    select: { slug: true, title: true, excerpt: true, publishedAt: true, category: { select: { name: true, nameVi: true } } },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  });
  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/blog/${locale}/${p.slug}`;
      const cat = p.category ? (locale === 'vi' && p.category.nameVi) || p.category.name : null;
      return `<item><title>${esc(p.title)}</title><link>${url}</link><guid>${url}</guid><description>${esc(p.excerpt)}</description>${
        cat ? `<category>${esc(cat)}</category>` : ''
      }<pubDate>${p.publishedAt?.toUTCString()}</pubDate></item>`;
    })
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(T[locale].blogTitle)}</title><link>${SITE_URL}/blog/${locale}</link><description>${esc(
    T[locale].blogDescription,
  )}</description><language>${locale}</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}
