'use server';

import bcrypt from 'bcryptjs';
import { AuthError } from 'next-auth';
import { z } from 'zod';

import { signIn } from '@/auth';
import { db } from '@/lib/db';

export type FormState = { error?: string } | undefined;

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
