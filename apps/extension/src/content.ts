/**
 * Entry point. Runs on its own on Loom, YouTube and Microsoft Stream (Teams
 * recordings) as a small "Dictation" pill, and on any other page when the
 * toolbar button is clicked: the background worker injects this same file, and
 * a second run toggles the panel.
 */

import { DictationPanel } from './panel';
import { isStream, isYouTube } from './sources';
import { isTeams, startTeamsBridge, teamsRecording } from './teams';

declare global {
  interface Window {
    __meetingDictation?: { panel: DictationPanel; injected: boolean };
  }
}

startTeamsBridge();

const existing = window.__meetingDictation;
if (existing) {
  // Toolbar click (or Alt+Shift+D) on a page that already has us.
  if (!existing.panel.isOpen) existing.panel.open();
  else existing.panel.close();
} else {
  const panel = new DictationPanel();
  // Ran from the manifest (Loom / YouTube) → just the pill; ran from a click → open straight away.
  const fromClick = !!(document as Document & { __mdClick?: boolean }).__mdClick || !(/loom\.com$|youtube\.com$/.test(location.hostname) || isStream() || isTeams());
  window.__meetingDictation = { panel, injected: fromClick };
  const onVideoPage = () => (isTeams() ? !!teamsRecording() : !isYouTube() || /^\/(watch|shorts|live)/.test(location.pathname));
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

  if (isTeams()) {
    // Teams never reloads: show the pill while a recording's Recap is open, start over on another one.
    let last = teamsRecording()?.uniqueId ?? null;
    setInterval(() => {
      const now = teamsRecording()?.uniqueId ?? null;
      if (now === last) return;
      last = now;
      if (!now) {
        if (!panel.isStarted) panel.close();
      } else if (panel.isStarted) void panel.restartForNewPage();
      else panel.showPill();
    }, 1500);
  }
}

export {};
