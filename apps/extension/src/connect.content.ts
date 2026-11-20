/**
 * Runs only on the MeetingDictation website's /extension/connect page.
 * Answers the page's ping, and stores the token the page hands over.
 * Messages are accepted only from this window and this origin.
 */
import { APP_ORIGINS, type Auth } from './config';

if (APP_ORIGINS.includes(location.origin)) {
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const msg = e.data as { type?: string; token?: string; email?: string; name?: string; app?: string };
    if (msg?.type === 'md-ping') {
      window.postMessage({ type: 'md-pong' }, location.origin);
    } else if (msg?.type === 'md-connect' && typeof msg.token === 'string' && msg.token.startsWith('mdx_') && msg.app === location.origin) {
      const auth: Auth = { token: msg.token, email: String(msg.email ?? ''), name: msg.name ?? null, app: location.origin };
      void chrome.storage.local.set({ mdAuth: auth }).then(() => window.postMessage({ type: 'md-connected' }, location.origin));
    }
  });
}
