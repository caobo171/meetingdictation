import { rm } from 'node:fs/promises';
import path from 'node:path';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { signOut } from '@/auth';
import { ConnectedDevices } from '@/components/ConnectedDevices';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Settings' };

export default async function Settings(props: { searchParams: Promise<{ delete?: string }> }) {
  const searchParams = await props.searchParams;
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
    await rm(path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? './uploads', u.id), { recursive: true, force: true });
    await signOut({ redirectTo: '/' });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Your profile, connected browsers and account." />

      <Card>
        <form action={saveName}>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>How your name appears in MeetingDictation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={user.name ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} disabled readOnly />
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button>Save</Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected browsers</CardTitle>
          <CardDescription>Extensions that sync your practice to this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectedDevices userId={user.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Sign out</CardTitle>
            <CardDescription>Sign out of MeetingDictation on this device.</CardDescription>
          </div>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <Button variant="outline">Sign out</Button>
          </form>
        </CardHeader>
      </Card>

      <Card className="border-destructive/40">
        <form action={deleteAccount}>
          <CardHeader>
            <CardTitle className="text-base text-destructive">Delete account</CardTitle>
            <CardDescription>
              Removes your account, your uploaded recordings and all progress. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="confirm">Type your email to confirm</Label>
            <Input id="confirm" name="confirm" placeholder={user.email} autoComplete="off" />
            {searchParams.delete === 'mismatch' && <p className="text-sm text-destructive">That email doesn’t match your account.</p>}
          </CardContent>
          <CardFooter className="border-t border-destructive/20 px-6 py-4">
            <Button variant="destructive">Delete my account</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
