import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function AdminHeader({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function TableCard({ children, empty }: { children: React.ReactNode; empty?: string | false }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
      {empty && <p className="p-10 text-center text-sm text-muted-foreground">{empty}</p>}
    </Card>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn('whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground', className)}>{children}</th>;
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>;
}

export const Tr = ({ children }: { children: React.ReactNode }) => <tr className="border-b last:border-0 hover:bg-muted/40">{children}</tr>;
export const THead = ({ children }: { children: React.ReactNode }) => (
  <thead className="border-b">
    <tr>{children}</tr>
  </thead>
);

const TONES: Record<string, 'success' | 'secondary' | 'destructive' | 'outline' | 'default'> = {
  paid: 'success',
  active: 'success',
  published: 'success',
  pro: 'success',
  lifetime: 'default',
  trialing: 'outline',
  trial: 'outline',
  pending: 'outline',
  scheduled: 'outline',
  past_due: 'destructive',
  refunded: 'destructive',
  canceled: 'secondary',
  draft: 'secondary',
  off: 'secondary',
  free: 'secondary',
  super_admin: 'default',
  admin: 'outline',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge variant={TONES[status] ?? 'secondary'}>{label ?? status.replace(/_/g, ' ')}</Badge>;
}

export function Filters({ children }: { children: React.ReactNode }) {
  return <form className="flex flex-wrap items-end gap-2">{children}</form>;
}

export const inputCls =
  'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Prev / next paging that keeps the other query parameters. */
export function Pager({ page, pages, total, params, base }: { page: number; pages: number; total: number; params: Record<string, string | undefined>; base: string }) {
  const href = (p: number) => {
    const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1] && e[0] !== 'page'));
    if (p > 1) s.set('page', String(p));
    const qs = s.toString();
    return `${base}${qs ? `?${qs}` : ''}`;
  };
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {total} total · page {page} of {pages}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link className="rounded-md border px-3 py-1.5 hover:bg-accent" href={href(page - 1)}>
            Previous
          </Link>
        )}
        {page < pages && (
          <Link className="rounded-md border px-3 py-1.5 hover:bg-accent" href={href(page + 1)}>
            Next
          </Link>
        )}
      </span>
    </div>
  );
}

/** A definition list row for detail pages. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 min-w-0 break-words">{children}</dd>
    </div>
  );
}

export const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
export const fmtDateTime = (d: Date | null | undefined) =>
  d ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '—';

export const PAGE = 25;
export const pageOf = (v: string | undefined) => Math.max(1, Number(v) || 1);
