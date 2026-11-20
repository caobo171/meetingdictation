import Link from 'next/link';

import { signOut } from '@/auth';
import { AppNav } from '@/components/AppNav';
import { Logo } from '@/components/Logo';
import { TimeZoneCookie } from '@/components/TimeZoneCookie';
import { requireUser } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const initial = (user.name ?? user.email).trim()[0]?.toUpperCase() ?? '?';

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-paper/70 px-4 py-5 lg:flex">
        <Link href="/app" className="mb-8 px-2">
          <Logo size={30} />
        </Link>
        <AppNav variant="side" />
        <div className="mt-auto flex items-center gap-3 rounded-xl px-2 py-2">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-9 w-9 rounded-full" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold font-bold text-[#14181f]">{initial}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user.name ?? 'Learner'}</div>
            <div className="truncate text-xs text-ink-3">{user.email}</div>
          </div>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-3 hover:bg-bg2 hover:text-ink" title="Sign out">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-line bg-paper/70 px-4 py-3 lg:hidden">
        <Link href="/app">
          <Logo size={26} />
        </Link>
        <Link href="/app/settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-sm font-bold text-[#14181f]">
          {initial}
        </Link>
      </header>

      <main className="min-w-0 px-4 pb-24 pt-6 sm:px-8 lg:pb-10 lg:pt-8">{children}</main>
      <AppNav variant="bottom" />
      <TimeZoneCookie />
    </div>
  );
}
