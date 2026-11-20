export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (/(^|\.)youtu\.be$/.test(u.hostname)) return u.pathname.slice(1).split('/')[0] || null;
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    return u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/)?.[1] || null;
  } catch {
    return null;
  }
}
