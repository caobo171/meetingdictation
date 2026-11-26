import { rm } from 'node:fs/promises';
import path from 'node:path';

import type { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ConfirmButton } from '@/components/admin/ConfirmButton';
import { AdminHeader, Filters, PAGE, Pager, Stat, TableCard, Td, THead, Th, Tr, fmtDate, inputCls, pageOf } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { audit, requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

export const metadata = { title: 'Recordings' };

async function deleteRecording(form: FormData) {
  'use server';
  const admin = await requireAdmin();
  const rec = await db.recording.findUnique({ where: { id: String(form.get('id')) }, include: { user: { select: { email: true } } } });
  if (!rec) redirect('/admin/recordings');
  await db.recording.delete({ where: { id: rec.id } });
  await db.progress.deleteMany({ where: { userId: rec.userId, key: `web:${rec.id}` } });
  if (rec.mediaPath) {
    const root = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? './uploads');
    const file = path.resolve(root, rec.mediaPath);
    if (file.startsWith(root + path.sep)) await rm(file, { force: true });
  }
  await audit(admin, 'recording.delete', `Deleted the recording "${rec.title}" of ${rec.user.email}`, { type: 'user', id: rec.userId });
  revalidatePath('/admin/recordings');
  redirect(`/admin/recordings?msg=${encodeURIComponent(`Deleted “${rec.title}”.`)}`);
}

/** Recordings learners added on the website. Titles only: the media and transcripts stay private. */
export default async function AdminRecordings(props: { searchParams: Promise<{ q?: string; type?: string; page?: string; msg?: string }> }) {
  await requireAdmin();
  const sp = await props.searchParams;
  const page = pageOf(sp.page);
  const where: Prisma.RecordingWhereInput = {};
  if (sp.q) where.OR = [{ title: { contains: sp.q, mode: 'insensitive' } }, { user: { email: { contains: sp.q, mode: 'insensitive' } } }];
  if (sp.type === 'upload' || sp.type === 'youtube') where.sourceType = sp.type;

  const [total, recs, byType, extension] = await Promise.all([
    db.recording.count({ where }),
    db.recording.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: { id: true, title: true, sourceType: true, segmentCount: true, createdAt: true, user: { select: { id: true, email: true } } },
    }),
    db.recording.groupBy({ by: ['sourceType'], _count: true }),
    db.progress.groupBy({ by: ['site'], where: { source: 'extension' }, _count: true, orderBy: { _count: { site: 'desc' } }, take: 6 }),
  ]);
  const n = (t: string) => byType.find((b) => b.sourceType === t)?._count ?? 0;

  return (
    <>
      <AdminHeader title="Recordings" description="What learners practise on. Titles only; the media and transcripts stay private." />
      {sp.msg && <p className="rounded-lg border bg-card px-4 py-2.5 text-sm">{sp.msg}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Uploaded files" value={n('upload')} />
        <Stat label="YouTube links" value={n('youtube')} />
        <Stat
          label="Practised in the extension"
          value={extension.reduce((s, e) => s + e._count, 0)}
          hint={extension.map((e) => `${e.site ?? 'other'} ${e._count}`).join(' · ') || 'None yet'}
        />
      </div>
      <Filters>
        <input name="q" defaultValue={sp.q} placeholder="Title or owner email…" className={`${inputCls} w-64`} />
        <select name="type" defaultValue={sp.type ?? ''} className={inputCls}>
          <option value="">Uploads and YouTube</option>
          <option value="upload">Uploads</option>
          <option value="youtube">YouTube</option>
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </Filters>
      <TableCard empty={!recs.length && 'No recordings.'}>
        <THead>
          <Th>Title</Th>
          <Th>Owner</Th>
          <Th>Source</Th>
          <Th className="text-right">Sentences</Th>
          <Th>Added</Th>
          <Th />
        </THead>
        <tbody>
          {recs.map((r) => (
            <Tr key={r.id}>
              <Td className="max-w-sm truncate font-medium">{r.title}</Td>
              <Td>
                <Link href={`/admin/users/${r.user.id}`} className="text-muted-foreground hover:text-primary">
                  {r.user.email}
                </Link>
              </Td>
              <Td className="capitalize text-muted-foreground">{r.sourceType}</Td>
              <Td className="text-right tabular-nums">{r.segmentCount}</Td>
              <Td className="whitespace-nowrap text-muted-foreground">{fmtDate(r.createdAt)}</Td>
              <Td className="text-right">
                <form action={deleteRecording}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmButton size="sm" variant="outline" className="text-destructive" confirm={`Delete “${r.title}” and its file? The learner loses it.`}>
                    Delete
                  </ConfirmButton>
                </form>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} params={{ q: sp.q, type: sp.type }} base="/admin/recordings" />
    </>
  );
}
