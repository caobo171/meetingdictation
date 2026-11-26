import Link from 'next/link';

import { PostForm } from '@/app/admin/blog/PostForm';
import { PageHeader } from '@/components/PageHeader';
import { requireAdmin } from '@/lib/admin';
import { LOCALES } from '@/lib/blog';
import { db } from '@/lib/db';

export const metadata = { title: 'New post' };

export default async function NewPost() {
  await requireAdmin();
  const categories = await db.blogCategory.findMany({ orderBy: { sort: 'asc' } });
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/admin/blog" className="text-sm text-muted-foreground hover:text-foreground">
        ← All posts
      </Link>
      <PageHeader title="New post" />
      <PostForm
        locales={LOCALES}
        categories={categories.map((c) => ({ id: c.id, label: c.nameVi ? `${c.name} · ${c.nameVi}` : c.name }))}
        values={{
          locale: 'vi',
          title: '',
          slug: '',
          categoryId: '',
          excerpt: '',
          body: '',
          takeaways: '',
          tags: '',
          image: '',
          status: 'draft',
          publishedAt: '',
          metaTitle: '',
          metaDescription: '',
          focusKeyword: '',
          authorName: 'MeetingDictation',
        }}
      />
    </div>
  );
}
