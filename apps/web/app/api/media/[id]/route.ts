import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import { db } from '@/lib/db';
import { currentUserId } from '@/lib/session';

export const runtime = 'nodejs';

/** The owner's uploaded recording, with Range support so the player can seek. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const rec = await db.recording.findFirst({ where: { id: params.id, userId } });
  if (!rec?.mediaPath) return new Response('Not found', { status: 404 });

  const root = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
  const file = path.resolve(root, rec.mediaPath);
  if (!file.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
  const { size } = await stat(file);
  const type = rec.mediaType ?? 'application/octet-stream';

  const range = req.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' },
  });
}
