import { ComputerDesktopIcon } from '@heroicons/react/24/outline';

import { revokeExtensionToken } from '@/app/app/extension/actions';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';

const when = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

export async function ConnectedDevices({ userId }: { userId: string }) {
  const tokens = await db.extToken.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!tokens.length) return <p className="text-sm text-muted-foreground">No browser connected yet.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {tokens.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ComputerDesktopIcon className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{t.label ?? 'Browser extension'}</div>
            <div className="text-xs text-muted-foreground">
              {t.lastUsedAt ? `Last synced ${when.format(t.lastUsedAt)} UTC` : 'Not synced yet'}
            </div>
          </div>
          <form
            action={async () => {
              'use server';
              await revokeExtensionToken(t.id);
            }}
          >
            <Button variant="outline" size="sm">
              Disconnect
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
