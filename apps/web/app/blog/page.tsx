import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { type Locale, activeLocales } from '@/lib/blog';

/** /blog → the reader's language if the blog has posts in it, like WELE's /blog → /blog/vi. */
export default async function BlogRoot() {
  const locales = await activeLocales();
  const accept = ((await headers()).get('accept-language') ?? '').toLowerCase();
  const wanted = accept
    .split(',')
    .map((part) => part.trim().slice(0, 2))
    .find((l): l is Locale => locales.includes(l as Locale));
  redirect(`/blog/${wanted ?? locales[0] ?? 'vi'}`);
}
