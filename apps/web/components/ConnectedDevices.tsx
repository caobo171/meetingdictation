import { revokeExtensionToken } from '@/app/app/extension/actions';
import { db } from '@/lib/db';

export async function ConnectedDevices({ userId }: { userId: string }) {
  const tokens = await db.extToken.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!tokens.length) return <p className="text-sm text-ink-3">No browser connected yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {tokens.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 py-3">
          <div>
            <div className="font-semibold">🧩 {t.label ?? 'Browser extension'}</div>
            <div className="text-xs text-ink-3">
              {t.lastUsedAt ? `Last synced ${t.lastUsedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'Not synced yet'}
            </div>
          </div>
          <form
            action={async () => {
              'use server';
              await revokeExtensionToken(t.id);
            }}
          >
            <button className="btn-ghost px-3 py-1.5 text-xs">Disconnect</button>
          </form>
        </li>
      ))}
    </ul>
  );
}
