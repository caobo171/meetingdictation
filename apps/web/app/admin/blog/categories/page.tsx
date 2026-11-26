import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ConfirmButton, SubmitButton } from '@/components/admin/ConfirmButton';
import { AdminHeader, TableCard, Tr, inputCls } from '@/components/admin/ui';
import { Card } from '@/components/ui/card';
import { audit, requireAdmin } from '@/lib/admin';
import { slugify } from '@/lib/blog';
import { db } from '@/lib/db';

export const metadata = { title: 'Blog topics' };

const go = (msg: string): never => {
  revalidatePath('/admin/blog/categories');
  revalidatePath('/blog', 'layout');
  redirect(`/admin/blog/categories?msg=${encodeURIComponent(msg)}`);
};

async function saveCategory(form: FormData) {
  'use server';
  const admin = await requireAdmin();
  const id = String(form.get('id') ?? '');
  const name = String(form.get('name') ?? '').trim();
  const nameVi = String(form.get('nameVi') ?? '').trim();
  const slug = slugify(String(form.get('slug') ?? '') || name);
  const sort = Number.parseInt(String(form.get('sort') ?? '0'), 10) || 0;
  if (!name || !slug) go('A topic needs a name.');
  const clash = await db.blogCategory.findUnique({ where: { slug } });
  if (clash && clash.id !== id) go(`Another topic already uses the slug "${slug}".`);
  const data = { name, nameVi: nameVi || null, slug, sort };
  const c = id ? await db.blogCategory.update({ where: { id }, data }) : await db.blogCategory.create({ data });
  await audit(admin, id ? 'blog_category.update' : 'blog_category.create', `${id ? 'Edited' : 'Created'} blog topic ${c.name}`, { type: 'blog_category', id: c.id });
  go(`Saved ${c.name}.`);
}

async function deleteCategory(form: FormData) {
  'use server';
  const admin = await requireAdmin();
  const c = await db.blogCategory.delete({ where: { id: String(form.get('id')) } });
  await audit(admin, 'blog_category.delete', `Deleted blog topic ${c.name}; its posts now have no topic`, { type: 'blog_category', id: c.id });
  go(`Deleted ${c.name}.`);
}

export default async function BlogCategories(props: { searchParams: Promise<{ msg?: string }> }) {
  await requireAdmin();
  const { msg } = await props.searchParams;
  const cats = await db.blogCategory.findMany({ orderBy: [{ sort: 'asc' }, { name: 'asc' }], include: { _count: { select: { posts: true } } } });

  return (
    <>
      <AdminHeader title="Blog topics" description="The categories on /blog. The Vietnamese name shows on /blog/vi." />
      {msg && <p className="rounded-lg border bg-card px-4 py-2.5 text-sm">{msg}</p>}
      <TableCard>
        <thead className="border-b">
          <tr>
            <th colSpan={6} className="px-4 py-3">
              <div className="grid grid-cols-[64px_1fr_1fr_1fr_60px_auto] gap-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span>Order</span>
                <span>Name (English)</span>
                <span>Tên (tiếng Việt)</span>
                <span>Slug</span>
                <span className="text-right">Posts</span>
                <span className="w-[136px]" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {cats.map((c) => (
            <Tr key={c.id}>
              <td colSpan={6} className="px-4 py-3">
                <form action={saveCategory} className="grid grid-cols-[64px_1fr_1fr_1fr_60px_auto] items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="sort" defaultValue={c.sort} className={`${inputCls} w-16`} />
                  <input name="name" defaultValue={c.name} className={inputCls} />
                  <input name="nameVi" defaultValue={c.nameVi ?? ''} className={inputCls} />
                  <input name="slug" defaultValue={c.slug} className={`${inputCls} font-mono text-xs`} />
                  <span className="text-right tabular-nums">{c._count.posts}</span>
                  <span className="flex justify-end gap-2">
                    <SubmitButton size="sm" variant="outline">
                      Save
                    </SubmitButton>
                    <ConfirmButton
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      formAction={deleteCategory}
                      confirm={`Delete ${c.name}? Its ${c._count.posts} posts stay, without a topic.`}
                    >
                      Delete
                    </ConfirmButton>
                  </span>
                </form>
              </td>
            </Tr>
          ))}
        </tbody>
      </TableCard>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">New topic</h2>
        <form action={saveCategory} className="grid gap-2 sm:grid-cols-[64px_1fr_1fr_1fr_auto]">
          <input name="sort" placeholder="0" className={inputCls} />
          <input name="name" placeholder="Name (English)" required className={inputCls} />
          <input name="nameVi" placeholder="Tên tiếng Việt" className={inputCls} />
          <input name="slug" placeholder="slug (optional)" className={`${inputCls} font-mono text-xs`} />
          <SubmitButton>Add topic</SubmitButton>
        </form>
      </Card>
    </>
  );
}
