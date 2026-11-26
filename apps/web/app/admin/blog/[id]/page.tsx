import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PostForm } from '@/app/admin/blog/PostForm';
import { PageHeader } from '@/components/PageHeader';
import { requireAdmin } from '@/lib/admin';
import { LOCALES, parseList } from '@/lib/blog';
import { db } from '@/lib/db';

export const metadata = { title: 'Edit post' };

export default async function EditPost(props: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { id } = await props.params;
  const { saved } = await props.searchParams;
  const [post, categories] = await Promise.all([
    db.blogPost.findUnique({ where: { id } }),
    db.blogCategory.findMany({ orderBy: { sort: 'asc' } }),
  ]);
  if (!post) notFound();
  const live = post.status === 'published' && post.publishedAt && post.publishedAt <= new Date();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/admin/blog" className="text-sm text-muted-foreground hover:text-foreground">
        ← All posts
      </Link>
      <PageHeader title="Edit post" description={saved ? 'Saved.' : `/blog/${post.locale}/${post.slug}`} />
      <PostForm
        key={post.updatedAt.toISOString()}
        locales={LOCALES}
        viewUrl={live ? `/blog/${post.locale}/${post.slug}` : null}
        categories={categories.map((c) => ({ id: c.id, label: c.nameVi ? `${c.name} · ${c.nameVi}` : c.name }))}
        values={{
          id: post.id,
          locale: post.locale,
          title: post.title,
          slug: post.slug,
          categoryId: post.categoryId ?? '',
          excerpt: post.excerpt,
          body: post.body,
          takeaways: parseList(post.takeaways).join('\n'),
          tags: parseList(post.tags).join(', '),
          image: post.image ?? '',
          status: post.status,
          publishedAt: post.publishedAt?.toISOString() ?? '',
          metaTitle: post.metaTitle ?? '',
          metaDescription: post.metaDescription ?? '',
          focusKeyword: post.focusKeyword ?? '',
          authorName: post.authorName,
        }}
      />
    </div>
  );
}
