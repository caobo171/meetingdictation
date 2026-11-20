import { rm } from 'node:fs/promises';
import path from 'node:path';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { signOut } from '@/auth';
import { ConnectedDevices } from '@/components/ConnectedDevices';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Settings' };

export default async function Settings() {
  const user = await requireUser();

  async function saveName(form: FormData) {
    'use server';
    const u = await requireUser();
    const name = String(form.get('name') ?? '').trim().slice(0, 80);
    if (name) await db.user.update({ where: { id: u.id }, data: { name } });
    revalidatePath('/app', 'layout');
  }

  async function deleteAccount(form: FormData) {
    'use server';
    const u = await requireUser();
    if (String(form.get('confirm') ?? '').trim().toLowerCase() !== u.email.toLowerCase()) redirect('/app/settings?delete=mismatch');
    await db.user.delete({ where: { id: u.id } });
    await rm(path.resolve(process.env.UPLOAD_DIR ?? './uploads', u.id), { recursive: true, force: true });
    await signOut({ redirectTo: '/' });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>

      <form action={saveName} className="card space-y-4 p-6">
        <h2 className="font-bold">Profile</h2>
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" name="name" defaultValue={user.name ?? ''} />
        </div>
        <div>
          <span className="label">Email</span>
          <p className="text-ink-2">{user.email}</p>
        </div>
        <button className="btn-primary">Save</button>
      </form>

      <div className="card p-6">
        <h2 className="mb-2 font-bold">Connected browsers</h2>
        <ConnectedDevices userId={user.id} />
      </div>

      <div className="card p-6">
        <h2 className="font-bold">Sign out</h2>
        <form
          className="mt-3"
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <button className="btn-ghost">Sign out of this device</button>
        </form>
      </div>

      <form action={deleteAccount} className="card border-bad/40 p-6">
        <h2 className="font-bold text-bad">Delete account</h2>
        <p className="mt-1 text-sm text-ink-2">
          Removes your account, your uploaded recordings and all progress. This cannot be undone. Type your email to confirm.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="input max-w-xs" name="confirm" placeholder={user.email} />
          <button className="btn bg-bad text-white hover:brightness-95">Delete my account</button>
        </div>
      </form>
    </div>
  );
}
