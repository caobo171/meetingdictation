'use client';

import { useEffect } from 'react';

/** Counts one view per post per browser tab session; prefetches and bots without JS don't count. */
export function ViewBeacon({ id }: { id: string }) {
  useEffect(() => {
    const key = `blog-view:${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage blocked: count it anyway.
    }
    fetch('/api/blog/views', { method: 'POST', body: JSON.stringify({ id }), keepalive: true }).catch(() => {});
  }, [id]);
  return null;
}
