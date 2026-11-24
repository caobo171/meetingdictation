import 'server-only';

import crypto from 'node:crypto';

import { db } from '@/lib/db';
import { loginCodeMail, sendMail } from '@/lib/mail';

/**
 * Email sign-in codes, with WELE's rules:
 * - 6 digits, valid for 10 minutes, 5 attempts per code, then the code is dead.
 * - Only the NEWEST unused code for an address can be redeemed, so asking again supersedes the old one.
 * - Counting an attempt and redeeming are single conditional UPDATEs: parallel requests cannot pass the cap or
 *   redeem one code twice.
 * - The hash is salted with the row id and the address, so a leaked table is not 10^6 guesses from every code.
 * - At most 5 codes per address and 20 per IP in a rolling hour. A third party can use up an address's budget and
 *   delay its owner's code by up to an hour; password and Google sign-in still work meanwhile.
 */
export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
const MAX_PER_EMAIL_PER_HOUR = 5;
const MAX_PER_IP_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

const hash = (id: string, email: string, code: string) => crypto.createHash('sha256').update(`${id}:${email}:${code}`).digest('hex');

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Issues a code and mails it, unless the address or IP is over its hourly budget. The caller replies the same way
 * either way, so the response says nothing about whether the address has an account or was rate limited.
 */
export async function sendLoginCode(email: string, ip: string | null): Promise<void> {
  const since = new Date(Date.now() - HOUR_MS);
  const [forEmail, forIp] = await Promise.all([
    db.loginCode.count({ where: { email, createdAt: { gt: since } } }),
    ip ? db.loginCode.count({ where: { ip, createdAt: { gt: since } } }) : Promise.resolve(0),
  ]);
  if (forEmail >= MAX_PER_EMAIL_PER_HOUR || forIp >= MAX_PER_IP_PER_HOUR) {
    console.warn('[login-code] over budget, not sending', JSON.stringify({ forEmail, forIp }));
    return;
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const id = crypto.randomUUID();
  await db.loginCode.create({
    data: { id, email, codeHash: hash(id, email, code), expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000), ip },
  });
  await sendMail(loginCodeMail(email, code, CODE_TTL_MINUTES));
}

/** True exactly once for the newest live code of this address. */
export async function redeemLoginCode(email: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const now = new Date();
  const row = await db.loginCode.findFirst({ where: { email, usedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!row || row.expiresAt <= now) return false;

  // Count the attempt first; zero rows changed means the cap was already reached.
  const counted = await db.loginCode.updateMany({
    where: { id: row.id, usedAt: null, attempts: { lt: CODE_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1) return false;
  if (!sameHash(row.codeHash, hash(row.id, email, code))) return false;

  const redeemed = await db.loginCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  return redeemed.count === 1;
}
