'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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

  const tab = (k: Kind, label: string) => (
    <button
      type="button"
      onClick={() => setKind(k)}
      className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${kind === k ? 'bg-paper text-ink shadow-card' : 'text-ink-3 hover:text-ink'}`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="card mt-6 space-y-5 p-6">
      <div className="flex gap-1 rounded-xl bg-bg2 p-1">
        {tab('upload', '📁 Upload a recording')}
        {tab('youtube', '▶️ YouTube link')}
      </div>

      <div>
        <label className="label" htmlFor="title">Title</label>
        <input className="input" id="title" name="title" placeholder="e.g. Weekly sync with the data team" />
      </div>

      {kind === 'upload' ? (
        <div>
          <label className="label" htmlFor="media">Recording (video or audio)</label>
          <input
            id="media"
            name="media"
            type="file"
            accept="video/*,audio/*"
            required
            className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand"
          />
          <p className="mt-1.5 text-xs text-ink-3">MP4, WebM, MOV, MP3, M4A… up to 1 GB. Only you can play it.</p>
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="youtubeUrl">YouTube link</label>
          <input className="input" id="youtubeUrl" name="youtubeUrl" placeholder="https://www.youtube.com/watch?v=…" required />
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label mb-0">Transcript</span>
          <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => setPaste(!paste)}>
            {paste ? 'Upload a file instead' : 'Paste text instead'}
          </button>
        </div>
        {paste ? (
          <textarea
            name="transcriptText"
            required
            rows={7}
            className="input font-mono text-sm"
            placeholder={'0:12\nSo in college, I was a government major,\n0:15\nwhich means I had to write a lot of papers.'}
          />
        ) : (
          <input
            name="transcript"
            type="file"
            accept=".vtt,.srt,.txt,text/vtt"
            required
            className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand"
          />
        )}
      </div>

      {error && <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad">{error}</p>}
      <button className="btn-primary w-full py-3" disabled={busy}>
        {busy ? 'Preparing your sentences…' : 'Start practising'}
      </button>
    </form>
  );
}
