import { createHash, randomBytes } from 'node:crypto';

import { db } from '@/lib/db';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function issueExtToken(userId: string, label?: string): Promise<string> {
  const token = `mdx_${randomBytes(32).toString('base64url')}`;
  await db.extToken.create({ data: { userId, tokenHash: hash(token), label } });
  return token;
}

/** User id for a `Authorization: Bearer mdx_…` header, or null. */
export async function userFromBearer(req: Request): Promise<string | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token.startsWith('mdx_')) return null;
  const row = await db.extToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.revokedAt) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.extToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return row.userId;
}
