'use client';

import {
  Cog6ToothIcon,
  HomeIcon,
  ShieldCheckIcon,
  PlusCircleIcon,
  PuzzlePieceIcon,
  RectangleStackIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import {
  Cog6ToothIcon as Cog6ToothSolid,
  HomeIcon as HomeSolid,
  ShieldCheckIcon as ShieldCheckSolid,
  PlusCircleIcon as PlusCircleSolid,
  PuzzlePieceIcon as PuzzlePieceSolid,
  RectangleStackIcon as RectangleStackSolid,
  SparklesIcon as SparklesSolid,
} from '@heroicons/react/24/solid';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/app', label: 'Home', icon: HomeIcon, active: HomeSolid },
  { href: '/app/new', label: 'New recording', short: 'New', icon: PlusCircleIcon, active: PlusCircleSolid },
  { href: '/app/recordings', label: 'Recordings', short: 'Library', icon: RectangleStackIcon, active: RectangleStackSolid },
  { href: '/app/extension', label: 'Extension', icon: PuzzlePieceIcon, active: PuzzlePieceSolid },
  { href: '/app/billing', label: 'Plan', icon: SparklesIcon, active: SparklesSolid },
  { href: '/app/settings', label: 'Settings', icon: Cog6ToothIcon, active: Cog6ToothSolid },
];

const ADMIN_ITEMS = [{ href: '/admin', label: 'Admin', icon: ShieldCheckIcon, active: ShieldCheckSolid }];

export function AppNav({ variant, admin = false }: { variant: 'side' | 'bottom'; admin?: boolean }) {
  const path = usePathname();
  const isActive = (href: string) => (href === '/app' ? path === '/app' : path.startsWith(href));

  if (variant === 'bottom') {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t bg-background/95 backdrop-blur lg:hidden">
        {ITEMS.map((i) => {
          const on = isActive(i.href);
          const Icon = on ? i.active : i.icon;
          return (
            <Link
              key={i.href}
              href={i.href}
              className={cn('flex flex-col items-center gap-1 py-2 text-[11px] font-medium', on ? 'text-primary' : 'text-muted-foreground')}
            >
              <Icon className="size-5" />
              {i.short ?? i.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="grid gap-0.5">
      {[...ITEMS, ...(admin ? ADMIN_ITEMS : [])].map((i) => {
        const on = isActive(i.href);
        const Icon = on ? i.active : i.icon;
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
              on ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <Icon className={cn('size-[18px]', on && 'text-primary')} />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
