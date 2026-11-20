'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { createExtensionToken } from '@/app/app/extension/actions';

type Phase = 'looking' | 'missing' | 'connecting' | 'done' | 'error';

/**
 * Handshake with the extension's content script on this page:
 *   page → { type: 'md-ping' }            extension → { type: 'md-pong' }
 *   page → { type: 'md-connect', token }  extension → { type: 'md-connected' }
 * The token is only minted after the extension has answered, and only posted to this same origin.
 */
export function ConnectClient({ email }: { email: string }) {
  const [phase, setPhase] = useState<Phase>('looking');

  useEffect(() => {
    let answered = false;
    const onMessage = async (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const msg = e.data as { type?: string };
      if (msg?.type === 'md-pong' && !answered) {
        answered = true;
        setPhase('connecting');
        try {
          const browser = navigator.userAgent.includes('Edg/') ? 'Edge' : navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser';
          const { token, email: em, name } = await createExtensionToken(browser);
          window.postMessage({ type: 'md-connect', token, email: em, name, app: location.origin }, location.origin);
        } catch {
          setPhase('error');
        }
      }
      if (msg?.type === 'md-connected') setPhase('done');
    };
    window.addEventListener('message', onMessage);
    const ping = () => window.postMessage({ type: 'md-ping' }, location.origin);
    ping();
    const retry = window.setInterval(ping, 500);
    const giveUp = window.setTimeout(() => {
      window.clearInterval(retry);
      if (!answered) setPhase('missing');
    }, 3500);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(retry);
      window.clearTimeout(giveUp);
    };
  }, []);

  if (phase === 'done') {
    return (
      <div>
        <div className="text-5xl">🎉</div>
        <h1 className="mt-3 text-2xl font-extrabold">Extension connected</h1>
        <p className="mt-2 text-ink-2">Practice on Loom and YouTube now syncs to <b>{email}</b>. You can close this tab.</p>
        <Link href="/app" className="btn-primary mt-6">Go to dashboard</Link>
      </div>
    );
  }
  if (phase === 'missing') {
    return (
      <div>
        <div className="text-5xl">🧩</div>
        <h1 className="mt-3 text-2xl font-extrabold">We can’t see the extension</h1>
        <p className="mt-2 text-ink-2">Install it in this browser first, then reload this page.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/app/extension" className="btn-ghost">How to install</Link>
          <button className="btn-primary" onClick={() => location.reload()}>Try again</button>
        </div>
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div>
        <h1 className="text-2xl font-extrabold">Something went wrong</h1>
        <button className="btn-primary mt-6" onClick={() => location.reload()}>Try again</button>
      </div>
    );
  }
  return (
    <div>
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-soft border-t-brand" />
      <h1 className="mt-4 text-xl font-extrabold">{phase === 'looking' ? 'Looking for the extension…' : 'Connecting…'}</h1>
    </div>
  );
}
