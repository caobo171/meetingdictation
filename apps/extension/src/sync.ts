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

export function openCards(): void {
  void send({ type: 'md-open-cards' });
}

export async function pullProgress(key: string): Promise<RemoteProgress | null> {
  return (await send<{ progress: RemoteProgress | null }>({ type: 'md-pull', key }))?.progress ?? null;
}

export async function pushProgress(payload: Record<string, unknown>): Promise<boolean> {
  const r = await send<{ progress?: unknown; error?: string }>({ type: 'md-push', payload });
  return !!r?.progress;
}

/** An AI explanation of a sentence, as the website returns it on a card. */
export interface Explanation {
  meaning: string;
  focus: string;
  phrases: { text: string; meaning: string }[];
  listening: string;
}

export interface RemoteCard {
  id: string;
  focus: string | null;
  explanation: Explanation | null;
}

/**
 * Flashcards on the account: { action: "miss" | "explain", ...sentence }. The
 * error is "not-connected" when no account is connected.
 */
export async function cardRequest(payload: Record<string, unknown>): Promise<{ card?: RemoteCard | null; error?: string }> {
  return (await send<{ card?: RemoteCard | null; error?: string }>({ type: 'md-card', payload })) ?? { error: 'The extension could not reach the website.' };
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
