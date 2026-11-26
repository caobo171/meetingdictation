import { ImageResponse } from 'next/og';

import { FALLBACK, PALETTES } from '@/components/blog/Cover';
import { categoryName, getPost, isLocale } from '@/lib/blog';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'MeetingDictation blog';

/** Satori needs a TTF/OTF with the Vietnamese glyphs; Google Fonts serves one, cut down to the text, to a plain fetch. */
async function font(text: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@${weight}&text=${encodeURIComponent(text)}`)
    ).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return src ? await (await fetch(src)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OgImage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const post = isLocale(locale) ? await getPost(locale, slug) : null;
  const title = post?.title ?? 'MeetingDictation';
  const label = post?.category && isLocale(locale) ? categoryName(post.category, locale) : 'Blog';
  const p = (post?.category && PALETTES[post.category.slug]) || FALLBACK;
  const [bold, medium] = await Promise.all([font(title, 700), font(`${label}meetingdictation.com/blog`, 500)]);
  const fonts = [
    ...(bold ? [{ name: 'Be Vietnam Pro', data: bold, weight: 700 as const }] : []),
    ...(medium ? [{ name: 'Be Vietnam Pro', data: medium, weight: 500 as const }] : []),
  ];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: p.bg, fontFamily: 'Be Vietnam Pro', position: 'relative' }}>
        <div style={{ position: 'absolute', right: -120, top: -140, width: 520, height: 520, borderRadius: 9999, background: p.blob }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', width: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              fontSize: 26,
              fontWeight: 500,
              color: p.accent,
              background: '#FFFFFF',
              padding: '8px 20px',
              borderRadius: 999,
            }}
          >
            {label}
          </div>
          <div style={{ display: 'flex', fontSize: title.length > 70 ? 54 : 64, fontWeight: 700, lineHeight: 1.18, color: '#14181F', maxWidth: 1000 }}>
            {title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <svg width="56" height="56" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="16" fill="#4F46E5" />
              <path d="M15 15h34a7 7 0 0 1 7 7v16a7 7 0 0 1-7 7H31l-10 8.5V45h-6a7 7 0 0 1-7-7V22a7 7 0 0 1 7-7z" fill="#FFFCF5" />
              <rect x="16" y="26" width="4" height="8" rx="2" fill="#4F46E5" />
              <rect x="23" y="21" width="4" height="18" rx="2" fill="#4F46E5" />
              <rect x="30" y="24.5" width="4" height="11" rx="2" fill="#4F46E5" />
              <rect x="40" y="20" width="3.5" height="20" rx="1.75" fill="#14181F" />
              <circle cx="50" cy="15" r="6.5" fill="#F2C744" stroke="#4F46E5" strokeWidth="2.5" />
            </svg>
            <div style={{ display: 'flex', fontSize: 28, fontWeight: 500, color: '#3F3F46' }}>meetingdictation.com/blog</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
