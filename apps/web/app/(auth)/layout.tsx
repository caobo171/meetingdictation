import Link from 'next/link';

import { Logo } from '@/components/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <Link href="/" className="mb-8">
        <Logo size={36} />
      </Link>
      <div className="card w-full max-w-md p-7 sm:p-8">{children}</div>
    </div>
  );
}
