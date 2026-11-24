'use client';

import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, PuzzlePieceIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

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

  const Icon = ({ icon: I, tone }: { icon: typeof CheckCircleIcon; tone: string }) => (
    <span className={`mx-auto flex size-12 items-center justify-center rounded-full ${tone}`}>
      <I className="size-6" />
    </span>
  );

  if (phase === 'done') {
    return (
      <div className="space-y-2">
        <Icon icon={CheckCircleIcon} tone="bg-success-soft text-success" />
        <h1 className="pt-2 text-xl font-semibold tracking-tight">Extension connected</h1>
        <p className="text-sm text-muted-foreground">
          Practice in the extension now syncs to <span className="font-medium text-foreground">{email}</span>. You can close this tab.
        </p>
        <div className="pt-4">
          <Button asChild>
            <Link href="/app">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (phase === 'missing') {
    return (
      <div className="space-y-2">
        <Icon icon={PuzzlePieceIcon} tone="bg-muted text-muted-foreground" />
        <h1 className="pt-2 text-xl font-semibold tracking-tight">We can’t see the extension</h1>
        <p className="text-sm text-muted-foreground">Install it in this browser, or reload it in chrome://extensions, then try again.</p>
        <div className="flex justify-center gap-2 pt-4">
          <Button asChild variant="outline">
            <Link href="/app/extension">How to install</Link>
          </Button>
          <Button onClick={() => location.reload()}>Try again</Button>
        </div>
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div className="space-y-2">
        <Icon icon={ExclamationTriangleIcon} tone="bg-destructive-soft text-destructive" />
        <h1 className="pt-2 text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">The extension answered, but connecting it failed.</p>
        <div className="pt-4">
          <Button onClick={() => location.reload()}>Try again</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ArrowPathIcon className="mx-auto size-8 animate-spin text-muted-foreground" />
      <h1 className="text-lg font-semibold tracking-tight">{phase === 'looking' ? 'Looking for the extension…' : 'Connecting…'}</h1>
    </div>
  );
}
