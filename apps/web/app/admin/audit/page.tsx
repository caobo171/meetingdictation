import type { Prisma } from '@prisma/client';
import Link from 'next/link';

import { AdminHeader, Filters, PAGE, Pager, TableCard, Td, THead, Th, Tr, fmtDateTime, inputCls, pageOf } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';

export const metadata = { title: 'Audit log' };

const TARGET_LINK: Record<string, (id: string) => string> = {
  user: (id) => `/admin/users/${id}`,
  order: (id) => `/admin/orders/${id}`,
  blog: (id) => `/admin/blog/${id}`,
};

export default async function AuditLog(props: { searchParams: Promise<{ q?: string; area?: string; page?: string }> }) {
  await requireAdmin('super_admin');
  const sp = await props.searchParams;
  const page = pageOf(sp.page);
  const where: Prisma.AdminLogWhereInput = {};
  if (sp.q) where.OR = [{ summary: { contains: sp.q, mode: 'insensitive' } }, { actorEmail: { contains: sp.q, mode: 'insensitive' } }, { targetId: sp.q }];
  if (sp.area) where.action = { startsWith: `${sp.area}.` };
  const [total, rows, areas] = await Promise.all([
    db.adminLog.count({ where }),
    db.adminLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE }),
    db.adminLog.findMany({ select: { action: true }, distinct: ['action'] }),
  ]);
  const areaList = [...new Set(areas.map((a) => a.action.split('.')[0]))].sort();

  return (
    <>
      <AdminHeader title="Audit log" description="Every change made in the admin, newest first." />
      <Filters>
        <input name="q" defaultValue={sp.q} placeholder="Text, admin email or record id…" className={`${inputCls} w-72`} />
        <select name="area" defaultValue={sp.area ?? ''} className={inputCls}>
          <option value="">Everything</option>
          {areaList.map((a) => (
            <option key={a} value={a}>
              {a.replace('_', ' ')}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </Filters>
      <TableCard empty={!rows.length && 'Nothing logged yet.'}>
        <THead>
          <Th>When</Th>
          <Th>Admin</Th>
          <Th>Action</Th>
          <Th>What happened</Th>
        </THead>
        <tbody>
          {rows.map((r) => {
            const link = r.targetType && r.targetId ? TARGET_LINK[r.targetType]?.(r.targetId) : undefined;
            return (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(r.createdAt)}</Td>
                <Td className="text-muted-foreground">{r.actorEmail}</Td>
                <Td className="font-mono text-xs">{r.action}</Td>
                <Td>
                  {link ? (
                    <Link href={link} className="hover:text-primary">
                      {r.summary}
                    </Link>
                  ) : (
                    r.summary
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </TableCard>
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} params={{ q: sp.q, area: sp.area }} base="/admin/audit" />
    </>
  );
}
