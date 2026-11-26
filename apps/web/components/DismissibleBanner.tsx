'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  info: 'bg-primary/10 text-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-foreground',
};

export function DismissibleBanner({
  id,
  level,
  message,
  linkUrl,
  linkLabel,
}: {
  id: string;
  level: string;
  message: string;
  linkUrl: string | null;
  linkLabel: string | null;
}) {
  const key = `announcement-dismissed:${id}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(key)) setHidden(true);
    } catch {
      // Storage blocked: keep showing it.
    }
  }, [key]);
  if (hidden) return null;
  return (
    <div className={cn('flex items-center gap-3 px-4 py-2 text-sm', TONE[level] ?? TONE.info)} role="status">
      <p className="mx-auto max-w-5xl flex-1 text-center">
        {message}
        {linkUrl && (
          <a href={linkUrl} className="ml-2 font-medium underline underline-offset-4">
            {linkLabel || 'Learn more'}
          </a>
        )}
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded p-1 opacity-70 hover:opacity-100"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(key, '1');
          } catch {
            // ignore
          }
        }}
      >
        <XMarkIcon className="size-4" />
      </button>
    </div>
  );
}
