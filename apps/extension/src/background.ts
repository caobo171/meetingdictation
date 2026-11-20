/**
 * Toolbar button / Alt+Shift+D: inject the dictation panel into the current
 * tab, or toggle it. `activeTab` grants access to the page only at the moment
 * of the click, so no site needs a standing permission.
 *
 * Also the only place that talks to the MeetingDictation website: content
 * scripts send their sync requests here, so the page's CSP and CORS never apply.
 */
import { APP_ORIGINS, DEFAULT_APP, type Auth } from './config';

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        (document as Document & { __mdClick?: boolean }).__mdClick = true;
      },
    });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/content.js'] });
  } catch (err) {
    console.warn('MeetingDictation could not run on this page:', err);
  }
});

async function getAuth(): Promise<Auth | null> {
  const { mdAuth } = await chrome.storage.local.get('mdAuth');
  const auth = mdAuth as Auth | undefined;
  return auth && APP_ORIGINS.includes(auth.app) ? auth : null;
}

async function api(path: string, body: unknown): Promise<unknown> {
  const auth = await getAuth();
  if (!auth) return null;
  const res = await fetch(`${auth.app}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.token}` },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    await chrome.storage.local.remove('mdAuth'); // disconnected from the website
    return null;
  }
  if (!res.ok) throw new Error(`sync ${res.status}`);
  return res.json();
}

type Msg =
  | { type: 'md-status' }
  | { type: 'md-open-connect' }
  | { type: 'md-pull'; key: string }
  | { type: 'md-push'; payload: Record<string, unknown> };

chrome.runtime.onMessage.addListener((msg: Msg, _sender, reply) => {
  (async () => {
    switch (msg?.type) {
      case 'md-status': {
        const auth = await getAuth();
        return { email: auth?.email ?? null, app: auth?.app ?? DEFAULT_APP };
      }
      case 'md-open-connect': {
        const auth = await getAuth();
        await chrome.tabs.create({ url: `${auth?.app ?? DEFAULT_APP}/extension/connect` });
        return { ok: true };
      }
      case 'md-pull': {
        const data = (await api('/api/ext/progress', { action: 'get', key: msg.key })) as { progress?: unknown } | null;
        return { progress: data?.progress ?? null };
      }
      case 'md-push': {
        const data = (await api('/api/ext/progress', { action: 'put', ...msg.payload })) as { progress?: unknown } | null;
        return { progress: data?.progress ?? null };
      }
      default:
        return null;
    }
  })()
    .then(reply)
    .catch((err) => reply({ error: String(err) }));
  return true; // async reply
});
