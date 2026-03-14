"use client";

import { useState, useCallback, useEffect, useRef, Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import YouTubePlayer from "@/components/YouTubePlayer";
import type { YouTubePlayerHandle } from "@/components/YouTubePlayer";
import FallingChords from "@/components/FallingChords";
import ChordTimeline from "@/components/ChordTimeline";
import PlaybackControls from "@/components/PlaybackControls";
import { fetchVideoTitle, type ChordEvent } from "@/lib/api";
import {
  DEFAULT_INSTRUMENT,
  INSTRUMENT_STORAGE_KEY,
  isInstrument,
  type Instrument,
} from "@/lib/instruments";
import {
  buildChordDisplaySegments,
  CHORD_DISPLAY_MODE_STORAGE_KEY,
  DEFAULT_CHORD_DISPLAY_MODE,
  isChordDisplayMode,
  type ChordDisplayMode,
} from "@/lib/notation";

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
const EMPTY_CHORDS: ChordEvent[] = [];

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
  const [instrument, setInstrument] = useState<Instrument>(DEFAULT_INSTRUMENT);
  const [chordDisplayMode, setChordDisplayMode] = useState<ChordDisplayMode>(
    DEFAULT_CHORD_DISPLAY_MODE
  );

  useEffect(() => {
    try {
      const storedInstrument = window.localStorage.getItem(INSTRUMENT_STORAGE_KEY);
      if (isInstrument(storedInstrument)) {
        setInstrument(storedInstrument);
      }

      const storedChordDisplayMode = window.localStorage.getItem(
        CHORD_DISPLAY_MODE_STORAGE_KEY
      );
      if (isChordDisplayMode(storedChordDisplayMode)) {
        setChordDisplayMode(storedChordDisplayMode);
      }
    } catch {
      // Ignore storage access issues and fall back to default display preferences.
    }

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

  useEffect(() => {
    try {
      window.localStorage.setItem(INSTRUMENT_STORAGE_KEY, instrument);
    } catch {
      // Ignore storage access issues; instrument choice still works for this session.
    }
  }, [instrument]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHORD_DISPLAY_MODE_STORAGE_KEY, chordDisplayMode);
    } catch {
      // Ignore storage access issues; display choice still works for this session.
    }
  }, [chordDisplayMode]);

  useEffect(() => {
    if (!playData?.videoId || playData.title) {
      return;
    }

    let cancelled = false;

    const loadTitle = async () => {
      try {
        const title = await fetchVideoTitle(playData.videoId);
        if (cancelled) {
          return;
        }

        setPlayData((prev) => {
          if (!prev || prev.videoId !== playData.videoId) {
            return prev;
          }

          const next = { ...prev, title };
          try {
            sessionStorage.setItem("karachordy-play", JSON.stringify(next));
          } catch {
            // Ignore storage write issues; title can still render in memory.
          }
          return next;
        });
      } catch {
        // Leave the existing fallback title in place if metadata fetch fails.
      }
    };

    void loadTitle();

    return () => {
      cancelled = true;
    };
  }, [playData]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
  }, []);

  const playbackChords = useMemo(() => playData?.chords ?? EMPTY_CHORDS, [playData?.chords]);
  const durationSeconds =
    playData?.duration ??
    (playbackChords.length > 0 ? Math.max(...playbackChords.map((c) => c.end)) : 0);

  const displaySegments = useMemo(() => buildChordDisplaySegments(playbackChords), [playbackChords]);
  const adjustedCurrentTime = currentTime + CHORD_OFFSET_SECONDS;
  const currentKeyLabel =
    displaySegments.find(
      (segment) => adjustedCurrentTime >= segment.start && adjustedCurrentTime < segment.end
    )?.keyLabel ?? displaySegments[displaySegments.length - 1]?.keyLabel ?? null;

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#0d0b12]">
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
          <p className="text-sm text-stone-200/75">Loading playback data...</p>
        </div>
      </div>
    );
  }

  if (error || !playData) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#0d0b12]">
        <div className="max-w-md rounded-lg border border-red-300/35 bg-red-300/10 p-6 text-center">
          <h2 className="text-lg font-semibold text-red-100">Error</h2>
          <p className="mt-2 text-sm text-red-100/85">
            {error || "No playback data available."}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-xl bg-gradient-to-r from-[#3242CA] via-[#7054b8] to-[#d7795f] px-4 py-2 text-sm text-white transition-all hover:brightness-110"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-[#0d0b12]">
      {/* Title bar */}
      <div className="border-b border-white/8 bg-[#14101b]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-white">
              {playData.title ?? playData.videoId}
            </h1>
            <div className="flex items-center gap-3">
              {playData.bpm ? (
                <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-xs font-medium text-stone-100">
                  {Math.round(playData.bpm)} BPM{playData.variable_tempo ? " (variable)" : ""}
                </span>
              ) : null}
              {currentKeyLabel ? (
                <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-xs font-medium text-stone-100">
                  Key: {currentKeyLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mx-4 flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
              <button
                onClick={() => setChordDisplayMode("names")}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  chordDisplayMode === "names"
                    ? "bg-[#7054b8] text-white"
                    : "text-stone-200/70 hover:text-white"
                }`}
                aria-label="Show actual chord names"
                aria-pressed={chordDisplayMode === "names"}
              >
                Chords
              </button>
              <button
                onClick={() => setChordDisplayMode("roman")}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  chordDisplayMode === "roman"
                    ? "bg-[#7054b8] text-white"
                    : "text-stone-200/70 hover:text-white"
                }`}
                aria-label="Show roman numeral notation"
                aria-pressed={chordDisplayMode === "roman"}
              >
                I II III
              </button>
            </div>

            <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
              <button
                onClick={() => setInstrument("guitar")}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  instrument === "guitar"
                    ? "bg-[#d7795f] text-white"
                    : "text-stone-200/70 hover:text-white"
                }`}
                aria-label="Show guitar chord diagrams"
                aria-pressed={instrument === "guitar"}
              >
                Guitar
              </button>
              <button
                onClick={() => setInstrument("piano")}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  instrument === "piano"
                    ? "bg-[#d7795f] text-white"
                    : "text-stone-200/70 hover:text-white"
                }`}
                aria-label="Show piano chord diagrams"
                aria-pressed={instrument === "piano"}
              >
                Piano
              </button>
            </div>

            <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
              <button
                onClick={() => setViewMode("falling")}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "falling"
                    ? "bg-[#3242CA] text-white"
                    : "text-stone-200/70 hover:text-white"
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
                    : "text-stone-200/70 hover:text-white"
                }`}
                aria-label="List view"
                aria-pressed={viewMode === "list"}
              >
                List
              </button>
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
            ref={playerRef}
            videoId={playData.videoId}
            onTimeUpdate={handleTimeUpdate}
            playbackRate={playbackRate}
          />
        </div>

        {/* Chord panel (falling or list view) */}
        <div className="flex h-[calc(100vh-12rem)] flex-col rounded-[1.5rem] border border-white/8 bg-[#15111b] shadow-[0_18px_50px_rgba(0,0,0,0.18)] lg:flex-1">
          {viewMode === "falling" ? (
            <FallingChords
              chords={playData.chords}
              currentTime={adjustedCurrentTime}
              durationSeconds={durationSeconds}
              instrument={instrument}
              displayMode={chordDisplayMode}
              keySegments={displaySegments}
              onSeek={handleSeek}
            />
          ) : (
              <ChordTimeline
                chords={playData.chords}
                currentTime={adjustedCurrentTime}
                durationSeconds={durationSeconds}
                displayMode={chordDisplayMode}
                keySegments={displaySegments}
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
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#0d0b12]">
          <p className="text-stone-200/75">Loading...</p>
        </div>
      }
    >
      <PlaybackContent />
    </Suspense>
  );
}
