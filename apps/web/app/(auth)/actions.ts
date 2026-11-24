'use server';

import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { AuthError } from 'next-auth';
import { z } from 'zod';

import { signIn } from '@/auth';
import { db } from '@/lib/db';
import { sendLoginCode } from '@/lib/loginCode';

export type FormState = { error?: string } | undefined;
export type CodeState = { step: 'email' | 'code'; email?: string; error?: string; resent?: boolean } | undefined;

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === 'string' ? next : '';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/app';
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    await signIn('credentials', {
      email: form.get('email'),
      password: form.get('password'),
      redirectTo: safeNext(form.get('next')),
    });
  } catch (err) {
    if (err instanceof AuthError) return { error: 'That email and password do not match an account.' };
    throw err; // the redirect
  }
}

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Tell us your name').max(80),
  email: z.string().trim().toLowerCase().email('That email does not look right'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    name: form.get('name'),
    email: form.get('email'),
    password: form.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  const { name, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.passwordHash) return { error: 'An account with this email already exists. Sign in instead.' };
  const passwordHash = await bcrypt.hash(password, 12);
  if (existing) {
    // Signed up with Google before: add a password to the same account.
    await db.user.update({ where: { id: existing.id }, data: { passwordHash, name: existing.name ?? name } });
  } else {
    await db.user.create({ data: { name, email, passwordHash } });
  }
  await signIn('credentials', { email, password, redirectTo: safeNext(form.get('next')) });
}

export async function googleAction(form: FormData) {
  await signIn('google', { redirectTo: safeNext(form.get('next')) });
}

const emailSchema = z.string().trim().toLowerCase().email('That email does not look right').max(254);

async function clientIp(): Promise<string | null> {
  const h = await headers();
  // Behind Cloudflare and nginx: CF-Connecting-IP is the visitor, X-Real-IP is Cloudflare's edge.
  return h.get('cf-connecting-ip') ?? h.get('x-real-ip') ?? null;
}

/**
 * Step 1 of email-code sign-in. Always answers "check your inbox", whether or not the address has an account or is
 * over its hourly budget; the code is issued and mailed after the response is sent.
 */
export async function requestCodeAction(_: CodeState, form: FormData): Promise<CodeState> {
  const parsed = emailSchema.safeParse(form.get('email'));
  if (!parsed.success) return { step: 'email', error: parsed.error.issues[0]?.message };
  const email = parsed.data;
  const ip = await clientIp();
  after(() => sendLoginCode(email, ip).catch((e) => console.error('[login-code] send failed', e)));
  return { step: 'code', email, resent: form.get('resend') === '1' };
}

/** Step 2: the code from the email. */
export async function verifyCodeAction(state: CodeState, form: FormData): Promise<CodeState> {
  const email = emailSchema.safeParse(form.get('email'));
  if (!email.success) return { step: 'email', error: 'Start again with your email.' };
  try {
    await signIn('email-code', {
      email: email.data,
      code: String(form.get('code') ?? '').replace(/\s/g, ''),
      redirectTo: safeNext(form.get('next')),
    });
  } catch (err) {
    if (err instanceof AuthError) return { step: 'code', email: email.data, error: 'That code is wrong or has expired. Check the latest email, or send a new code.' };
    throw err; // the redirect
  }
  return state;
}
