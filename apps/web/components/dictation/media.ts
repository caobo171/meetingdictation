'use client';

/**
 * One small interface over the two players the website uses, so the
 * dictation logic never cares whether it drives a <video> or YouTube.
 */
export interface MediaPort {
  time(): number;
  seek(t: number): void;
  play(): void;
  pause(): void;
  paused(): boolean;
  setRate(r: number): void;
}

export function htmlMediaPort(el: HTMLMediaElement): MediaPort {
  return {
    time: () => el.currentTime,
    seek: (t) => {
      el.currentTime = t;
    },
    play: () => {
      void el.play().catch(() => undefined);
    },
    pause: () => el.pause(),
    paused: () => el.paused,
    setRate: (r) => {
      el.playbackRate = r;
    },
  };
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!ytApi) {
    ytApi = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return ytApi;
}

export async function youTubePort(container: HTMLElement, videoId: string): Promise<{ port: MediaPort; destroy(): void }> {
  await loadYouTubeApi();
  const player = await new Promise<YT.Player>((resolve) => {
    const p: YT.Player = new window.YT.Player(container, {
      videoId,
      playerVars: { rel: 0, modestbranding: 1, cc_load_policy: 0, playsinline: 1 } as YT.PlayerVars,
      events: { onReady: () => resolve(p) },
    });
  });
  return {
    port: {
      time: () => player.getCurrentTime(),
      seek: (t) => player.seekTo(t, true),
      play: () => player.playVideo(),
      pause: () => player.pauseVideo(),
      paused: () => player.getPlayerState() !== window.YT.PlayerState.PLAYING && player.getPlayerState() !== window.YT.PlayerState.BUFFERING,
      setRate: (r) => player.setPlaybackRate(r),
    },
    destroy: () => player.destroy(),
  };
}
