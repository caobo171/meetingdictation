'use client';

import { PauseIcon, PlayIcon } from '@heroicons/react/24/solid';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { htmlMediaPort, youTubePort, type MediaPort } from '@/components/dictation/media';
import { Button } from '@/components/ui/button';

export interface ClipMedia {
  sourceType: 'upload' | 'youtube';
  youtubeId: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
}

export interface ClipHandle {
  toggle(): void;
}

const PAD_BEFORE = 0.15;
const PAD_AFTER = 0.35;

/** Plays one sentence of a recording kept on the website: an upload, or a YouTube video (shown small, as YouTube requires). */
export const ClipPlayer = forwardRef<ClipHandle, { media: ClipMedia; start: number; end: number; autoPlay?: boolean }>(function ClipPlayer(
  { media, start, end, autoPlay },
  ref,
) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const ytRef = useRef<HTMLDivElement>(null);
  const port = useRef<MediaPort | null>(null);
  const timer = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    window.clearInterval(timer.current);
    port.current?.pause();
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    const p = port.current;
    if (!p) return;
    p.seek(Math.max(0, start - PAD_BEFORE));
    p.play();
    setPlaying(true);
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      if (p.time() >= end + PAD_AFTER) stop();
    }, 50);
  }, [start, end, stop]);

  const toggle = useCallback(() => (playing ? stop() : play()), [playing, play, stop]);
  useImperativeHandle(ref, () => ({ toggle }), [toggle]);

  useEffect(() => {
    setReady(false);
    if (media.sourceType === 'upload' && mediaRef.current) {
      port.current = htmlMediaPort(mediaRef.current);
      setReady(true);
      return () => stop();
    }
    let destroy: (() => void) | undefined;
    let cancelled = false;
    if (media.sourceType === 'youtube' && media.youtubeId && ytRef.current) {
      const host = document.createElement('div');
      ytRef.current.replaceChildren(host);
      void youTubePort(host, media.youtubeId).then((r) => {
        if (cancelled) return r.destroy();
        port.current = r.port;
        destroy = r.destroy;
        setReady(true);
      });
    }
    return () => {
      cancelled = true;
      stop();
      port.current = null;
      destroy?.();
    };
  }, [media.sourceType, media.youtubeId, media.mediaUrl, stop]);

  useEffect(() => {
    if (ready && autoPlay) {
      const id = window.setTimeout(play, 150);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [ready, autoPlay, play]);

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" onClick={toggle} disabled={!ready} title="Play the sentence (1)" className="min-w-[96px]">
        {playing ? <PauseIcon /> : <PlayIcon />}
        {playing ? 'Pause' : 'Listen'}
      </Button>
      {media.sourceType === 'youtube' ? (
        <div ref={ytRef} className="aspect-video w-40 overflow-hidden rounded-md bg-black [&>div]:h-full [&>div]:w-full [&_iframe]:h-full [&_iframe]:w-full" />
      ) : media.mediaType?.startsWith('video') ? (
        <video ref={mediaRef} src={media.mediaUrl ?? undefined} preload="auto" playsInline className="aspect-video w-40 rounded-md bg-black" />
      ) : (
        <audio ref={mediaRef} src={media.mediaUrl ?? undefined} preload="auto" className="hidden" />
      )}
    </div>
  );
});
