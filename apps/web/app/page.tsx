import Link from 'next/link';

import { auth } from '@/auth';
import { Logo, LogoMark } from '@/components/Logo';

const SITES = ['Loom', 'YouTube', 'Zoom', 'Microsoft Teams', 'Google Meet', 'Any captioned video'];

const STEPS = [
  {
    n: '1',
    title: 'Open a recording',
    body: 'A Loom from your team, a YouTube talk, or a Zoom / Teams / Meet recording with its transcript file.',
  },
  {
    n: '2',
    title: 'The transcript blurs',
    body: 'Captions and the transcript panel go out of focus. You only have your ears.',
  },
  {
    n: '3',
    title: 'Type what you hear',
    body: 'One sentence at a time. Enter checks it word by word; Enter again plays the next one.',
  },
];

const FEATURES = [
  { icon: '🎯', title: 'Fair grading', body: 'Case, punctuation and "uh, um" never count against you. "It\'s" = "it is", "two" = "2".' },
  { icon: '⌨️', title: 'Hands stay on the keys', body: '1 plays, 2 / 3 skip back and forward, Enter checks. Hints give you the next word, not the answer.' },
  { icon: '🔄', title: 'Synced everywhere', body: 'Practise in the browser extension or on the website; your progress follows your account.' },
  { icon: '🔥', title: 'Streaks & history', body: 'Every sentence you finish counts toward today. See your accuracy and minutes over time.' },
];

function DemoCard() {
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="mb-3 flex items-center justify-between text-xs text-ink-3">
        <span className="font-semibold text-brand">Sheree · 01:13</span>
        <span>Segment 12 / 185 · 34% done</span>
      </div>
      <div className="mb-4 space-y-2">
        {['Cool, thanks for doing this, Cal, for putting together', 'the Databricks dashboard. I had a few questions', 'about the retention numbers on the second tab.'].map((t) => (
          <p key={t} className="select-none text-[15px] text-ink-2 blur-[5px]">
            {t}
          </p>
        ))}
      </div>
      <div className="rounded-xl border-2 border-brand/50 bg-bg px-3.5 py-3 text-[15px]">
        cool thanks for doing this cal for putting together the data brick dashboard
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-ink align-middle" />
      </div>
      <p className="mt-3 text-[15px] leading-8">
        <span className="text-good">Cool, thanks for doing this, Cal, for putting together the</span>{' '}
        <span className="text-bad line-through opacity-80">data brick</span>{' '}
        <span className="tracking-widest text-ink-3">**********</span> <span className="text-good">dashboard.</span>
      </p>
      <div className="mt-3 flex gap-2 text-xs text-ink-3">
        <span className="kbd">1</span> play <span className="kbd">Enter</span> check <span className="kbd">Alt H</span> hint
      </div>
    </div>
  );
}

export default async function Landing() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/">
          <Logo size={34} />
        </Link>
        <nav className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/app" className="btn-primary">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn hidden text-ink-2 hover:text-ink sm:inline-flex">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary">
                Get started free
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-ink-2">
            <span className="h-2 w-2 rounded-full bg-gold" /> Listening practice for working English
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
            Your meetings are the <span className="text-brand">best listening test</span> you have.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
            MeetingDictation blurs the transcript of any recorded meeting and plays it back one sentence at a time.
            You type what you hear; it shows you exactly which words you missed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={signedIn ? '/app' : '/signup'} className="btn-primary px-6 py-3 text-base">
              Start practising
            </Link>
            <Link href="/extension" className="btn-ghost px-6 py-3 text-base">
              Get the browser extension
            </Link>
          </div>
          <p className="mt-6 text-sm text-ink-3">Free · works with English recordings · your recordings stay private</p>
        </div>
        <DemoCard />
      </section>

      <section className="border-y border-line bg-paper/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 text-sm font-semibold text-ink-3 sm:px-6">
          <span className="text-ink-2">Works where your meetings are:</span>
          {SITES.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">How it works</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-lg font-extrabold text-brand">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-ink-2">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-bg2/70">
        <div className="mx-auto grid max-w-6xl gap-5 px-4 py-20 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-3 font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <LogoMark size={56} className="mx-auto" />
        <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">Ten minutes a day, on the English you actually hear at work.</h2>
        <Link href={signedIn ? '/app' : '/signup'} className="btn-primary mt-8 px-7 py-3 text-base">
          Create your free account
        </Link>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-3 sm:px-6">
          <Logo size={22} />
          <span>© {new Date().getFullYear()} MeetingDictation</span>
        </div>
      </footer>
    </div>
  );
}
