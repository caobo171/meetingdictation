import { ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

import { PageHeader } from '@/components/PageHeader';
import { ProgressList } from '@/components/ProgressList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Recordings' };

export default async function Recordings() {
  const user = await requireUser();
  const [progress, recordings] = await Promise.all([
    db.progress.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } }),
    db.recording.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  const started = new Set(progress.map((p) => p.key));
  const fresh = recordings.filter((r) => !started.has(`web:${r.id}`));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Recordings"
        description="Everything you have practised, here and in the extension."
        action={
          <Button asChild>
            <Link href="/app/new">
              <PlusIcon />
              New recording
            </Link>
          </Button>
        }
      />

      {fresh.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Not started yet</CardTitle>
            <CardDescription>Uploaded, waiting for your first sentence</CardDescription>
          </CardHeader>
          <ul className="divide-y border-t">
            {fresh.map((r) => (
              <li key={r.id}>
                <Link href={`/app/r/${r.id}`} className="group flex items-center justify-between gap-4 px-6 py-3.5 transition-colors hover:bg-muted/50">
                  <span className="truncate text-sm font-medium">{r.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                    {r.segmentCount} sentences
                    <ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>In progress</CardTitle>
          <CardDescription>{progress.length} {progress.length === 1 ? 'recording' : 'recordings'}</CardDescription>
        </CardHeader>
        {progress.length ? (
          <div className="border-t">
            <ProgressList items={progress} />
          </div>
        ) : (
          <CardContent className="text-sm text-muted-foreground">
            Nothing practised yet. Start with a new recording, or open a Loom, YouTube or Teams recording with the extension.
          </CardContent>
        )}
      </Card>
    </div>
  );
}
