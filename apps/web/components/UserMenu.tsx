'use client';

import { ArrowRightStartOnRectangleIcon, ChevronUpDownIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type User = { name: string | null; email: string; image: string | null };

function initials(u: User): string {
  const base = (u.name ?? u.email).trim();
  const parts = base.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function UserAvatar({ user, className }: { user: User; className?: string }) {
  return (
    <Avatar className={cn('h-8 w-8', className)}>
      {user.image && <AvatarImage src={user.image} alt="" />}
      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(user)}</AvatarFallback>
    </Avatar>
  );
}

export function UserMenu({ user, signOut, compact = false }: { user: User; signOut: () => Promise<void>; compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2.5 rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
          compact ? 'p-0.5' : 'w-full p-2 hover:bg-accent',
        )}
      >
        <UserAvatar user={user} />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.name ?? 'Learner'}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <ChevronUpDownIcon className="size-4 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'end' : 'start'} side={compact ? 'bottom' : 'top'} className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{user.name ?? 'Learner'}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <Cog6ToothIcon />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <ArrowRightStartOnRectangleIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
