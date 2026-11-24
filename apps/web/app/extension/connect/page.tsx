import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Logo } from '@/components/Logo';
import { Card } from '@/components/ui/card';

import { ConnectClient } from './ConnectClient';

export const metadata = { title: 'Connect the extension' };

export default async function ConnectPage() {
  const session = await auth();
  if (!session?.user) redirect('/login?next=/extension/connect');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <Logo size={30} />
      <Card className="mt-8 w-full max-w-sm p-8 text-center">
        <ConnectClient email={session.user.email} />
      </Card>
    </div>
  );
}
