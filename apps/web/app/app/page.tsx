import Link from 'next/link';

import { ProgressList } from '@/components/ProgressList';
import { dashboardStats } from '@/lib/progress';
import { requireUser } from '@/lib/session';
import { learnerToday } from '@/lib/today';

export const metadata = { title: 'Home' };

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm font-semibold text-ink-3">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold tracking-tight ${accent}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export default async function Dashboard() {
  const user = await requireUser();
  const today = learnerToday();
  const s = await dashboardStats(user.id, today);
  const max = Math.max(1, ...s.last14.map((d) => d.segments));
  const first = (user.name ?? '').split(' ')[0];
  const practisedToday = s.last14[13].segments > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{first ? `Hi ${first} 👋` : 'Welcome 👋'}</h1>
          <p className="mt-1 text-ink-2">
            {practisedToday ? 'Nice, today counts. Keep the streak warm.' : 'A few sentences today keeps your streak going.'}
          </p>
        </div>
        <Link href="/app/new" className="btn-primary">
          ➕ New recording
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Streak" value={`🔥 ${s.streak}`} hint={s.streak === 1 ? 'day' : 'days in a row'} accent="text-bad" />
        <Stat label="Sentences done" value={s.segments.toLocaleString()} accent="text-brand" />
        <Stat label="Listening" value={`${s.minutes} min`} hint="time played while practising" accent="text-ink" />
        <Stat
          label="Accuracy"
          value={s.segments ? `~${Math.round(s.accuracy * 10) * 10}%` : '–'}
          hint="words right on first try"
          accent="text-good"
        />
      </div>

      <div className="card mt-6 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Last 14 days</h2>
          <span className="text-xs text-ink-3">sentences finished per day</span>
        </div>
        <div className="mt-4 flex h-28 items-end gap-1.5">
          {s.last14.map((d, i) => (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${d.day}: ${d.segments} sentences`}>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-md ${i === 13 ? 'bg-brand' : d.segments ? 'bg-brand/40' : 'bg-bg2'}`}
                  style={{ height: `${Math.max(6, (d.segments / max) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-ink-3">{d.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-bold">Continue practising</h2>
          {s.progress.length > 6 && (
            <Link href="/app/recordings" className="text-sm font-semibold text-brand hover:underline">
              See all
            </Link>
          )}
        </div>
        {s.progress.length ? (
          <div className="mt-2">
            <ProgressList items={s.progress.slice(0, 6)} />
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Link href="/app/new" className="rounded-xl border-2 border-dashed border-line p-5 transition hover:border-brand">
              <div className="text-2xl">🎧</div>
              <div className="mt-2 font-bold">Practise a recording here</div>
              <p className="mt-1 text-sm text-ink-2">Upload a meeting recording with its .vtt / .srt, or use a YouTube link.</p>
            </Link>
            <Link href="/app/extension" className="rounded-xl border-2 border-dashed border-line p-5 transition hover:border-brand">
              <div className="text-2xl">🧩</div>
              <div className="mt-2 font-bold">Practise on Loom & YouTube</div>
              <p className="mt-1 text-sm text-ink-2">The browser extension blurs the transcript right on the page.</p>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
