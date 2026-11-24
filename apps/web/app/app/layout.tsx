import Link from 'next/link';

import { signOut } from '@/auth';
import { AppNav } from '@/components/AppNav';
import { Logo } from '@/components/Logo';
import { TimeZoneCookie } from '@/components/TimeZoneCookie';
import { UserMenu } from '@/components/UserMenu';
import { requireUser } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const me = { name: user.name ?? null, email: user.email, image: user.image ?? null };
  async function doSignOut() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <div className="min-h-screen bg-muted/40 lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-background px-3 py-4 lg:flex">
        <Link href="/app" className="mb-6 flex h-9 items-center px-2">
          <Logo size={26} />
        </Link>
        <AppNav variant="side" />
        <div className="mt-auto border-t pt-3">
          <UserMenu user={me} signOut={doSignOut} />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Link href="/app">
          <Logo size={24} />
        </Link>
        <UserMenu user={me} signOut={doSignOut} compact />
      </header>

      <main className="min-w-0 px-4 pb-24 pt-6 sm:px-8 lg:pb-12 lg:pt-10">{children}</main>
      <AppNav variant="bottom" />
      <TimeZoneCookie />
    </div>
  );
}
