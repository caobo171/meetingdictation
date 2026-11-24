'use client';

import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { startTransition, useActionState, useState, type FormEvent } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { requestCodeAction, verifyCodeAction, type CodeState } from './actions';

// React 19 clears a form after its `action` runs; submitting from onSubmit keeps what was typed.
function submitWith(action: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
}

/** Email-code sign-in: ask for a code, then type it. A first sign-in creates the account. */
export function CodeForm({ next, onUsePassword }: { next?: string; onUsePassword: () => void }) {
  const [requested, request, requesting] = useActionState<CodeState, FormData>(requestCodeAction, undefined);
  const [verified, verify, verifying] = useActionState<CodeState, FormData>(verifyCodeAction, undefined);
  // Going back to the email step after a code was sent.
  const [editing, setEditing] = useState(false);

  const email = verified?.email ?? requested?.email;
  const onCodeStep = !editing && requested?.step === 'code' && !!email;

  if (!onCodeStep) {
    const send = submitWith(request);
    return (
      <form
        action={request}
        onSubmit={(e) => {
          setEditing(false);
          send(e);
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="code-email">Email</Label>
          <Input id="code-email" name="email" type="email" autoComplete="email" placeholder="you@company.com" defaultValue={email} required autoFocus />
        </div>
        {requested?.error && (
          <Alert variant="destructive">
            <ExclamationTriangleIcon />
            <AlertDescription>{requested.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={requesting}>
          {requesting && <ArrowPathIcon className="animate-spin" />}
          {requesting ? 'Sending…' : 'Email me a code'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">No password needed. New here? The code creates your account.</p>
        <button
          type="button"
          onClick={onUsePassword}
          className="block w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Use a password instead
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <CheckCircleIcon />
        <AlertDescription>
          {requested?.resent ? 'We sent a new code to ' : 'We sent a 6-digit code to '}
          <span className="font-medium text-foreground">{email}</span>. It expires in 10 minutes.
        </AlertDescription>
      </Alert>

      {/* A plain action on purpose: React empties the code field after a wrong code, ready for the next one. */}
      <form action={verify} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next ?? ''} />
        <div className="space-y-2">
          <Label htmlFor="code">Sign-in code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\s*\d{3}\s?\d{3}\s*"
            maxLength={7}
            placeholder="123456"
            className="h-11 text-center font-mono text-lg tracking-[0.4em]"
            required
            autoFocus
          />
        </div>
        {verified?.error && (
          <Alert variant="destructive">
            <ExclamationTriangleIcon />
            <AlertDescription>{verified.error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={verifying}>
          {verifying && <ArrowPathIcon className="animate-spin" />}
          {verifying ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <form action={request} onSubmit={submitWith(request)}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="resend" value="1" />
          <button type="submit" disabled={requesting} className="underline underline-offset-4 hover:text-foreground disabled:opacity-50">
            {requesting ? 'Sending…' : 'Send a new code'}
          </button>
        </form>
        <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-4 hover:text-foreground">
          Use another email
        </button>
      </div>
    </div>
  );
}
