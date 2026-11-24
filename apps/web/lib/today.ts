import { cookies } from 'next/headers';

/** The learner's local date (YYYY-MM-DD), from the time zone their browser reported. */
export async function learnerToday(): Promise<string> {
  const tz = (await cookies()).get('md_tz')?.value;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
