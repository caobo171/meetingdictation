'use client';

import { useEffect } from 'react';

/** Lets the server count streak days in the learner's own time zone. */
export function TimeZoneCookie() {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && !document.cookie.includes(`md_tz=${encodeURIComponent(tz)}`)) {
      document.cookie = `md_tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);
  return null;
}
