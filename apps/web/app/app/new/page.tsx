import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { NewRecordingForm } from './NewRecordingForm';

export const metadata = { title: 'New recording' };

const SOURCES = [
  { name: 'Zoom', how: 'Recordings → your meeting → download the Audio transcript (.vtt).' },
  { name: 'Microsoft Teams', how: 'Open the recording → Transcript → Download → .vtt.' },
  { name: 'Loom', how: 'The Transcript tab → Download (.srt), or copy the transcript and paste it here.' },
  { name: 'YouTube', how: 'Under the video, …more → Show transcript, select it all, copy, and paste it here.' },
];

export default function NewRecording() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New recording" description="Bring a recording and its transcript. We split it into sentences for you to dictate." />
      <NewRecordingForm />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where to get the transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y text-sm">
            {SOURCES.map((s) => (
              <div key={s.name} className="grid gap-1 py-2.5 first:pt-0 sm:grid-cols-[140px_1fr]">
                <dt className="font-medium">{s.name}</dt>
                <dd className="text-muted-foreground">{s.how}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">
            Practising on Loom, YouTube or Teams? The{' '}
            <a className="font-medium text-primary underline-offset-4 hover:underline" href="/app/extension">
              browser extension
            </a>{' '}
            needs no file at all.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
