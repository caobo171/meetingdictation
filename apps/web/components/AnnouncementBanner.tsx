import { db } from '@/lib/db';

import { DismissibleBanner } from './DismissibleBanner';

/** The live announcements set in the admin: all of them inside the app, only the public ones on the public site. */
export async function AnnouncementBanner({ audience }: { audience: 'app' | 'public' }) {
  const now = new Date();
  const items = await db.announcement
    .findMany({
      where: {
        active: true,
        ...(audience === 'public' ? { public: true } : {}),
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
    })
    .catch(() => []);
  if (!items.length) return null;
  return (
    <div className="space-y-px">
      {items.map((a) => (
        <DismissibleBanner key={a.id} id={a.id} level={a.level} message={a.message} linkUrl={a.linkUrl} linkLabel={a.linkLabel} />
      ))}
    </div>
  );
}
