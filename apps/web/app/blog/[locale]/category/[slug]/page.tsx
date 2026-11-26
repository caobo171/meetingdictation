import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BlogShell, MostReadBox, Pagination, TopicsBox } from '@/components/blog/BlogChrome';
import { PostCard } from '@/components/blog/PostCard';
import { T, activeLocales, categoriesWithCounts, categoryName, isLocale, listPosts, popularPosts } from '@/lib/blog';
import { db } from '@/lib/db';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const cat = await db.blogCategory.findUnique({ where: { slug } });
  if (!cat) return {};
  const name = categoryName(cat, locale);
  return {
    title: { absolute: `${T[locale].categoryTitle(name)} · MeetingDictation` },
    description: T[locale].blogDescription,
    alternates: { canonical: `/blog/${locale}/category/${slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const cat = await db.blogCategory.findUnique({ where: { slug } });
  if (!cat) notFound();
  const page = Number((await searchParams).page) || 1;
  const t = T[locale];

  const [locales, categories, popular, list] = await Promise.all([
    activeLocales(),
    categoriesWithCounts(locale),
    popularPosts(locale),
    listPosts({ locale, page, categoryId: cat.id }),
  ]);
  const name = categoryName(cat, locale);

  return (
    <BlogShell locale={locale} locales={locales}>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
          <Link href={`/blog/${locale}`} className="hover:text-foreground">
            {t.blog}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{name}</span>
        </nav>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{name}</h1>
        <p className="mt-2 text-muted-foreground">{t.posts(list.total)}</p>

        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_300px]">
          <section>
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
              {list.posts.map((p) => (
                <PostCard key={p.id} post={p} locale={locale} showExcerpt />
              ))}
            </div>
            {!list.posts.length && <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{t.noResults}</p>}
            <Pagination
              page={list.page}
              pages={list.pages}
              locale={locale}
              href={(p) => `/blog/${locale}/category/${slug}${p > 1 ? `?page=${p}` : ''}`}
            />
          </section>
          <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
            <TopicsBox locale={locale} categories={categories} current={slug} />
            <MostReadBox locale={locale} posts={popular} />
          </aside>
        </div>
      </main>
    </BlogShell>
  );
}
