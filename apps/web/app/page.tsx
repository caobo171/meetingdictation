import { ArrowPathIcon, ArrowRightIcon, CheckBadgeIcon, CommandLineIcon, FireIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

import { auth } from '@/auth';
import { Logo, LogoMark } from '@/components/Logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const SITES = ['Loom', 'YouTube', 'Microsoft Teams', 'Zoom', 'Google Meet', 'Any captioned video'];

const STEPS = [
  {
    n: '1',
    title: 'Open a recording',
    body: 'A Loom from your team, a YouTube talk, or a Zoom / Teams / Meet recording with its transcript file.',
  },
  {
    n: '2',
    title: 'The transcript blurs',
    body: 'Captions blur, and the transcript turns into blanks, one per word. You only have your ears.',
  },
  {
    n: '3',
    title: 'Type what you hear',
    body: 'One sentence at a time. Enter checks it word by word; Enter again plays the next one.',
  },
];

const FEATURES = [
  { icon: CheckBadgeIcon, title: 'Fair grading', body: 'Case, punctuation and "uh, um" never count against you. "It\'s" = "it is", "two" = "2".' },
  { icon: CommandLineIcon, title: 'Hands stay on the keys', body: '1 plays, 2 / 3 skip back and forward, Enter checks. Hints give you the next word, not the answer.' },
  { icon: ArrowPathIcon, title: 'Synced everywhere', body: 'Practise in the browser extension or on the website; your progress follows your account.' },
  { icon: FireIcon, title: 'Streaks & history', body: 'Every sentence you finish counts toward today. See your accuracy and minutes over time.' },
];

function DemoCard() {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Sheree · 01:13</span>
        <span className="tabular-nums">Line 12 / 185 · 34%</span>
      </div>
      <div className="mb-4 space-y-2">
        {['Cool, thanks for doing this, Cal, for putting together', 'the Databricks dashboard. I had a few questions'].map((t) => (
          <p key={t} className="select-none text-sm text-muted-foreground blur-[5px]">
            {t}
          </p>
        ))}
      </div>
      <div className="rounded-lg bg-primary/5 p-3 text-[15px] leading-9">
        {[['Cool,', 'ok'], ['thanks', 'ok'], ['for', 'ok'], ['doing', 'ok'], ['this,', 'ok'], ['Cal.', 'ok'], ['data', 'bad'], ['brick', 'bad'], ['', 'empty'], ['', 'cur']].map(([w, k], i) => (
          <span
            key={i}
            className={
              'mr-1.5 inline-block min-w-[3.5ch] rounded-t border-b-2 px-1 leading-6 ' +
              (k === 'ok'
                ? 'border-success bg-success-soft text-success'
                : k === 'bad'
                  ? 'border-destructive bg-destructive-soft text-destructive line-through'
                  : k === 'cur'
                    ? 'w-16 border-primary bg-primary/15'
                    : 'w-20 border-muted-foreground/30 bg-muted')
            }
          >
            {w || '\u00a0'}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><kbd className="kbd">1</kbd> play</span>
        <span className="flex items-center gap-1.5"><kbd className="kbd">Enter</kbd> check</span>
        <span className="flex items-center gap-1.5"><kbd className="kbd">Alt H</kbd> hint</span>
      </div>
    </Card>
  );
}

export default async function Landing() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo size={26} />
          </Link>
          <nav className="flex items-center gap-2">
            {signedIn ? (
              <Button asChild size="sm">
                <Link href="/app">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <div>
          <Badge variant="outline" className="rounded-full px-3 py-1 font-normal text-muted-foreground">
            Listening practice for working English
          </Badge>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Your meetings are the best listening test you have.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            MeetingDictation turns the transcript of any recorded meeting into blanks and plays it back one sentence at a time.
            You type what you hear; it shows exactly which words you missed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={signedIn ? '/app' : '/signup'}>
                Start practising
                <ArrowRightIcon />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/app/extension">Get the browser extension</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Free · English recordings · your recordings stay private</p>
        </div>
        <DemoCard />
      </section>

      <section className="border-y bg-muted/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span className="font-medium text-foreground">Works where your meetings are</span>
          {SITES.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <Card key={s.n} className="p-6">
              <span className="flex size-8 items-center justify-center rounded-full border text-sm font-medium">{s.n}</span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-20 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-6">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <LogoMark size={44} className="mx-auto" />
        <h2 className="mt-5 text-3xl font-semibold tracking-tight">Ten minutes a day, on the English you actually hear at work.</h2>
        <Button asChild size="lg" className="mt-8">
          <Link href={signedIn ? '/app' : '/signup'}>Create your free account</Link>
        </Button>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <Logo size={20} />
          <span>© {new Date().getFullYear()} MeetingDictation</span>
        </div>
      </footer>
    </div>
  );
}
