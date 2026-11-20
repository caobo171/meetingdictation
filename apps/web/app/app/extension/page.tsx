import Link from 'next/link';

import { ConnectedDevices } from '@/components/ConnectedDevices';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Browser extension' };

const STEPS = [
  'Download the extension folder (or build it: npm run ext in the repo → apps/extension).',
  'Open chrome://extensions and switch on Developer mode (top right).',
  'Click Load unpacked and choose the apps/extension folder.',
  'Pin MeetingDictation from the puzzle-piece menu, then come back here and press Connect.',
];

export default async function ExtensionPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Browser extension</h1>
      <p className="mt-1 text-ink-2">
        Practise right on Loom, YouTube and any captioned video. The transcript blurs on the page, and your progress lands here.
      </p>

      <div className="card mt-6 p-6">
        <h2 className="font-bold">1 · Install</h2>
        <ol className="mt-3 space-y-2.5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3 text-ink-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-xl bg-gold-soft px-4 py-3 text-sm text-ink-2">
          Chrome Web Store listing coming soon. Until then, load it unpacked as above.
        </p>
      </div>

      <div className="card mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">2 · Connect it to your account</h2>
            <p className="mt-1 text-sm text-ink-2">So the sentences you finish on Loom and YouTube count toward your streak.</p>
          </div>
          <Link href="/extension/connect" className="btn-primary">Connect extension</Link>
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <ConnectedDevices userId={user.id} />
        </div>
      </div>

      <div className="card mt-6 p-6 text-sm text-ink-2">
        <h2 className="font-bold text-ink">Using it</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><b>Loom / YouTube</b>: a <i>Dictation</i> button appears bottom-right on the video page.</li>
          <li><b>Any other video</b>: click the toolbar icon, or press <span className="kbd">Alt Shift D</span>.</li>
          <li><b>Zoom / Teams / Meet</b> recordings: in the panel, <i>Load .vtt / .srt</i> with the downloaded transcript.</li>
        </ul>
      </div>
    </div>
  );
}
