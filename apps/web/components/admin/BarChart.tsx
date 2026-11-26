import { cn } from '@/lib/utils';

/** Daily bars, oldest first, the last bar (today) emphasised. Hover shows the day and value. */
export function BarChart({ data, format = String, className }: { data: { day: string; value: number }[]; format?: (n: number) => string; className?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex h-32 items-end gap-[3px]">
        {data.map((d, i) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${d.day}: ${format(d.value)}`}>
            <div
              className={cn(
                'w-full rounded-[3px]',
                d.value ? (i === data.length - 1 ? 'bg-primary' : 'bg-primary/55 group-hover:bg-primary/80') : 'bg-muted',
              )}
              style={{ height: d.value ? `${Math.max(6, (d.value / max) * 100)}%` : '3px' }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{data[0]?.day.slice(5)}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}

/** The last `n` UTC days as YYYY-MM-DD, oldest first. */
export function lastDays(n: number): string[] {
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  return Array.from({ length: n }, (_, i) => new Date(today - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
}
