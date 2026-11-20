import { redirect } from 'next/navigation';

import { auth, googleEnabled } from '@/auth';

import { AuthForm } from '../AuthForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const n = searchParams.next;
  const next = n && n.startsWith('/') && !n.startsWith('//') ? n : undefined;
  if ((await auth())?.user) redirect(next ?? '/app');
  return <AuthForm mode="login" google={googleEnabled} next={next} />;
}
