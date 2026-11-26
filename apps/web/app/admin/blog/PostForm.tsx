'use client';

import { useActionState, useEffect, useState } from 'react';

import { type SaveState, deletePost, savePost } from '@/app/admin/blog/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type PostFormValues = {
  id?: string;
  locale: string;
  title: string;
  slug: string;
  categoryId: string;
  excerpt: string;
  body: string;
  takeaways: string;
  tags: string;
  image: string;
  status: string;
  /** ISO string, or empty. */
  publishedAt: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
  authorName: string;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const select = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function PostForm({
  values,
  categories,
  locales,
  viewUrl,
}: {
  values: PostFormValues;
  categories: { id: string; label: string }[];
  locales: readonly string[];
  viewUrl?: string | null;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(savePost, {});
  const [metaTitle, setMetaTitle] = useState(values.metaTitle);
  const [metaDescription, setMetaDescription] = useState(values.metaDescription);
  // The date is stored in UTC and edited in the browser's own time zone, which only the browser knows.
  const [publishedAt, setPublishedAt] = useState('');
  const [tzOffset, setTzOffset] = useState('0');
  useEffect(() => {
    setTzOffset(String(new Date().getTimezoneOffset()));
    if (!values.publishedAt) return;
    const d = new Date(values.publishedAt);
    setPublishedAt(new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  }, [values.publishedAt]);

  return (
    <div className="space-y-6">
      <form action={action} className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {values.id && <input type="hidden" name="id" value={values.id} />}
        <div className="space-y-5">
          <Field label="Title">
            <Input name="title" defaultValue={values.title} required />
          </Field>
          <Field label="Excerpt" hint="One or two sentences shown on the cards.">
            <Textarea name="excerpt" defaultValue={values.excerpt} rows={2} />
          </Field>
          <Field label="Body (Markdown)" hint="## for sections, ### for sub-sections, GFM tables. Don't add a # title.">
            <Textarea name="body" defaultValue={values.body} rows={28} className="font-mono text-[13px] leading-relaxed" required />
          </Field>
          <Field label="Key takeaways" hint="One per line.">
            <Textarea name="takeaways" defaultValue={values.takeaways} rows={4} />
          </Field>
        </div>

        <div className="space-y-5">
          <div className="space-y-4 rounded-xl border bg-card p-4">
            <Field label="Status">
              <select name="status" defaultValue={values.status} className={select}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
            <Field label="Publish date" hint="Empty: now, when published. A future date schedules it.">
              <Input type="datetime-local" name="publishedAt" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
              <input type="hidden" name="tzOffset" value={tzOffset} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
              {viewUrl && (
                <Button asChild variant="outline">
                  <a href={viewUrl} target="_blank" rel="noopener">
                    View
                  </a>
                </Button>
              )}
            </div>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          </div>

          <div className="space-y-4 rounded-xl border bg-card p-4">
            <Field label="Language">
              <select name="locale" defaultValue={values.locale} className={select}>
                {locales.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Slug" hint="Empty: made from the title.">
              <Input name="slug" defaultValue={values.slug} />
            </Field>
            <Field label="Topic">
              <select name="categoryId" defaultValue={values.categoryId} className={select}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tags" hint="Comma separated.">
              <Input name="tags" defaultValue={values.tags} />
            </Field>
            <Field label="Cover image URL" hint="Empty: a generated cover.">
              <Input name="image" defaultValue={values.image} />
            </Field>
            <Field label="Author">
              <Input name="authorName" defaultValue={values.authorName} />
            </Field>
          </div>

          <div className="space-y-4 rounded-xl border bg-card p-4">
            <Field label="Focus keyword">
              <Input name="focusKeyword" defaultValue={values.focusKeyword} />
            </Field>
            <Field label="Meta title" hint={`${metaTitle.length}/60`}>
              <Input name="metaTitle" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
            </Field>
            <Field label="Meta description" hint={`${metaDescription.length}/160`}>
              <Textarea name="metaDescription" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={3} />
            </Field>
          </div>
        </div>
      </form>

      {values.id && (
        <form
          action={deletePost}
          onSubmit={(e) => {
            if (!confirm('Delete this post? This cannot be undone.')) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={values.id} />
          <Button type="submit" variant="outline" className="text-destructive">
            Delete post
          </Button>
        </form>
      )}
    </div>
  );
}
