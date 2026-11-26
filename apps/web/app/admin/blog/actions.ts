'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { audit, requireAdmin } from '@/lib/admin';
import { LOCALES, readingTime, slugify } from '@/lib/blog';
import { db } from '@/lib/db';

const lines = (v: string) =>
  v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

const schema = z.object({
  id: z.string().optional(),
  locale: z.enum(LOCALES),
  title: z.string().trim().min(3).max(200),
  slug: z.string().trim().max(120),
  categoryId: z.string(),
  excerpt: z.string().trim().max(400),
  body: z.string().min(1),
  takeaways: z.string(),
  tags: z.string(),
  image: z.string().trim().max(500),
  status: z.enum(['draft', 'published']),
  publishedAt: z.string(),
  tzOffset: z.coerce.number().int().min(-900).max(900).default(0),
  metaTitle: z.string().trim().max(120),
  metaDescription: z.string().trim().max(300),
  focusKeyword: z.string().trim().max(120),
  authorName: z.string().trim().max(80),
});

export type SaveState = { error?: string };

export async function savePost(_prev: SaveState, form: FormData): Promise<SaveState> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: `${first.path.join('.')}: ${first.message}` };
  }
  const v = parsed.data;
  const slug = slugify(v.slug || v.title);
  if (!slug) return { error: 'The slug is empty.' };
  if (v.image && !/^(https?:\/\/|\/)/.test(v.image)) return { error: 'The image must be a URL or a path starting with /.' };

  const clash = await db.blogPost.findUnique({ where: { locale_slug: { locale: v.locale, slug } }, select: { id: true } });
  if (clash && clash.id !== v.id) return { error: `Another ${v.locale} post already uses the slug "${slug}".` };

  // Published without a date: now. A future date schedules the post.
  // datetime-local has no zone: read it as UTC, then shift by the browser's offset (minutes behind UTC).
  const publishedAt = v.publishedAt
    ? new Date(new Date(`${v.publishedAt}:00Z`).getTime() + v.tzOffset * 60_000)
    : v.status === 'published'
      ? new Date()
      : null;
  if (publishedAt && Number.isNaN(publishedAt.getTime())) return { error: 'The publish date is not a valid date.' };

  const data = {
    locale: v.locale,
    slug,
    title: v.title,
    categoryId: v.categoryId || null,
    excerpt: v.excerpt,
    body: v.body.replace(/\r\n/g, '\n'),
    takeaways: JSON.stringify(lines(v.takeaways)),
    tags: JSON.stringify(
      v.tags
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
    image: v.image || null,
    status: v.status,
    publishedAt,
    metaTitle: v.metaTitle || null,
    metaDescription: v.metaDescription || null,
    focusKeyword: v.focusKeyword || null,
    authorName: v.authorName || 'MeetingDictation',
    readingTime: readingTime(v.body),
    source: 'admin',
  };
  const post = v.id ? await db.blogPost.update({ where: { id: v.id }, data }) : await db.blogPost.create({ data });
  await audit(admin, v.id ? 'blog.update' : 'blog.create', `${v.id ? 'Edited' : 'Created'} post "${post.title}" (${post.status})`, {
    type: 'blog',
    id: post.id,
  });
  revalidatePath('/blog', 'layout');
  redirect(`/admin/blog/${post.id}?saved=1`);
}

export async function deletePost(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get('id'));
  const post = await db.blogPost.delete({ where: { id } });
  await audit(admin, 'blog.delete', `Deleted post "${post.title}"`, { type: 'blog', id });
  revalidatePath('/blog', 'layout');
  redirect('/admin/blog');
}
