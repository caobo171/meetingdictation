'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/app', label: 'Home', icon: '🏠' },
  { href: '/app/new', label: 'New recording', icon: '➕' },
  { href: '/app/recordings', label: 'Recordings', icon: '🎧' },
  { href: '/app/extension', label: 'Extension', icon: '🧩' },
  { href: '/app/settings', label: 'Settings', icon: '⚙️' },
];

export function AppNav({ variant }: { variant: 'side' | 'bottom' }) {
  const path = usePathname();
  const active = (href: string) => (href === '/app' ? path === '/app' : path.startsWith(href));
  if (variant === 'bottom') {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-paper lg:hidden">
        {ITEMS.slice(0, 4).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active(i.href) ? 'text-brand' : 'text-ink-3'}`}
          >
            <span className="text-lg">{i.icon}</span>
            {i.label.split(' ')[0]}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="space-y-1">
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${
            active(i.href) ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-bg2'
          }`}
        >
          <span className="w-5 text-center">{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
