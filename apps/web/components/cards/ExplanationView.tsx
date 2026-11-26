import { SpeakerWaveIcon } from '@heroicons/react/24/outline';

import { cn } from '@/lib/utils';

import type { Explanation } from './client';

/** An AI explanation of one sentence: what it means here, the phrase asked about, phrases to keep, and a listening tip. */
export function ExplanationView({ e, focus, className }: { e: Explanation; focus?: string | null; className?: string }) {
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed', className)}>
      <p>{e.meaning}</p>
      {focus && e.focus && (
        <div className="rounded-md border-l-2 border-primary bg-primary/5 px-3 py-2">
          <div className="font-medium">“{focus}”</div>
          <p className="mt-0.5 text-muted-foreground">{e.focus}</p>
        </div>
      )}
      {e.phrases.length > 0 && (
        <dl className="grid gap-1.5">
          {e.phrases.map((p) => (
            <div key={p.text} className="flex flex-wrap gap-x-2">
              <dt className="font-medium">{p.text}</dt>
              <dd className="text-muted-foreground">{p.meaning}</dd>
            </div>
          ))}
        </dl>
      )}
      {e.listening && (
        <p className="flex gap-2 text-muted-foreground">
          <SpeakerWaveIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{e.listening}</span>
        </p>
      )}
    </div>
  );
}
