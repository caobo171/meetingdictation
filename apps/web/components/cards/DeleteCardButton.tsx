'use client';

import { TrashIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { cardRequest } from './client';

export function DeleteCardButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Remove card"
      title="Remove card"
      disabled={busy}
      className="size-8 shrink-0 text-muted-foreground"
      onClick={async () => {
        setBusy(true);
        await cardRequest({ action: 'delete', id }).catch(() => undefined);
        router.refresh();
      }}
    >
      <TrashIcon />
    </Button>
  );
}
