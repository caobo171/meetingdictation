'use client';

import { ArrowPathIcon, ArrowUpTrayIcon, ExclamationTriangleIcon, LinkIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type Kind = 'upload' | 'youtube';

export function NewRecordingForm() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('upload');
  const [paste, setPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    form.set('kind', kind);
    try {
      const res = await fetch('/api/recordings', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? 'Something went wrong.');
      router.push(`/app/r/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <CardContent className="space-y-5 pt-6">
          <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">
                <ArrowUpTrayIcon />
                Upload a recording
              </TabsTrigger>
              <TabsTrigger value="youtube">
                <LinkIcon />
                YouTube link
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="e.g. Weekly sync with the data team" />
          </div>

          {kind === 'upload' ? (
            <div className="space-y-2">
              <Label htmlFor="media">Recording (video or audio)</Label>
              <Input id="media" name="media" type="file" accept="video/*,audio/*" required className="cursor-pointer" />
              <p className="text-xs text-muted-foreground">MP4, WebM, MOV, MP3, M4A… up to 1 GB. Only you can play it.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="youtubeUrl">YouTube link</Label>
              <Input id="youtubeUrl" name="youtubeUrl" placeholder="https://www.youtube.com/watch?v=…" required />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="transcript">Transcript</Label>
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setPaste(!paste)}>
                {paste ? 'Upload a file instead' : 'Paste text instead'}
              </Button>
            </div>
            {paste ? (
              <Textarea
                id="transcript"
                name="transcriptText"
                required
                rows={7}
                className="font-mono text-xs"
                placeholder={'0:12\nSo in college, I was a government major,\n0:15\nwhich means I had to write a lot of papers.'}
              />
            ) : (
              <>
                <Input id="transcript" name="transcript" type="file" accept=".vtt,.srt,.txt,text/vtt" required className="cursor-pointer" />
                <p className="text-xs text-muted-foreground">.vtt, .srt or a plain-text transcript with timestamps.</p>
              </>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <ExclamationTriangleIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button className="w-full" disabled={busy}>
            {busy && <ArrowPathIcon className="animate-spin" />}
            {busy ? 'Preparing your sentences…' : 'Start practising'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
