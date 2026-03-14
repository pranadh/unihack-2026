"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import YouTubePlayer from "@/components/YouTubePlayer";
import type { YouTubePlayerHandle } from "@/components/YouTubePlayer";
import FallingChords from "@/components/FallingChords";
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

type ViewMode = "falling" | "list";

/**
 * Fixed offset (in seconds) added to the YouTube playback time before passing
 * it to chord display components. This compensates for the inherent latency
 * between YouTube's reported `getCurrentTime()` and what the user actually
 * hears/sees (IFrame API polling delay + communication overhead).
 *
 * A positive value makes chords appear *earlier* relative to the video,
 * which fixes the "chords arrive too late" problem.
 */
const CHORD_OFFSET_SECONDS = 0.3;

function PlaybackContent() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("v");

  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [playData, setPlayData] = useState<PlayData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("falling");

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

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-blue-200"
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
          <p className="text-sm text-blue-100/75">Loading playback data...</p>
        </div>
      </div>
    );
  }

  if (error || !playData) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="max-w-md rounded-lg border border-red-300/35 bg-red-300/10 p-6 text-center">
          <h2 className="text-lg font-semibold text-red-100">Error</h2>
          <p className="mt-2 text-sm text-red-100/85">
            {error || "No playback data available."}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-md bg-[#3242CA] px-4 py-2 text-sm text-white transition-colors hover:bg-[#2b3ab2]"
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
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      {/* Title bar */}
      <div className="border-b border-blue-300/20 bg-blue-950/25 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-white">
              {playData.title ?? "Playback Workspace"}
            </h1>
            <div className="flex items-center gap-3">
              <p className="text-xs text-blue-100/60">
                Video: {playData.videoId}
              </p>
              {playData.bpm ? (
                <span className="rounded bg-[#3242CA]/30 px-1.5 py-0.5 text-xs font-medium text-blue-100">
                  {Math.round(playData.bpm)} BPM{playData.variable_tempo ? " (variable)" : ""}
                </span>
              ) : null}
            </div>
          </div>

          {/* View mode toggle */}
          <div className="mx-4 flex items-center gap-1 rounded-lg bg-blue-950/55 p-1">
            <button
              onClick={() => setViewMode("falling")}
              className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "falling"
                  ? "bg-[#3242CA] text-white"
                  : "text-blue-100/70 hover:text-white"
              }`}
              aria-label="Falling notes view"
              aria-pressed={viewMode === "falling"}
            >
              Falling
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-[#3242CA] text-white"
                  : "text-blue-100/70 hover:text-white"
              }`}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
            >
              List
            </button>
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
            ref={playerRef}
            videoId={playData.videoId}
            onTimeUpdate={handleTimeUpdate}
            playbackRate={playbackRate}
          />
        </div>

        {/* Chord panel (falling or list view) */}
        <div className="flex h-[calc(100vh-12rem)] flex-col rounded-lg border border-blue-300/20 bg-blue-950/35 lg:flex-1">
          {viewMode === "falling" ? (
            <FallingChords
              chords={playData.chords}
              currentTime={currentTime + CHORD_OFFSET_SECONDS}
              durationSeconds={durationSeconds}
              onSeek={handleSeek}
            />
          ) : (
            <ChordTimeline
              chords={playData.chords}
              currentTime={currentTime + CHORD_OFFSET_SECONDS}
              durationSeconds={durationSeconds}
              onSeek={handleSeek}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
          <p className="text-blue-100/75">Loading...</p>
        </div>
      }
    >
      <PlaybackContent />
    </Suspense>
  );
}
