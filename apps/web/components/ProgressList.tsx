import { ChevronRightIcon, ComputerDesktopIcon, PlayCircleIcon, UserGroupIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

import type { Progress } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { Progress as Bar } from '@/components/ui/progress';

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

const SITES: Record<string, { label: string; icon: typeof PlayCircleIcon }> = {
  youtube: { label: 'YouTube', icon: PlayCircleIcon },
  loom: { label: 'Loom', icon: VideoCameraIcon },
  teams: { label: 'Teams', icon: UserGroupIcon },
};

function where(p: Progress) {
  if (p.source === 'web') return { label: 'Website', icon: ComputerDesktopIcon };
  return SITES[p.site ?? ''] ?? { label: p.site ? p.site[0].toUpperCase() + p.site.slice(1) : 'Extension', icon: VideoCameraIcon };
}

/** Strip the browser-tab noise sites add to titles: "(3) Chat | … | Microsoft Teams". */
function cleanTitle(t: string): string {
  return t.replace(/^\(\d+\)\s*/, '').replace(/^Chat \| /, '').replace(/\s*[|–-]\s*(Microsoft Teams|YouTube|Loom)$/, '').trim() || t;
}

export function ProgressList({ items }: { items: Progress[] }) {
  return (
    <ul className="divide-y">
      {items.map((p) => {
        const pct = Math.round((p.done / Math.max(1, p.total)) * 100);
        const link = href(p);
        const site = where(p);
        return (
          <li key={p.id}>
            <Link
              href={link.url}
              target={link.external ? '_blank' : undefined}
              className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
                <site.icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{cleanTitle(p.title)}</span>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {site.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <Bar value={pct} className="h-1.5 max-w-xs" />
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {p.done}/{p.total} · {ago(p.updatedAt)}
                  </span>
                </div>
              </div>
              <span className="hidden w-10 text-right text-sm font-medium tabular-nums sm:block">{pct}%</span>
              <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
