import { CheckCircleIcon, CheckIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/db';
import { FREE_RECORDINGS, PLANS, type Plan, createCheckout, customerPortalUrl, isPro } from '@/lib/polar';
import { requireUser } from '@/lib/session';

export const metadata = { title: 'Plan' };
export const dynamic = 'force-dynamic';

const PERKS = ['Unlimited recordings on the website', 'Upload meetings up to 1 GB', 'Every future Pro feature', 'Supports an indie tool'];

const date = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default async function Billing(props: { searchParams: Promise<{ paid?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const pro = isPro(user);
  const recordings = await db.recording.count({ where: { userId: user.id } });

  async function checkout(form: FormData) {
    'use server';
    const u = await requireUser();
    const plan = String(form.get('plan')) as Plan;
    if (!(plan in PLANS)) redirect('/app/billing');
    let url: string;
    try {
      url = await createCheckout(u, plan);
    } catch (e) {
      console.error('[polar] checkout', e);
      redirect('/app/billing?error=checkout');
    }
    redirect(url);
  }

  async function portal() {
    'use server';
    const u = await requireUser();
    let url: string;
    try {
      url = await customerPortalUrl(u.id);
    } catch (e) {
      console.error('[polar] portal', e);
      redirect('/app/billing?error=portal');
    }
    redirect(url);
  }

  let status = 'Free';
  if (user.lifetime) status = 'Pro for life';
  else if (pro && user.subStatus === 'trialing') status = `Free trial until ${date(user.proUntil!)}`;
  else if (pro && user.subCancelAtEnd) status = `Pro until ${date(user.proUntil!)}, then Free`;
  else if (pro) status = `Pro, renews ${date(user.proUntil!)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Plan" description="MeetingDictation is free to start. Pro removes the limits." />

      {searchParams.paid && !pro && (
        <Alert>
          <AlertDescription>Thanks! Your payment is going through. This page updates in a few seconds; refresh if it doesn’t.</AlertDescription>
        </Alert>
      )}
      {searchParams.error && (
        <Alert variant="destructive">
          <AlertDescription>We couldn’t reach the payment provider. Please try again in a minute.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              Your plan
              {pro ? (
                <Badge>
                  <SparklesIcon /> Pro
                </Badge>
              ) : (
                <Badge variant="secondary">Free</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {status}
              {!pro && ` · ${Math.min(recordings, FREE_RECORDINGS)} of ${FREE_RECORDINGS} free recordings used`}
            </CardDescription>
          </div>
          {user.polarCustomerId && (
            <form action={portal}>
              <Button variant="outline">Manage billing</Button>
            </form>
          )}
        </CardHeader>
      </Card>

      {!user.lifetime && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(PLANS) as Plan[])
            .filter((p) => !(pro && p === 'yearly'))
            .map((p) => {
              const plan = PLANS[p];
              const best = p === 'yearly';
              return (
                <Card key={p} className={best ? 'border-primary shadow-sm' : undefined}>
                  <form action={checkout} className="flex h-full flex-col">
                    <input type="hidden" name="plan" value={p} />
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between text-base">
                        {plan.name}
                        {best && <Badge variant="secondary">7 days free</Badge>}
                      </CardTitle>
                      <div className="flex items-baseline gap-1 pt-2">
                        <span className="text-3xl font-semibold tracking-tight">{plan.price}</span>
                        <span className="text-sm text-muted-foreground">{plan.per}</span>
                      </div>
                      <CardDescription>{plan.note}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <ul className="space-y-2 text-sm">
                        {PERKS.map((perk) => (
                          <li key={perk} className="flex gap-2">
                            <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                            {perk}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full" variant={best ? 'default' : 'outline'}>
                        {best ? 'Start free trial' : 'Buy lifetime'}
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              );
            })}
        </div>
      )}

      {user.lifetime && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm">
            <CheckCircleIcon className="size-6 text-primary" />
            You have Pro for life. Thank you for supporting MeetingDictation.
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Payments are handled by Polar. Cancel any time from Manage billing; the browser extension stays free.
      </p>
    </div>
  );
}
