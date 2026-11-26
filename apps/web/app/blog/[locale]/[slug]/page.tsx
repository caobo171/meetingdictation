import { CheckCircleIcon } from '@heroicons/react/24/outline';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BlogShell, CtaBox } from '@/components/blog/BlogChrome';
import { Cover } from '@/components/blog/Cover';
import { PostCard } from '@/components/blog/PostCard';
import { ViewBeacon } from '@/components/blog/ViewBeacon';
import { LogoMark } from '@/components/Logo';
import {
  SITE_URL,
  T,
  activeLocales,
  categoriesWithCounts,
  categoryName,
  formatDate,
  getPost,
  isLocale,
  livePosts,
  parseList,
  postNeighbours,
  renderMarkdown,
} from '@/lib/blog';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';

type Props = { params: Promise<{ locale: string; slug: string }> };

async function siblings(slug: string) {
  return db.blogPost.findMany({
    where: { slug, status: 'published', publishedAt: { lte: new Date() } },
    select: { locale: true },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const post = await getPost(locale, slug);
  if (!post) return {};
  const url = `/blog/${locale}/${slug}`;
  const description = post.metaDescription || post.excerpt;
  const title = post.metaTitle || post.title;
  return {
    title: { absolute: `${title} · MeetingDictation` },
    description,
    keywords: post.focusKeyword ? [post.focusKeyword, ...parseList(post.tags)] : parseList(post.tags),
    alternates: {
      canonical: url,
      languages: Object.fromEntries((await siblings(slug)).map((s) => [s.locale, `/blog/${s.locale}/${slug}`])),
    },
    openGraph: {
      type: 'article',
      url: `${SITE_URL}${url}`,
      title,
      description,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: [post.authorName],
      tags: parseList(post.tags),
      ...(post.image ? { images: [post.image] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const post = await getPost(locale, slug);
  if (!post) notFound();
  const t = T[locale];

  const [locales, categories, { older, newer, related }, library] = await Promise.all([
    activeLocales(),
    categoriesWithCounts(locale),
    postNeighbours(post),
    post.categoryId
      ? db.blogPost.findMany({
          where: { ...livePosts(locale), categoryId: post.categoryId },
          select: { id: true, slug: true, title: true },
          orderBy: { publishedAt: 'desc' },
          take: 8,
        })
      : Promise.resolve([]),
  ]);
  const { html, toc } = renderMarkdown(post.body);
  const takeaways = parseList(post.takeaways);
  const tags = parseList(post.tags);
  const url = `${SITE_URL}/blog/${locale}/${slug}`;
  const prompt = encodeURIComponent(t.summarisePrompt(url));
  const catName = post.category ? categoryName(post.category, locale) : null;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.metaDescription || post.excerpt,
      inLanguage: locale,
      datePublished: post.publishedAt?.toISOString(),
      dateModified: post.updatedAt.toISOString(),
      author: { '@type': 'Organization', name: post.authorName, url: SITE_URL },
      publisher: { '@type': 'Organization', name: 'MeetingDictation', logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png` } },
      mainEntityOfPage: url,
      keywords: tags.join(', '),
      ...(post.image ? { image: post.image } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t.blog, item: `${SITE_URL}/blog/${locale}` },
        ...(post.category
          ? [{ '@type': 'ListItem', position: 2, name: catName, item: `${SITE_URL}/blog/${locale}/category/${post.category.slug}` }]
          : []),
        { '@type': 'ListItem', position: post.category ? 3 : 2, name: post.title, item: url },
      ],
    },
  ];

  return (
    <BlogShell locale={locale} locales={locales}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <ViewBeacon id={post.id} />

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_220px] lg:py-12">
        {/* Library: the topics, with the posts of this one open, as on WELE's post pages. */}
        <aside className="hidden lg:block">
          <nav className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-1 overflow-y-auto pb-6 text-sm" aria-label={t.topics}>
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.topics}</p>
            {categories.map((c) => {
              const open = c.id === post.categoryId;
              return (
                <div key={c.id}>
                  <Link
                    href={`/blog/${locale}/category/${c.slug}`}
                    className={cn(
                      'flex items-center justify-between rounded-md px-2 py-1.5',
                      open ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    {categoryName(c, locale)}
                    <span className="text-xs tabular-nums text-muted-foreground">{c.count}</span>
                  </Link>
                  {open && (
                    <ul className="mb-2 ml-2 mt-0.5 space-y-0.5 border-l pl-2">
                      {library.map((p) => (
                        <li key={p.id}>
                          <Link
                            href={`/blog/${locale}/${p.slug}`}
                            aria-current={p.id === post.id ? 'page' : undefined}
                            className={cn(
                              'block rounded-md px-2 py-1 leading-snug',
                              p.id === post.id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            <span className="line-clamp-2">{p.title}</span>
                          </Link>
                        </li>
                      ))}
                      {c.count > library.length && (
                        <li>
                          <Link href={`/blog/${locale}/category/${c.slug}`} className="block px-2 py-1 text-primary hover:underline">
                            {t.seeAll}
                          </Link>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          <article className="mx-auto max-w-[720px]">
            <nav className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
              <Link href={`/blog/${locale}`} className="hover:text-foreground">
                {t.blog}
              </Link>
              {post.category && (
                <>
                  <span>/</span>
                  <Link href={`/blog/${locale}/category/${post.category.slug}`} className="hover:text-foreground">
                    {catName}
                  </Link>
                </>
              )}
            </nav>
            <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-[40px] sm:leading-[1.15]">{post.title}</h1>
            <p className="mt-4 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>
                {t.by} <span className="font-medium text-foreground">{post.authorName}</span>
              </span>
              <span>·</span>
              <time dateTime={post.publishedAt?.toISOString()}>{formatDate(post.publishedAt, locale)}</time>
              <span>·</span>
              <span>{t.minRead(post.readingTime)}</span>
            </p>

            <Cover slug={post.slug} category={post.category?.slug} image={post.image} alt={post.title} className="mt-8" priority />

            {takeaways.length > 0 && (
              <section className="mt-8 rounded-2xl border bg-muted/40 p-5 sm:p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t.takeaways}</h2>
                <ul className="mt-3 space-y-2.5">
                  {takeaways.map((k) => (
                    <li key={k} className="flex gap-2.5 text-[15px] leading-relaxed">
                      <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-success" />
                      {k}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {toc.length > 2 && (
              <details className="mt-6 rounded-xl border p-4 xl:hidden">
                <summary className="cursor-pointer text-sm font-semibold">{t.toc}</summary>
                <ol className="mt-3 space-y-1.5 text-sm">
                  {toc.map((h) => (
                    <li key={h.id} className={h.depth === 3 ? 'pl-4' : ''}>
                      <a href={`#${h.id}`} className="text-muted-foreground hover:text-foreground">
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </details>
            )}

            <div className="prose-blog mt-8" dangerouslySetInnerHTML={{ __html: html }} />

            <section className="mt-12 rounded-2xl border p-5 sm:p-6">
              <h2 className="font-semibold">{t.summarise}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{t.summariseBody}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a className="btn-ghost" href={`https://chatgpt.com/?q=${prompt}`} target="_blank" rel="noopener nofollow">
                  {t.summariseWith('ChatGPT')}
                </a>
                <a className="btn-ghost" href={`https://claude.ai/new?q=${prompt}`} target="_blank" rel="noopener nofollow">
                  {t.summariseWith('Claude')}
                </a>
              </div>
            </section>

            {tags.length > 0 && (
              <ul className="mt-8 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <li key={tag}>
                    <Link
                      href={`/blog/${locale}?tag=${encodeURIComponent(tag)}`}
                      className="inline-block rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      #{tag}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <section className="mt-8 flex gap-4 rounded-2xl bg-muted/40 p-5">
              <LogoMark size={48} className="shrink-0" />
              <div>
                <p className="font-semibold">{post.authorName}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.authorBio}</p>
              </div>
            </section>

            {(older || newer) && (
              <nav className="mt-8 grid gap-3 sm:grid-cols-2" aria-label={t.nextPost}>
                {newer ? (
                  <Link href={`/blog/${locale}/${newer.slug}`} className="rounded-xl border p-4 hover:border-primary">
                    <span className="text-xs text-muted-foreground">← {t.nextPost}</span>
                    <span className="mt-1 block font-medium leading-snug">{newer.title}</span>
                  </Link>
                ) : (
                  <span />
                )}
                {older && (
                  <Link href={`/blog/${locale}/${older.slug}`} className="rounded-xl border p-4 text-right hover:border-primary">
                    <span className="text-xs text-muted-foreground">{t.prevPost} →</span>
                    <span className="mt-1 block font-medium leading-snug">{older.title}</span>
                  </Link>
                )}
              </nav>
            )}

            <div className="mt-12">
              <CtaBox locale={locale} />
            </div>
          </article>

          {related.length > 0 && (
            <section className="mx-auto mt-16 max-w-[720px] xl:max-w-none">
              <h2 className="mb-6 text-xl font-semibold tracking-tight">{t.related}</h2>
              <div className="grid gap-x-6 gap-y-10 sm:grid-cols-3">
                {related.map((p) => (
                  <PostCard key={p.id} post={p} locale={locale} />
                ))}
              </div>
            </section>
          )}
        </main>

        {toc.length > 2 && (
          <aside className="hidden xl:block">
            <nav className="sticky top-20 text-sm" aria-label={t.toc}>
              <p className="pb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.toc}</p>
              <ol className="space-y-2 border-l">
                {toc.map((h) => (
                  <li key={h.id}>
                    <a
                      href={`#${h.id}`}
                      className={cn('-ml-px block border-l border-transparent leading-snug text-muted-foreground hover:border-primary hover:text-foreground', h.depth === 3 ? 'pl-6' : 'pl-3')}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        )}
      </div>
    </BlogShell>
  );
}
