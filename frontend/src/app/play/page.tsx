"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import YouTubePlayer from "@/components/YouTubePlayer";
import ChordTimeline from "@/components/ChordTimeline";
import PlaybackControls from "@/components/PlaybackControls";
import type { ChordEvent } from "@/lib/api";

interface PlayData {
  videoId: string;
  youtubeUrl: string;
  chords: ChordEvent[];
  duration?: number;
  bpm?: number;
  variable_tempo?: boolean;
  title?: string;
}

function PlaybackContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("v");

  const [playData, setPlayData] = useState<PlayData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("karachordy-play");
      if (!raw) {
        setError("No playback data found. Please submit a YouTube link from the home page.");
        setLoading(false);
        return;
      }

      const data = JSON.parse(raw) as PlayData;

      // Verify video ID matches if provided
      if (videoId && data.videoId !== videoId) {
        setError("Playback data does not match the requested video.");
        setLoading(false);
        return;
      }

      setPlayData(data);
    } catch {
      setError("Failed to load playback data.");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSeek = useCallback((_time: number) => {
    // TODO: wire up seek via player ref forwarding
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-violet-400"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              className="opacity-25"
            />
            <path
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              fill="currentColor"
              className="opacity-75"
            />
          </svg>
          <p className="text-sm text-zinc-400">Loading playback data...</p>
        </div>
      </div>
    );
  }

  if (error || !playData) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-zinc-950">
        <div className="max-w-md rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-center">
          <h2 className="text-lg font-semibold text-red-400">Error</h2>
          <p className="mt-2 text-sm text-red-300/80">
            {error || "No playback data available."}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md bg-zinc-800 px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-700"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const durationSeconds =
    playData.duration ??
    (playData.chords.length > 0
      ? Math.max(...playData.chords.map((c) => c.end))
      : 0);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-zinc-950">
      {/* Title bar */}
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">
              {playData.title ?? "Playback Workspace"}
            </h1>
            <div className="flex items-center gap-3">
              <p className="text-xs text-zinc-500">
                Video: {playData.videoId}
              </p>
              {playData.bpm ? (
                <span className="rounded bg-violet-600/20 px-1.5 py-0.5 text-xs font-medium text-violet-400">
                  {Math.round(playData.bpm)} BPM{playData.variable_tempo ? " (variable)" : ""}
                </span>
              ) : null}
            </div>
          </div>
          <PlaybackControls
            playbackRate={playbackRate}
            onPlaybackRateChange={setPlaybackRate}
          />
        </div>
      </div>

      {/* Main content: video + chord panel */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 lg:flex-row">
        {/* Video player */}
        <div className="flex-1 lg:flex-[2]">
          <YouTubePlayer
            videoId={playData.videoId}
            onTimeUpdate={handleTimeUpdate}
            playbackRate={playbackRate}
          />
        </div>

        {/* Chord timeline sidebar */}
        <div className="flex h-[calc(100vh-12rem)] flex-col rounded-lg border border-zinc-800 bg-zinc-900/50 lg:flex-1">
          <ChordTimeline
            chords={playData.chords}
            currentTime={currentTime}
            durationSeconds={durationSeconds}
            onSeek={handleSeek}
          />
        </div>
      </div>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-zinc-950">
          <p className="text-zinc-400">Loading...</p>
        </div>
      }
    >
      <PlaybackContent />
    </Suspense>
  );
}
