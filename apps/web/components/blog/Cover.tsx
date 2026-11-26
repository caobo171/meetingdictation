/**
 * The cover of a post that has no image of its own: the dictation screen in miniature (a line of blanks, some
 * already heard, one being typed), tinted by the post's topic and varied by its slug, so every card looks different
 * but the blog still reads as one set.
 */

export const PALETTES: Record<string, { bg: string; blob: string; accent: string }> = {
  benefits: { bg: '#FBF1DC', blob: '#F3D9A4', accent: '#C2410C' },
  'learning-tips': { bg: '#EEF0FD', blob: '#D5DAFB', accent: '#4F46E5' },
  'learning-path': { bg: '#E6F4EC', blob: '#C4E6D2', accent: '#15803D' },
  'work-english': { bg: '#E7F2FA', blob: '#C6E0F2', accent: '#0369A1' },
  guides: { bg: '#F1ECFB', blob: '#DCD0F6', accent: '#6D28D9' },
  comparison: { bg: '#FBEBEE', blob: '#F4CCD4', accent: '#BE123C' },
  'listening-sources': { bg: '#E5F4F2', blob: '#C2E5E0', accent: '#0F766E' },
};
export const FALLBACK = { bg: '#F1F1F3', blob: '#DEDEE3', accent: '#3F3F46' };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A small seeded random generator, so the same slug always draws the same cover. */
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function Cover({
  slug,
  category,
  image,
  alt = '',
  className = '',
  priority = false,
}: {
  slug: string;
  category?: string | null;
  image?: string | null;
  alt?: string;
  className?: string;
  priority?: boolean;
}) {
  const base = 'block aspect-[1200/630] w-full overflow-hidden rounded-2xl';
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt={alt} className={`${base} object-cover ${className}`} loading={priority ? 'eager' : 'lazy'} />
    );
  }

  const p = (category && PALETTES[category]) || FALLBACK;
  const rand = rng(hash(slug));
  const rows = [0, 1, 2].map((row) => {
    const words: { x: number; w: number; kind: 'ok' | 'bad' | 'cur' | 'empty' }[] = [];
    let x = 250;
    const filled = row === 0 ? 99 : row === 1 ? 2 + Math.floor(rand() * 3) : -1;
    let i = 0;
    while (x < 930) {
      const w = 50 + Math.floor(rand() * 90);
      if (x + w > 950) break;
      const kind = i < filled ? (rand() < 0.15 ? 'bad' : 'ok') : i === filled ? 'cur' : 'empty';
      words.push({ x, w, kind });
      x += w + 18;
      i++;
    }
    return words;
  });
  const blobX = 820 + Math.floor(rand() * 260);
  const blobY = 40 + Math.floor(rand() * 140);
  const waves = Array.from({ length: 5 }, () => 18 + Math.floor(rand() * 46));

  return (
    <svg viewBox="0 0 1200 630" className={`${base} ${className}`} role="img" aria-label={alt} preserveAspectRatio="xMidYMid slice">
      <rect width="1200" height="630" fill={p.bg} />
      <circle cx={blobX} cy={blobY} r="230" fill={p.blob} />
      <circle cx={120 + Math.floor(rand() * 120)} cy="560" r="150" fill={p.blob} opacity="0.6" />
      <g>
        <rect x="170" y="150" width="860" height="330" rx="30" fill="#FFFFFF" opacity="0.96" />
        <rect x="170" y="150" width="860" height="330" rx="30" fill="none" stroke="#14181F" strokeOpacity="0.06" strokeWidth="2" />
        {/* What you hear */}
        {waves.map((h, i) => (
          <rect key={i} x={196 + i * 9} y={315 - h / 2} width="5" height={h} rx="2.5" fill={p.accent} opacity="0.85" />
        ))}
        {rows.map((words, r) =>
          words.map((w, i) => {
            const y = 215 + r * 80;
            const fill = w.kind === 'ok' ? '#DCFCE7' : w.kind === 'bad' ? '#FEE2E2' : w.kind === 'cur' ? p.blob : '#F1F1F3';
            const line = w.kind === 'ok' ? '#16A34A' : w.kind === 'bad' ? '#DC2626' : w.kind === 'cur' ? p.accent : '#C4C4CC';
            return (
              <g key={`${r}-${i}`}>
                <rect x={w.x} y={y} width={w.w} height="40" rx="6" fill={fill} />
                <rect x={w.x} y={y + 37} width={w.w} height="4" rx="2" fill={line} />
                {(w.kind === 'ok' || w.kind === 'bad') && (
                  <rect x={w.x + 10} y={y + 16} width={w.w - 20} height="8" rx="4" fill={line} opacity="0.55" />
                )}
                {w.kind === 'cur' && <rect x={w.x + 12} y={y + 8} width="4" height="24" rx="2" fill="#14181F" />}
              </g>
            );
          }),
        )}
      </g>
    </svg>
  );
}
