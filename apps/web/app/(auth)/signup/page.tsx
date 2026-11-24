import { redirect } from 'next/navigation';

import { auth, googleEnabled } from '@/auth';

import { AuthForm } from '../AuthForm';

export const metadata = { title: 'Create account' };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const n = (await searchParams).next;
  const next = n && n.startsWith('/') && !n.startsWith('//') ? n : undefined;
  if ((await auth())?.user) redirect(next ?? '/app');
  return <AuthForm mode="signup" google={googleEnabled} next={next} />;
}
