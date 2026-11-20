/**
 * Entry point. Runs on its own on Loom and YouTube (as a small "Dictation"
 * pill), and on any other page when the toolbar button is clicked: the
 * background worker injects this same file, and a second run toggles the panel.
 */

import { DictationPanel } from './panel';
import { isYouTube } from './sources';

declare global {
  interface Window {
    __meetingDictation?: { panel: DictationPanel; injected: boolean };
  }
}

const existing = window.__meetingDictation;
if (existing) {
  // Toolbar click (or Alt+Shift+D) on a page that already has us.
  if (!existing.panel.isOpen) existing.panel.open();
  else existing.panel.close();
} else {
  const panel = new DictationPanel();
  // Ran from the manifest (Loom / YouTube) → just the pill; ran from a click → open straight away.
  const fromClick = !!(document as Document & { __mdClick?: boolean }).__mdClick || !(/loom\.com$|youtube\.com$/.test(location.hostname));
  window.__meetingDictation = { panel, injected: fromClick };
  const onVideoPage = () => !isYouTube() || /^\/(watch|shorts|live)/.test(location.pathname);
  if (fromClick) panel.open();
  else if (onVideoPage()) panel.showPill();
  else panel.close();

  if (isYouTube()) {
    // YouTube is a single-page app: a new video arrives without a page load.
    let lastUrl = location.href;
    const onNav = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      if (!onVideoPage()) {
        if (!panel.isStarted) panel.close();
        return;
      }
      if (panel.isStarted) void panel.restartForNewPage();
      else panel.showPill();
    };
    document.addEventListener('yt-navigate-finish', onNav);
    window.addEventListener('popstate', onNav);
  }
}

export {};
