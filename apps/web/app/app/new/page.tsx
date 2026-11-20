import { NewRecordingForm } from './NewRecordingForm';

export const metadata = { title: 'New recording' };

export default function NewRecording() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold tracking-tight">New recording</h1>
      <p className="mt-1 text-ink-2">Bring a recording and its transcript. We split it into sentences for you to dictate.</p>
      <NewRecordingForm />
      <div className="card mt-6 p-5 text-sm text-ink-2">
        <h2 className="font-bold text-ink">Where to get the transcript</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li><b>Zoom</b>: Recordings → your meeting → download the <i>Audio transcript</i> (.vtt).</li>
          <li><b>Microsoft Teams</b>: open the recording → Transcript → Download → .vtt.</li>
          <li><b>Loom</b>: the Transcript tab → Download (.srt), or copy the transcript and paste it here.</li>
          <li><b>YouTube</b>: under the video, <i>…more</i> → <i>Show transcript</i>, select it all, copy, and paste it here.</li>
          <li>Practising on Loom or YouTube directly? The <a className="font-semibold text-brand hover:underline" href="/app/extension">browser extension</a> needs no file at all.</li>
        </ul>
      </div>
    </div>
  );
}
