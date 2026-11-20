/**
 * Content-script side of sync. Every call goes through the background worker
 * and fails soft: no connection, or an extension reloaded under the page,
 * just means "practise locally".
 */
import type { Results } from '@md/core';

export interface RemoteProgress {
  fp: string;
  index: number;
  results: Results;
}

async function send<T>(msg: unknown): Promise<T | null> {
  try {
    return ((await chrome.runtime.sendMessage(msg)) as T) ?? null;
  } catch {
    return null;
  }
}

export async function accountEmail(): Promise<string | null> {
  return (await send<{ email: string | null }>({ type: 'md-status' }))?.email ?? null;
}

export function openConnect(): void {
  void send({ type: 'md-open-connect' });
}

export async function pullProgress(key: string): Promise<RemoteProgress | null> {
  return (await send<{ progress: RemoteProgress | null }>({ type: 'md-pull', key }))?.progress ?? null;
}

export async function pushProgress(payload: Record<string, unknown>): Promise<boolean> {
  const r = await send<{ progress?: unknown; error?: string }>({ type: 'md-push', payload });
  return !!r?.progress;
}

export function onAuthChange(fn: () => void): void {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && 'mdAuth' in changes) fn();
    });
  } catch {
    /* not in an extension context (tests, preview) */
  }
}
