/**
 * A Teams recording's transcript, read from the API Microsoft Stream's own
 * player uses. Requests ride on the viewer's SharePoint sign-in, so this only
 * runs on a SharePoint page: Stream itself, or the frames Teams' Recap embeds.
 */

import type { Cue } from '@md/core';
import { rememberEntries } from './onetranscript';

/** "00:01:08.8614762" → 68.86 */
function offsetSeconds(t: string): number {
  const m = t.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}

/** `item` is the recording's drive item, `https://<host>/_api/v2.1/drives/<drive>/items/<item>`. */
export async function streamTranscript(item: string): Promise<{ cues: Cue[]; ids: string[]; label: string } | null> {
  const list = await fetch(`${item}/media/transcripts`, { credentials: 'include' });
  if (!list.ok) return null;
  type Meta = { id: string; isDefault?: boolean; languageTag?: string };
  const transcripts = ((await list.json()) as { value?: Meta[] }).value ?? [];
  const pick =
    transcripts.find((t) => t.languageTag?.startsWith('en') && t.isDefault) ??
    transcripts.find((t) => t.languageTag?.startsWith('en')) ??
    transcripts.find((t) => t.isDefault) ??
    transcripts[0];
  if (!pick) return null;
  const content = await fetch(`${item}/media/transcripts/${pick.id}/streamContent?format=json`, { credentials: 'include' });
  if (!content.ok) return null;
  type Entry = { id?: string; startOffset: string; endOffset: string; text: string; speakerDisplayName?: string };
  const entries = ((await content.json()) as { entries?: Entry[] }).entries ?? [];
  const rows = entries
    .map((e, k) => ({ id: e.id ?? String(k), start: offsetSeconds(e.startOffset), end: offsetSeconds(e.endOffset), text: e.text ?? '', speaker: e.speakerDisplayName || undefined }))
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.text.trim());
  if (!rows.length) return null;
  rememberEntries(rows); // the page's transcript list names its rows by these ids
  return {
    cues: rows.map(({ start, end, text, speaker }) => ({ start, end, text, speaker })),
    ids: rows.map((r) => r.id),
    label: `Teams transcript${pick.languageTag ? ` (${pick.languageTag})` : ''}`,
  };
}

/**
 * Teams names a recording by its SharePoint site and file id. Look up the
 * drive item behind it, and the Stream page that plays it on its own.
 */
export async function itemFromUniqueId(site: string, uniqueId: string): Promise<{ item: string; streamUrl: string } | null> {
  const res = await fetch(`${site}/_api/web/GetFileById('${encodeURIComponent(uniqueId)}')?$select=VroomDriveID,VroomItemID,ServerRelativeUrl`, {
    credentials: 'include',
    headers: { accept: 'application/json;odata=nometadata' },
  });
  if (!res.ok) return null;
  const f = (await res.json()) as { VroomDriveID?: string; VroomItemID?: string; ServerRelativeUrl?: string };
  if (!f.VroomDriveID || !f.VroomItemID) return null;
  const origin = new URL(site).origin;
  return {
    item: `${origin}/_api/v2.1/drives/${f.VroomDriveID}/items/${f.VroomItemID}`,
    streamUrl: `${site}/_layouts/15/stream.aspx?id=${encodeURIComponent(f.ServerRelativeUrl ?? '')}`,
  };
}
