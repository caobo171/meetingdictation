import { GlobeAltIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { type Locale, type PostCard, T, categoryName } from '@/lib/blog';
import { cn } from '@/lib/utils';

/** Site header + WELE-style blog bar (title, language, search), the page, and the footer. */
export async function BlogShell({
  locale,
  locales,
  q,
  children,
}: {
  locale: Locale;
  locales: Locale[];
  q?: string;
  children: React.ReactNode;
}) {
  const t = T[locale];
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader blogHref={`/blog/${locale}`} />
      <div className="border-b bg-muted/40">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href={`/blog/${locale}`} className="font-semibold tracking-tight">
            {t.blog}
          </Link>
          <div className="flex items-center gap-2">
            {locales.length > 1 && (
              <nav className="hidden items-center gap-1 text-sm sm:flex" aria-label="Language">
                <GlobeAltIcon className="size-4 text-muted-foreground" />
                {locales.map((l) => (
                  <Link
                    key={l}
                    href={`/blog/${l}`}
                    hrefLang={l}
                    className={cn(
                      'rounded-md px-2 py-1',
                      l === locale ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {T[l].language}
                  </Link>
                ))}
              </nav>
            )}
            <form action={`/blog/${locale}`} className="relative" role="search">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                defaultValue={q}
                placeholder={t.search}
                aria-label={t.search}
                className="h-9 w-44 rounded-full border bg-background pl-8 pr-3 text-sm outline-none ring-ring focus-visible:ring-2 sm:w-60"
              />
            </form>
          </div>
        </div>
      </div>
      {children}
      <SiteFooter blogHref={`/blog/${locale}`} />
    </div>
  );
}

type CategoryCount = { id: string; slug: string; name: string; nameVi: string | null; count: number };

export function TopicsBox({ locale, categories, current }: { locale: Locale; categories: CategoryCount[]; current?: string }) {
  const t = T[locale];
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-sm font-semibold">{t.topics}</h2>
      <ul className="mt-3 grid gap-0.5">
        <li>
          <Link
            href={`/blog/${locale}`}
            className={cn(
              'flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
              !current ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            {t.allPosts}
            <span className="tabular-nums text-xs">{categories.reduce((n, c) => n + c.count, 0)}</span>
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.id}>
            <Link
              href={`/blog/${locale}/category/${c.slug}`}
              className={cn(
                'flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm',
                current === c.slug ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <span className="flex items-center gap-2.5">
                <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                  {categoryName(c, locale).charAt(0)}
                </span>
                {categoryName(c, locale)}
              </span>
              <span className="tabular-nums text-xs">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MostReadBox({ locale, posts }: { locale: Locale; posts: PostCard[] }) {
  const t = T[locale];
  if (!posts.length) return null;
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-sm font-semibold">{t.mostRead}</h2>
      <ol className="mt-3 grid gap-4">
        {posts.map((p, i) => (
          <li key={p.id} className="flex gap-3">
            <span className="w-5 shrink-0 text-lg font-semibold tabular-nums text-primary/70">{i + 1}</span>
            <div className="min-w-0">
              <Link href={`/blog/${locale}/${p.slug}`} className="text-sm font-medium leading-snug hover:text-primary">
                {p.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.category ? `${categoryName(p.category, locale)} · ` : ''}
                {t.minRead(p.readingTime)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Pagination({ page, pages, href, locale }: { page: number; pages: number; href: (p: number) => string; locale: Locale }) {
  if (pages <= 1) return null;
  const t = T[locale];
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const item = 'flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm';
  return (
    <nav className="mt-12 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
      {page > 1 && (
        <Link className={cn(item, 'hover:bg-accent')} href={href(page - 1)} rel="prev">
          {t.prev}
        </Link>
      )}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
          <Link
            href={href(n)}
            aria-current={n === page ? 'page' : undefined}
            className={cn(item, n === page ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}
          >
            {n}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link className={cn(item, 'hover:bg-accent')} href={href(page + 1)} rel="next">
          {t.next}
        </Link>
      )}
    </nav>
  );
}

export function CtaBox({ locale }: { locale: Locale }) {
  const t = T[locale];
  return (
    <section className="rounded-2xl border bg-primary/5 p-6 sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight">{t.ctaTitle}</h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{t.ctaBody}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/signup" className="btn-primary">
          {t.ctaButton}
        </Link>
        <Link href="/app/extension" className="btn-ghost">
          {t.ctaSecondary}
        </Link>
      </div>
    </section>
  );
}
