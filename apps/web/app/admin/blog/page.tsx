import { PlusIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { LOCALES } from '@/lib/blog';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Blog admin' };

const date = (d: Date | null) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default async function BlogAdmin(props: { searchParams: Promise<{ locale?: string; q?: string }> }) {
  await requireAdmin();
  const { locale, q } = await props.searchParams;
  const posts = await db.blogPost.findMany({
    where: {
      ...(locale ? { locale } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    select: { id: true, title: true, slug: true, locale: true, status: true, publishedAt: true, views: true, category: { select: { name: true } } },
    orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
  });
  const now = new Date();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Blog"
        description={`${posts.length} posts`}
        action={
          <Button asChild>
            <Link href="/admin/blog/new">
              <PlusIcon /> New post
            </Link>
          </Button>
        }
      />
      <form className="flex flex-wrap items-center gap-2">
        {['', ...LOCALES].map((l) => (
          <Link
            key={l}
            href={l ? `/admin/blog?locale=${l}` : '/admin/blog'}
            className={cn('rounded-full border px-3 py-1 text-sm', (locale ?? '') === l ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
          >
            {l || 'All'}
          </Link>
        ))}
        {locale && <input type="hidden" name="locale" value={locale} />}
        <input name="q" defaultValue={q} placeholder="Search titles…" className="ml-auto h-9 w-56 rounded-md border bg-background px-3 text-sm" />
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Topic</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Views</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => {
              const scheduled = p.status === 'published' && p.publishedAt && p.publishedAt > now;
              return (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="max-w-md px-4 py-3">
                    <Link href={`/admin/blog/${p.id}`} className="font-medium hover:text-primary">
                      {p.title}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      /blog/{p.locale}/{p.slug}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {scheduled ? (
                      <Badge variant="outline">Scheduled</Badge>
                    ) : p.status === 'published' ? (
                      <Badge variant="success">Published</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{date(p.publishedAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.views}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!posts.length && <p className="p-10 text-center text-muted-foreground">No posts yet.</p>}
      </Card>
    </div>
  );
}
