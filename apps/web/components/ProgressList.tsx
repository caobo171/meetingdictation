import Link from 'next/link';

import type { Progress } from '@prisma/client';

function href(p: Progress): { url: string; external: boolean } {
  if (p.key.startsWith('web:')) return { url: `/app/r/${p.key.slice(4)}`, external: false };
  return { url: p.url ?? '#', external: true };
}

function ago(d: Date): string {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function ProgressList({ items }: { items: Progress[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((p) => {
        const pct = Math.round((p.done / Math.max(1, p.total)) * 100);
        const link = href(p);
        return (
          <li key={p.id}>
            <Link
              href={link.url}
              target={link.external ? '_blank' : undefined}
              className="flex items-center gap-4 px-5 py-4 transition hover:bg-bg2/60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg">
                {p.source === 'web' ? '🎧' : p.site === 'youtube' ? '▶️' : p.site === 'loom' ? '🎥' : '🧩'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.title}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
                  <span className="rounded-md bg-bg2 px-1.5 py-0.5 font-semibold text-ink-2">
                    {p.source === 'web' ? 'Website' : `Extension${p.site ? ` · ${p.site}` : ''}`}
                  </span>
                  <span>{p.done} of {p.total} sentences</span>
                  <span>·</span>
                  <span>{ago(p.updatedAt)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg2">
                  <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="hidden text-sm font-bold text-ink-2 sm:block">{pct}%</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
