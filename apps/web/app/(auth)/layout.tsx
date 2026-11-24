import Link from 'next/link';

import { Logo } from '@/components/Logo';
import { Card } from '@/components/ui/card';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <Link href="/" className="mb-8">
        <Logo size={30} />
      </Link>
      <Card className="w-full max-w-sm p-6 sm:p-8">{children}</Card>
    </div>
  );
}
