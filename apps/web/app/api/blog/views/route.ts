import { db } from '@/lib/db';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id || id.length > 40) return new Response(null, { status: 400 });
  await db.blogPost.updateMany({ where: { id, status: 'published' }, data: { views: { increment: 1 } } });
  return new Response(null, { status: 204 });
}
