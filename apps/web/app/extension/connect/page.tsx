import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Logo } from '@/components/Logo';

import { ConnectClient } from './ConnectClient';

export const metadata = { title: 'Connect the extension' };

export default async function ConnectPage() {
  const session = await auth();
  if (!session?.user) redirect('/login?next=/extension/connect');
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <Logo size={36} />
      <div className="card mt-8 w-full max-w-md p-8 text-center">
        <ConnectClient email={session.user.email} />
      </div>
    </div>
  );
}
