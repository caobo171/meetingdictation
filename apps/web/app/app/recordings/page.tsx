import Link from 'next/link';

import { ProgressList } from '@/components/ProgressList';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Recordings' };

export default async function Recordings() {
  const user = await requireUser();
  const [progress, unstarted] = await Promise.all([
    db.progress.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } }),
    db.recording.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  const started = new Set(progress.map((p) => p.key));
  const fresh = unstarted.filter((r) => !started.has(`web:${r.id}`));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Recordings</h1>
        <Link href="/app/new" className="btn-primary">➕ New recording</Link>
      </div>
      {fresh.length > 0 && (
        <div className="card mt-6 p-5">
          <h2 className="font-bold">Not started yet</h2>
          <ul className="mt-3 space-y-2">
            {fresh.map((r) => (
              <li key={r.id}>
                <Link href={`/app/r/${r.id}`} className="flex items-center justify-between rounded-xl bg-bg2/60 px-4 py-3 hover:bg-bg2">
                  <span className="font-semibold">{r.title}</span>
                  <span className="text-sm text-ink-3">{r.segmentCount} sentences →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card mt-6 overflow-hidden">
        {progress.length ? (
          <ProgressList items={progress} />
        ) : (
          <p className="p-6 text-ink-2">Nothing practised yet. Start with a new recording, or open a Loom / YouTube video with the extension.</p>
        )}
      </div>
    </div>
  );
}
