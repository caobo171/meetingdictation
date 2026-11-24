import {
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  FireIcon,
  PlusIcon,
  PuzzlePieceIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

import { ActivityChart } from '@/components/ActivityChart';
import { PageHeader } from '@/components/PageHeader';
import { ProgressList } from '@/components/ProgressList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboardStats } from '@/lib/progress';
import { requireUser } from '@/lib/session';
import { learnerToday } from '@/lib/today';

export const metadata = { title: 'Home' };

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: typeof FireIcon }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 sm:p-6 sm:pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        <div className="whitespace-nowrap text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default async function Dashboard() {
  const user = await requireUser();
  const s = await dashboardStats(user.id, learnerToday());
  const first = (user.name ?? '').split(' ')[0];
  const practisedToday = s.last14[13].segments > 0;
  const week = s.last14.slice(7).reduce((a, d) => a + d.segments, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={first ? `Welcome back, ${first}` : 'Welcome back'}
        description={practisedToday ? 'Today counts. Keep the streak going.' : 'A few sentences today keeps your streak going.'}
        action={
          <Button asChild>
            <Link href="/app/new">
              <PlusIcon />
              New recording
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Streak" value={`${s.streak} ${s.streak === 1 ? 'day' : 'days'}`} hint={practisedToday ? 'Practised today' : 'Not practised today yet'} icon={FireIcon} />
        <Stat label="Sentences" value={s.segments.toLocaleString()} hint={`${week} in the last 7 days`} icon={CheckCircleIcon} />
        <Stat label="Listening" value={`${s.minutes} min`} hint="Time played while practising" icon={ClockIcon} />
        <Stat
          label="Accuracy"
          value={s.segments ? `~${Math.round(s.accuracy * 10) * 10}%` : '—'}
          hint="Words right on the first try"
          icon={ChartBarIcon}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Sentences finished per day, last 14 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityChart days={s.last14} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Continue practising</CardTitle>
            <CardDescription>Pick up where you left off</CardDescription>
          </div>
          {s.progress.length > 6 && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/recordings">View all</Link>
            </Button>
          )}
        </CardHeader>
        {s.progress.length ? (
          <div className="border-t">
            <ProgressList items={s.progress.slice(0, 6)} />
          </div>
        ) : (
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {[
              { href: '/app/new', icon: RectangleStackIcon, title: 'Practise a recording here', body: 'Upload a meeting recording with its .vtt / .srt, or use a YouTube link.' },
              { href: '/app/extension', icon: PuzzlePieceIcon, title: 'Practise on Loom, YouTube and Teams', body: 'The browser extension turns the transcript on the page into blanks.' },
            ].map((x) => (
              <Link key={x.href} href={x.href} className="rounded-lg border border-dashed p-5 transition-colors hover:border-primary/50 hover:bg-muted/50">
                <x.icon className="size-5 text-primary" />
                <div className="mt-3 text-sm font-medium">{x.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{x.body}</p>
              </Link>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
