import type { Metadata } from 'next';
import Link from 'next/link';

import { signOut } from '@/auth';
import { AdminNav, AdminNavStrip } from '@/components/admin/AdminNav';
import { LogoMark } from '@/components/Logo';
import { UserMenu } from '@/components/UserMenu';
import { Badge } from '@/components/ui/badge';
import { requireAdmin } from '@/lib/admin';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin · MeetingDictation' },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const superAdmin = admin.level === 'super_admin';
  const me = { name: admin.name ?? null, email: admin.email, image: admin.image ?? null };
  async function doSignOut() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  const brand = (
    <Link href="/admin" className="flex items-center gap-2">
      <LogoMark size={24} />
      <span className="font-semibold tracking-tight">Admin</span>
      <Badge variant={superAdmin ? 'default' : 'outline'} className="ml-1">
        {superAdmin ? 'Super admin' : 'Admin'}
      </Badge>
    </Link>
  );

  return (
    <div className="min-h-screen bg-muted/40 lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-background px-3 py-4 lg:flex">
        <div className="mb-6 px-2">{brand}</div>
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <AdminNav superAdmin={superAdmin} />
        </div>
        <div className="mt-3 border-t pt-3">
          <UserMenu user={me} signOut={doSignOut} />
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          {brand}
          <UserMenu user={me} signOut={doSignOut} compact />
        </div>
        <AdminNavStrip superAdmin={superAdmin} />
      </header>

      <main className="min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:pt-10">
        <div className="mx-auto max-w-6xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
