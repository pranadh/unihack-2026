"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface YouTubePlayerProps {
  videoId: string;
  onTimeUpdate: (time: number) => void;
  onReady?: () => void;
  playbackRate?: number;
}

// YouTube IFrame API types
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          videoId: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
            onStateChange?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
        BUFFERING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  getAvailablePlaybackRates: () => number[];
  destroy: () => void;
}

export default function YouTubePlayer({
  videoId,
  onTimeUpdate,
  onReady,
  playbackRate = 1,
}: YouTubePlayerProps) {
  const playerRef = useRef<YTPlayer | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<string>(`yt-player-${Date.now()}`);
  const [isApiLoaded, setIsApiLoaded] = useState(false);

  // Load YouTube IFrame API script
  useEffect(() => {
    if (window.YT) {
      setIsApiLoaded(true);
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );

    if (existingScript) {
      // Script already loading, wait for callback
      const original = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        original?.();
        setIsApiLoaded(true);
      };
      return;
    }

    window.onYouTubeIframeAPIReady = () => {
      setIsApiLoaded(true);
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Initialize player when API is loaded
  useEffect(() => {
    if (!isApiLoaded || !window.YT) return;

    const player = new window.YT.Player(containerRef.current, {
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: (event) => {
          playerRef.current = event.target;
          onReady?.();
        },
        onStateChange: (event) => {
          // Start/stop time polling based on playback state
          if (event.data === window.YT.PlayerState.PLAYING) {
            startTimePolling();
          } else {
            stopTimePolling();
            // Emit one final time update for pause/seek
            if (playerRef.current) {
              onTimeUpdate(playerRef.current.getCurrentTime());
            }
          }
        },
      },
    });

    return () => {
      stopTimePolling();
      player.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApiLoaded, videoId]);

  // Update playback rate when prop changes
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  const startTimePolling = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      if (playerRef.current) {
        onTimeUpdate(playerRef.current.getCurrentTime());
      }
    }, 100); // 10 updates/sec for smooth chord sync
  }, [onTimeUpdate]);

  const stopTimePolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <div id={containerRef.current} className="h-full w-full" />
    </div>
  );
}
