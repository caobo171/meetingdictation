import Link from 'next/link';

import { Logo } from '@/components/Logo';

export const metadata = {
  title: 'Privacy policy',
  description: 'What MeetingDictation and its browser extension collect, why, and how to delete it.',
};

const UPDATED = '25 November 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6">
          <Link href="/">
            <Logo size={24} />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
          <p className="text-sm text-muted-foreground">Last updated {UPDATED}</p>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            MeetingDictation helps you practise listening by typing what you hear in recorded meetings and videos. It is made
            of this website and the MeetingDictation browser extension. This page explains what each one handles. We do not
            sell your data, show ads, or use your data to train AI models.
          </p>
        </div>

        <Section title="The browser extension">
          <p>
            The extension runs only on the video pages it is built for: Loom share and embed pages, YouTube, Microsoft Teams
            and Microsoft Stream on SharePoint, and on any other tab where you click its toolbar button. On those pages it
            reads the video’s own transcript or captions, which your browser already has access to, and hides them so you can
            type them yourself.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-foreground">Stored on your device</span> (Chrome’s extension storage): your
              answers and progress on each video, your settings (keys, skip time, panel size) and, if you connect it, a token
              for your MeetingDictation account.
            </li>
            <li>
              <span className="font-medium text-foreground">Sent to meetingdictation.com, only if you connect the extension to
              an account</span>: the title and address of the video you practise, the site it is on, your answers per
              sentence, scores, and how long you practised. This is what lets your progress and streak follow you across
              devices.
            </li>
            <li>
              <span className="font-medium text-foreground">Never collected</span>: the audio or video itself, your browsing
              history, pages other than the supported video pages, or anything on a page you did not open the extension on.
              Transcripts are read from the page and stay in your browser.
            </li>
          </ul>
          <p>
            Without an account the extension works entirely on your device and sends nothing to us.
          </p>
        </Section>

        <Section title="Your account on the website">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Your email address, your name if you give one, and your Google profile picture if you sign in with Google.</li>
            <li>A password hash if you set a password, or one-time sign-in codes (stored only as hashes).</li>
            <li>Recordings and transcripts you upload or link, and your practice progress, streak and activity per day.</li>
            <li>The browsers you connected the extension from, so you can disconnect them in Settings.</li>
          </ul>
        </Section>

        <Section title="Payments">
          <p>
            Pro plans are sold through{' '}
            <a className="font-medium text-primary underline-offset-4 hover:underline" href="https://polar.sh/legal/privacy">
              Polar
            </a>
            , who act as the merchant of record and handle your card details. We never see your card number. We keep only
            whether you have Pro, until when, and Polar’s customer and subscription ids.
          </p>
        </Section>

        <Section title="Services we use">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Amazon Web Services (SES) to email sign-in codes.</li>
            <li>Google, only if you choose to sign in with Google.</li>
            <li>Polar for payments.</li>
            <li>
              Ship or Die, a visit counter on the website’s pages (not in the extension), which records page visits for a
              hackathon leaderboard.
            </li>
          </ul>
          <p>Our servers and database are hosted in the European Union.</p>
        </Section>

        <Section title="Keeping and deleting your data">
          <p>
            We keep your data while your account exists. You can delete your account at any time in{' '}
            <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/app/settings">
              Settings
            </Link>
            ; that removes your account, uploaded recordings and all progress from our database. Removing the extension
            deletes everything it stored in your browser. Polar keeps payment records as the law requires.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions or requests about your data:{' '}
            <a className="font-medium text-primary underline-offset-4 hover:underline" href="mailto:meetingdictation@wele-learn.com">
              meetingdictation@wele-learn.com
            </a>
            .
          </p>
        </Section>
      </main>
    </div>
  );
}
