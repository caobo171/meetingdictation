'use client';

import {
  ArrowLeftIcon,
  BanknotesIcon,
  ChartBarSquareIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  FilmIcon,
  MegaphoneIcon,
  NewspaperIcon,
  ReceiptPercentIcon,
  SignalIcon,
  TagIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

type Item = { name: string; href: string; icon: typeof UsersIcon; super?: boolean };
type Section = { name: string; items: Item[] };

/** Grouped like WELE's admin sidebar: Content, Billing, Communication, System. */
const SECTIONS: Section[] = [
  { name: 'Overview', items: [{ name: 'Dashboard', href: '/admin', icon: ChartBarSquareIcon }] },
  {
    name: 'People',
    items: [
      { name: 'Users', href: '/admin/users', icon: UsersIcon },
      { name: 'Customers', href: '/admin/customers', icon: UserGroupIcon, super: true },
    ],
  },
  {
    name: 'Billing',
    items: [
      { name: 'Orders', href: '/admin/orders', icon: BanknotesIcon, super: true },
      { name: 'Subscriptions', href: '/admin/subscriptions', icon: CreditCardIcon, super: true },
      { name: 'Coupons', href: '/admin/coupons', icon: ReceiptPercentIcon, super: true },
    ],
  },
  {
    name: 'Content',
    items: [
      { name: 'Blog', href: '/admin/blog', icon: NewspaperIcon },
      { name: 'Blog topics', href: '/admin/blog/categories', icon: TagIcon },
      { name: 'Recordings', href: '/admin/recordings', icon: FilmIcon },
    ],
  },
  { name: 'Communication', items: [{ name: 'Announcements', href: '/admin/announcements', icon: MegaphoneIcon }] },
  {
    name: 'System',
    items: [
      { name: 'Audit log', href: '/admin/audit', icon: ClipboardDocumentListIcon, super: true },
      { name: 'Webhooks', href: '/admin/webhooks', icon: SignalIcon, super: true },
    ],
  },
];

function useActive() {
  const path = usePathname();
  // The longest matching href wins, so /admin/blog/categories doesn't also light up Blog.
  const all = SECTIONS.flatMap((s) => s.items.map((i) => i.href));
  const best = all.filter((h) => (h === '/admin' ? path === '/admin' : path === h || path.startsWith(`${h}/`))).sort((a, b) => b.length - a.length)[0];
  return (href: string) => href === best;
}

export function AdminNav({ superAdmin }: { superAdmin: boolean }) {
  const isActive = useActive();
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => superAdmin || !i.super) })).filter((s) => s.items.length);
  return (
    <nav className="space-y-5">
      {sections.map((s) => (
        <div key={s.name}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.name}</p>
          <div className="grid gap-0.5">
            {s.items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cn(
                  'flex h-8 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors',
                  isActive(i.href) ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <i.icon className={cn('size-4', isActive(i.href) && 'text-primary')} />
                {i.name}
              </Link>
            ))}
          </div>
        </div>
      ))}
      <Link href="/app" className="flex h-8 items-center gap-2.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        Back to the app
      </Link>
    </nav>
  );
}

/** Phones: the same items as a scrolling strip under the top bar. */
export function AdminNavStrip({ superAdmin }: { superAdmin: boolean }) {
  const isActive = useActive();
  const items = SECTIONS.flatMap((s) => s.items).filter((i) => superAdmin || !i.super);
  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-2">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1 text-xs font-medium',
            isActive(i.href) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground',
          )}
        >
          {i.name}
        </Link>
      ))}
    </nav>
  );
}
