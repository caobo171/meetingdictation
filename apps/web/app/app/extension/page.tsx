import { ArrowDownTrayIcon, CommandLineIcon, InformationCircleIcon, LinkIcon, PlayCircleIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

import { ConnectedDevices } from '@/components/ConnectedDevices';
import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/session';

import manifest from '../../../../extension/manifest.json';

export const metadata = { title: 'Browser extension' };

// Built and zipped on every deploy by `npm run ext:pack` (apps/extension/pack.mjs).
const DOWNLOAD = '/downloads/meetingdictation-extension.zip';
const code = 'rounded bg-muted px-1.5 py-0.5 font-mono text-xs';

const STEPS = [
  <>Download the zip above and unzip it. You get a <code className={code}>meetingdictation-extension</code> folder; keep it somewhere it will stay.</>,
  <>Open <code className={code}>chrome://extensions</code> and switch on <b className="font-medium text-foreground">Developer mode</b>.</>,
  <>Click <b className="font-medium text-foreground">Load unpacked</b> and choose the <code className={code}>meetingdictation-extension</code> folder.</>,
  <>Pin MeetingDictation from the puzzle-piece menu, then connect it below.</>,
];

const USES = [
  { icon: PlayCircleIcon, title: 'Loom and YouTube', body: 'A Dictation button appears in the bottom-right corner of the video page.' },
  { icon: UserGroupIcon, title: 'Teams recordings', body: 'In the meeting’s Recap, or on the recording’s Stream page, with the full transcript.' },
  { icon: CommandLineIcon, title: 'Any other video', body: 'Click the toolbar icon, or press Alt Shift D. Load a .vtt / .srt for Zoom or Meet.' },
];

export default async function ExtensionPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Browser extension"
        description="Practise right on Loom, YouTube and Teams. The transcript on the page turns into blanks, and your progress lands here."
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Install</CardTitle>
            <CardDescription>Four steps, about a minute. Chrome, Edge, Brave and Arc.</CardDescription>
          </div>
          <Button asChild>
            <a href={DOWNLOAD} download>
              <ArrowDownTrayIcon />
              Download v{manifest.version}
            </a>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium text-foreground">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          <Alert>
            <InformationCircleIcon />
            <AlertDescription>The Chrome Web Store listing is coming soon. Until then, load it unpacked as above. To update, download the new zip, replace the folder, and press reload on the extension’s card.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Connect to your account</CardTitle>
            <CardDescription>So the sentences you finish in the extension count toward your streak.</CardDescription>
          </div>
          <Button asChild>
            <Link href="/extension/connect">
              <LinkIcon />
              Connect extension
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ConnectedDevices userId={user.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where it works</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {USES.map((u) => (
            <div key={u.title} className="space-y-1.5">
              <u.icon className="size-5 text-primary" />
              <div className="text-sm font-medium">{u.title}</div>
              <p className="text-sm text-muted-foreground">{u.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
