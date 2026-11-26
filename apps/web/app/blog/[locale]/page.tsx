import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BlogShell, MostReadBox, Pagination, TopicsBox } from '@/components/blog/BlogChrome';
import { Cover } from '@/components/blog/Cover';
import { PostCard, PostMeta } from '@/components/blog/PostCard';
import { SITE_URL, T, activeLocales, categoriesWithCounts, isLocale, listPosts, popularPosts } from '@/lib/blog';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; q?: string; tag?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { page, q, tag } = await searchParams;
  const locales = await activeLocales();
  return {
    title: { absolute: T[locale].blogTitle },
    description: T[locale].blogDescription,
    alternates: {
      canonical: `/blog/${locale}${page && page !== '1' ? `?page=${page}` : ''}`,
      languages: Object.fromEntries(locales.map((l) => [l, `/blog/${l}`])),
      types: { 'application/rss+xml': `/blog/${locale}/rss.xml` },
    },
    robots: q || tag || !locales.includes(locale) ? { index: false, follow: true } : undefined,
    openGraph: { type: 'website', title: T[locale].blogTitle, description: T[locale].blogDescription, url: `${SITE_URL}/blog/${locale}` },
  };
}

export default async function BlogIndex({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const q = sp.q?.trim() || undefined;
  const tag = sp.tag?.trim() || undefined;
  const t = T[locale];

  const [locales, categories, popular, list] = await Promise.all([
    activeLocales(),
    categoriesWithCounts(locale),
    popularPosts(locale),
    listPosts({ locale, page, q, tag }),
  ]);
  const filtered = !!(q || tag);
  // The newest post leads the first page, as on WELE's blog; it is left out of the grid below it.
  const featured = !filtered && page === 1 ? list.posts[0] : undefined;
  const grid = featured ? list.posts.slice(1) : list.posts;
  const pageHref = (p: number) => {
    const s = new URLSearchParams();
    if (q) s.set('q', q);
    if (tag) s.set('tag', tag);
    if (p > 1) s.set('page', String(p));
    const qs = s.toString();
    return `/blog/${locale}${qs ? `?${qs}` : ''}`;
  };

  return (
    <BlogShell locale={locale} locales={locales} q={q}>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="sr-only">{t.blogTitle}</h1>

        {featured && (
          <section className="mb-14 grid items-center gap-8 lg:grid-cols-[1fr_1.05fr]">
            <div className="order-2 lg:order-1">
              <PostMeta post={featured} locale={locale} />
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                <Link href={`/blog/${locale}/${featured.slug}`} className="hover:text-primary">
                  {featured.title}
                </Link>
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">{featured.excerpt}</p>
              <Link href={`/blog/${locale}/${featured.slug}`} className="btn-ghost mt-6 rounded-full px-5 uppercase tracking-wide">
                {t.readMore}
              </Link>
            </div>
            <Link href={`/blog/${locale}/${featured.slug}`} className="order-1 lg:order-2" tabIndex={-1}>
              <Cover slug={featured.slug} category={featured.category?.slug} image={featured.image} alt={featured.title} priority />
            </Link>
          </section>
        )}

        <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
          <section>
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-tight">
                {q ? t.searchResults(q, list.total) : tag ? t.tagResults(tag, list.total) : t.latest}
              </h2>
              {filtered && (
                <Link href={`/blog/${locale}`} className="text-sm text-primary hover:underline">
                  {t.clear}
                </Link>
              )}
            </div>
            {grid.length ? (
              <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
                {grid.map((p) => (
                  <PostCard key={p.id} post={p} locale={locale} />
                ))}
              </div>
            ) : (
              !featured && <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{t.noResults}</p>
            )}
            <Pagination page={list.page} pages={list.pages} href={pageHref} locale={locale} />
          </section>

          <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
            <TopicsBox locale={locale} categories={categories} />
            <MostReadBox locale={locale} posts={popular} />
          </aside>
        </div>
      </main>
    </BlogShell>
  );
}
