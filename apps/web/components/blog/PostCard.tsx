import Link from 'next/link';

import { Cover } from '@/components/blog/Cover';
import { type Locale, type PostCard as Post, categoryName, formatDate } from '@/lib/blog';

export function PostMeta({ post, locale }: { post: Pick<Post, 'category' | 'publishedAt'>; locale: Locale }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {post.category && (
        <Link href={`/blog/${locale}/category/${post.category.slug}`} className="relative z-10 text-primary hover:underline">
          {categoryName(post.category, locale)}
        </Link>
      )}
      {post.category && <span aria-hidden>·</span>}
      <time dateTime={post.publishedAt?.toISOString()}>{formatDate(post.publishedAt, locale)}</time>
    </p>
  );
}

export function PostCard({ post, locale, showExcerpt = false }: { post: Post; locale: Locale; showExcerpt?: boolean }) {
  const href = `/blog/${locale}/${post.slug}`;
  return (
    <article className="group relative flex flex-col gap-3">
      <Cover
        slug={post.slug}
        category={post.category?.slug}
        image={post.image}
        alt={post.title}
        className="transition-transform duration-300 group-hover:-translate-y-0.5"
      />
      <PostMeta post={post} locale={locale} />
      <h3 className="text-[17px] font-semibold leading-snug tracking-tight">
        <Link href={href} className="after:absolute after:inset-0 group-hover:text-primary">
          {post.title}
        </Link>
      </h3>
      {showExcerpt && <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>}
    </article>
  );
}
