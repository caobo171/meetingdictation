import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { ConfirmButton, SubmitButton } from '@/components/admin/ConfirmButton';
import { AdminHeader, StatusBadge, fmtDate, inputCls } from '@/components/admin/ui';
import { Card } from '@/components/ui/card';
import { audit, requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

export const metadata = { title: 'Announcements' };

const go = (msg: string): never => {
  revalidatePath('/', 'layout');
  redirect(`/admin/announcements?msg=${encodeURIComponent(msg)}`);
};

const schema = z.object({
  id: z.string().optional(),
  message: z.string().trim().min(3).max(300),
  linkUrl: z.string().trim().max(300).refine((v) => !v || /^(https?:\/\/|\/)/.test(v), 'must start with https:// or /'),
  linkLabel: z.string().trim().max(40),
  level: z.enum(['info', 'success', 'warning']),
  startsAt: z.string(),
  endsAt: z.string(),
});

async function saveAnnouncement(form: FormData) {
  'use server';
  const admin = await requireAdmin();
  const p = schema.safeParse(Object.fromEntries(form));
  if (!p.success) go(`Check the announcement: ${p.error.issues[0].path.join('.')} ${p.error.issues[0].message}`);
  const v = p.data!;
  const data = {
    message: v.message,
    linkUrl: v.linkUrl || null,
    linkLabel: v.linkLabel || null,
    level: v.level,
    public: form.get('public') === 'on',
    active: form.get('active') === 'on',
    startsAt: v.startsAt ? new Date(`${v.startsAt}T00:00:00Z`) : null,
    endsAt: v.endsAt ? new Date(`${v.endsAt}T23:59:59Z`) : null,
  };
  const a = v.id ? await db.announcement.update({ where: { id: v.id }, data }) : await db.announcement.create({ data });
  await audit(admin, v.id ? 'announcement.update' : 'announcement.create', `${v.id ? 'Edited' : 'Posted'} announcement “${a.message.slice(0, 60)}”`, {
    type: 'announcement',
    id: a.id,
  });
  go('Announcement saved.');
}

async function deleteAnnouncement(form: FormData) {
  'use server';
  const admin = await requireAdmin();
  const a = await db.announcement.delete({ where: { id: String(form.get('id')) } });
  await audit(admin, 'announcement.delete', `Deleted announcement “${a.message.slice(0, 60)}”`, { type: 'announcement', id: a.id });
  go('Announcement deleted.');
}

type A = Awaited<ReturnType<typeof db.announcement.findMany>>[number];

function AnnouncementForm({ a }: { a?: A }) {
  const day = (d: Date | null | undefined) => d?.toISOString().slice(0, 10);
  return (
    <form action={saveAnnouncement} className="grid gap-3">
      {a && <input type="hidden" name="id" value={a.id} />}
      <textarea name="message" required rows={2} defaultValue={a?.message} placeholder="What learners should know…" className={`${inputCls} h-auto py-2`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input name="linkUrl" defaultValue={a?.linkUrl ?? ''} placeholder="Link (optional)" className={inputCls} />
        <input name="linkLabel" defaultValue={a?.linkLabel ?? ''} placeholder="Link text" className={inputCls} />
        <label className="grid gap-1 text-xs text-muted-foreground">
          From
          <input type="date" name="startsAt" defaultValue={day(a?.startsAt)} className={inputCls} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Until
          <input type="date" name="endsAt" defaultValue={day(a?.endsAt)} className={inputCls} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <select name="level" defaultValue={a?.level ?? 'info'} className={inputCls}>
          <option value="info">Info</option>
          <option value="success">Good news</option>
          <option value="warning">Warning</option>
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={a?.active ?? true} /> Live
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="public" defaultChecked={a?.public ?? false} /> Also on the public site
        </label>
        <span className="ml-auto flex gap-2">
          <SubmitButton size="sm">{a ? 'Save' : 'Post announcement'}</SubmitButton>
          {a && (
            <ConfirmButton size="sm" variant="outline" className="text-destructive" formAction={deleteAnnouncement} confirm="Delete this announcement?">
              Delete
            </ConfirmButton>
          )}
        </span>
      </div>
    </form>
  );
}

export default async function AdminAnnouncements(props: { searchParams: Promise<{ msg?: string }> }) {
  await requireAdmin();
  const { msg } = await props.searchParams;
  const items = await db.announcement.findMany({ orderBy: { createdAt: 'desc' } });
  const now = new Date();

  return (
    <>
      <AdminHeader title="Announcements" description="A banner across the top of the app, and of the public site if you tick it. Learners can dismiss it." />
      {msg && <p className="rounded-lg border bg-card px-4 py-2.5 text-sm">{msg}</p>}
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">New announcement</h2>
        <AnnouncementForm />
      </Card>
      {items.map((a) => {
        const live = a.active && (!a.startsAt || a.startsAt <= now) && (!a.endsAt || a.endsAt > now);
        const state = !a.active ? 'off' : live ? 'active' : a.startsAt && a.startsAt > now ? 'scheduled' : 'canceled';
        return (
          <Card key={a.id} className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge status={state} label={!a.active ? 'off' : live ? 'live' : a.startsAt && a.startsAt > now ? 'scheduled' : 'ended'} />
              {a.public && <StatusBadge status="outline" label="public" />}
              <span>Posted {fmtDate(a.createdAt)}</span>
            </div>
            <AnnouncementForm a={a} />
          </Card>
        );
      })}
    </>
  );
}
