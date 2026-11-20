import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildSegments, hasWords, parseSubtitleFile } from '@md/core';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { currentUserId } from '@/lib/session';
import { youTubeId } from '@/lib/youtube';

export const runtime = 'nodejs';

const MAX_MEDIA = 1024 * 1024 * 1024; // 1 GB
const MAX_TRANSCRIPT = 5 * 1024 * 1024;

const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return bad('Sign in first.', 401);

  const form = await req.formData();
  const kind = String(form.get('kind') ?? '');
  const title = String(form.get('title') ?? '').trim().slice(0, 200);

  // Transcript: a file, or text pasted from YouTube's / Loom's transcript panel.
  let transcript = '';
  const tFile = form.get('transcript');
  if (tFile instanceof File && tFile.size > 0) {
    if (tFile.size > MAX_TRANSCRIPT) return bad('That transcript file is too big.');
    transcript = await tFile.text();
  } else {
    transcript = String(form.get('transcriptText') ?? '');
  }
  const cues = parseSubtitleFile(transcript);
  const segments = buildSegments(cues).filter((s) => hasWords(s.text));
  if (!segments.length) {
    return bad('We could not find timed lines in that transcript. Use a .vtt / .srt file, or paste lines that start with a time like 0:12.');
  }

  if (kind === 'youtube') {
    const url = String(form.get('youtubeUrl') ?? '');
    const id = youTubeId(url);
    if (!id) return bad('That does not look like a YouTube video link.');
    const rec = await db.recording.create({
      data: {
        userId,
        title: title || 'YouTube video',
        sourceType: 'youtube',
        sourceUrl: `https://www.youtube.com/watch?v=${id}`,
        cues: JSON.stringify(cues),
        segmentCount: segments.length,
      },
    });
    return NextResponse.json({ id: rec.id });
  }

  if (kind === 'upload') {
    const media = form.get('media');
    if (!(media instanceof File) || media.size === 0) return bad('Choose the recording file (video or audio).');
    if (media.size > MAX_MEDIA) return bad('Recordings up to 1 GB are supported.');
    if (!/^(audio|video)\//.test(media.type)) return bad('That file is not audio or video.');
    const ext = (path.extname(media.name) || (media.type.startsWith('audio') ? '.mp3' : '.mp4')).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const dir = path.resolve(process.env.UPLOAD_DIR ?? './uploads', userId);
    await mkdir(dir, { recursive: true });
    const file = `${randomUUID()}${ext}`;
    await writeFile(path.join(dir, file), Buffer.from(await media.arrayBuffer()));
    const rec = await db.recording.create({
      data: {
        userId,
        title: title || media.name.replace(/\.[^.]+$/, ''),
        sourceType: 'upload',
        mediaPath: path.join(userId, file),
        mediaType: media.type,
        cues: JSON.stringify(cues),
        segmentCount: segments.length,
      },
    });
    return NextResponse.json({ id: rec.id });
  }

  return bad('Choose an upload or a YouTube link.');
}
