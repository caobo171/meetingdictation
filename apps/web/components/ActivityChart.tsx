'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const fmt = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Sentences finished per day, today last. */
export function ActivityChart({ days }: { days: { day: string; segments: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.segments));
  return (
    <TooltipProvider delayDuration={80}>
      <div className="flex h-36 items-end gap-1.5 sm:gap-2">
        {days.map((d, i) => {
          const today = i === days.length - 1;
          return (
            <Tooltip key={d.day}>
              <TooltipTrigger asChild>
                <div className="group flex h-full flex-1 cursor-default flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={cn(
                        'w-full rounded-[4px] transition-colors',
                        d.segments ? (today ? 'bg-primary' : 'bg-primary/60 group-hover:bg-primary/80') : 'bg-muted group-hover:bg-muted-foreground/20',
                      )}
                      style={{ height: d.segments ? `${Math.max(8, (d.segments / max) * 100)}%` : '4px' }}
                    />
                  </div>
                  <span className={cn('text-[10px] tabular-nums', today ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                    {d.day.slice(8)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-medium">{fmt.format(new Date(`${d.day}T00:00:00Z`))}</span>
                <span className="ml-2 text-background/70">
                  {d.segments} {d.segments === 1 ? 'sentence' : 'sentences'}
                </span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
