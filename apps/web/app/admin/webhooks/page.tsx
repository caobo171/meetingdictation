import { AdminHeader, PAGE, Pager, Stat, TableCard, Td, THead, Th, Tr, fmtDateTime, pageOf } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

export const metadata = { title: 'Webhooks' };

const configured = (v: string | undefined) => (v ? 'Set' : 'Missing');

/** Polar webhook deliveries we have applied, and whether billing is configured at all. */
export default async function Webhooks(props: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin('super_admin');
  const page = pageOf((await props.searchParams).page);
  const day = new Date(Date.now() - 86400000);
  const [total, events, last24, byType] = await Promise.all([
    db.polarEvent.count(),
    db.polarEvent.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE }),
    db.polarEvent.count({ where: { createdAt: { gte: day } } }),
    db.polarEvent.groupBy({ by: ['type'], _count: true, orderBy: { _count: { type: 'desc' } } }),
  ]);
  const base = (process.env.AUTH_URL ?? '').replace(/\/$/, '');

  return (
    <>
      <AdminHeader title="Webhooks" description={`Polar sends billing events to ${base || '<AUTH_URL>'}/api/polar/webhook. Each delivery is applied once.`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Events applied" value={total} hint={`${last24} in the last 24 hours`} />
        <Stat label="Webhook secret" value={configured(process.env.POLAR_WEBHOOK_SECRET)} />
        <Stat label="Access token" value={configured(process.env.POLAR_ACCESS_TOKEN)} />
        <Stat
          label="Products"
          value={`${configured(process.env.POLAR_PRODUCT_YEARLY)} · ${configured(process.env.POLAR_PRODUCT_LIFETIME)}`}
          hint="Yearly · lifetime"
        />
      </div>
      {byType.length > 0 && (
        <p className="text-sm text-muted-foreground">{byType.map((t) => `${t.type} ${t._count}`).join(' · ')}</p>
      )}
      <TableCard empty={!events.length && 'No webhook deliveries yet.'}>
        <THead>
          <Th>Received</Th>
          <Th>Event</Th>
          <Th>Delivery id</Th>
        </THead>
        <tbody>
          {events.map((e) => (
            <Tr key={e.id}>
              <Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(e.createdAt)}</Td>
              <Td className="font-mono text-xs">{e.type}</Td>
              <Td className="font-mono text-xs text-muted-foreground">{e.id}</Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} params={{}} base="/admin/webhooks" />
    </>
  );
}
