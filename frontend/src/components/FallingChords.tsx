"use client";

import { useMemo, useRef, useEffect, useCallback, useState } from "react";
import type { ChordEvent } from "@/lib/api";
import ChordDiagram from "./ChordDiagram";

/**
 * osu!mania-style falling chord display.
 *
 * Chords fall from the top of the lane toward a "hit line" near the bottom.
 * When the current playback time matches a chord's start, that chord's leading
 * edge arrives at the hit line. The visible window covers a configurable number
 * of seconds ahead of and behind the current time.
 *
 * Uses CSS `transform: translateY()` for GPU-accelerated animation.
 * Updates position via requestAnimationFrame for smooth 60fps movement.
 */

interface FallingChordsProps {
  chords: ChordEvent[];
  currentTime: number;
  durationSeconds: number;
  onSeek?: (time: number) => void;
}

// How many seconds of "look-ahead" are visible above the hit line
const LOOK_AHEAD_SECONDS = 4;
// How many seconds of "look-behind" are visible below the hit line
const LOOK_BEHIND_SECONDS = 1;
// Hit line position as a fraction from top (0.8 = 80% down)
const HIT_LINE_POSITION = 0.8;

/** Format seconds to M:SS */
function formatTime(seconds: number): string {
  if (seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Color palette for chord blocks. Uses inline styles to avoid Tailwind JIT issues with dynamic classes. */
interface ChordColors {
  bg: string;       // rgba for background fill
  border: string;   // hex for left border
  text: string;     // hex for chord label text
}

const COLOR_PALETTE: ChordColors[] = [
  { bg: "139,92,246",  border: "#a78bfa", text: "#ddd6fe" },   // violet
  { bg: "59,130,246",  border: "#60a5fa", text: "#bfdbfe" },   // blue
  { bg: "16,185,129",  border: "#34d399", text: "#a7f3d0" },   // emerald
  { bg: "245,158,11",  border: "#fbbf24", text: "#fde68a" },   // amber
  { bg: "244,63,94",   border: "#fb7185", text: "#fecdd3" },   // rose
  { bg: "6,182,212",   border: "#22d3ee", text: "#a5f3fc" },   // cyan
  { bg: "217,70,239",  border: "#e879f9", text: "#f5d0fe" },   // fuchsia
  { bg: "132,204,22",  border: "#a3e635", text: "#d9f99d" },   // lime
  { bg: "249,115,22",  border: "#fb923c", text: "#fed7aa" },   // orange
  { bg: "20,184,166",  border: "#2dd4bf", text: "#99f6e4" },   // teal
  { bg: "236,72,153",  border: "#f472b6", text: "#fbcfe8" },   // pink
  { bg: "99,102,241",  border: "#818cf8", text: "#c7d2fe" },   // indigo
];

/** Assign a consistent color set to each unique chord name */
function chordColors(chord: string): ChordColors {
  let hash = 0;
  for (let i = 0; i < chord.length; i++) {
    hash = (hash * 31 + chord.charCodeAt(i)) | 0;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

export default function FallingChords({
  chords,
  currentTime,
  durationSeconds,
  onSeek,
}: FallingChordsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  // Observe container height changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Find active chord index via binary search
  const activeIndex = useMemo(() => {
    if (chords.length === 0) return -1;
    let lo = 0;
    let hi = chords.length - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (chords[mid].start <= currentTime) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (result >= 0 && currentTime < chords[result].end) {
      return result;
    }
    return -1;
  }, [chords, currentTime]);

  // Compute which chords are visible in the falling window
  const visibleWindow = useMemo(() => {
    const windowStart = currentTime - LOOK_BEHIND_SECONDS;
    const windowEnd = currentTime + LOOK_AHEAD_SECONDS;
    return { windowStart, windowEnd };
  }, [currentTime]);

  // Get visible chords using binary search for performance
  const visibleChords = useMemo(() => {
    if (chords.length === 0) return [];

    const { windowStart, windowEnd } = visibleWindow;

    // Find first chord that could be visible (end > windowStart)
    let lo = 0;
    let hi = chords.length - 1;
    let firstVisible = chords.length;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (chords[mid].end > windowStart) {
        firstVisible = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    const result: Array<{ chord: ChordEvent; index: number }> = [];
    for (let i = firstVisible; i < chords.length; i++) {
      if (chords[i].start > windowEnd) break;
      // Skip "N" (no chord / silence) blocks
      if (chords[i].chord === "N") continue;
      result.push({ chord: chords[i], index: i });
    }
    return result;
  }, [chords, visibleWindow]);

  // Convert a time offset (relative to currentTime) to a Y pixel position
  const timeToY = useCallback(
    (time: number): number => {
      // At currentTime, Y = hitLineY (HIT_LINE_POSITION * containerHeight)
      // time > currentTime -> Y < hitLineY (above = future)
      // time < currentTime -> Y > hitLineY (below = past)
      const hitLineY = HIT_LINE_POSITION * containerHeight;
      const pixelsPerSecond = hitLineY / LOOK_AHEAD_SECONDS;
      const offset = time - currentTime; // positive = future
      return hitLineY - offset * pixelsPerSecond;
    },
    [containerHeight, currentTime]
  );

  // Find unique chord names for the upcoming section (for "next up" display)
  const activeChord = activeIndex >= 0 ? chords[activeIndex] : null;

  // Next chord that isn't "N"
  const nextChord = useMemo(() => {
    if (activeIndex < 0) {
      // Before any chord starts, find the first non-N chord
      for (let i = 0; i < chords.length; i++) {
        if (chords[i].chord !== "N" && chords[i].start > currentTime) return chords[i];
      }
      return null;
    }
    for (let i = activeIndex + 1; i < chords.length; i++) {
      if (chords[i].chord !== "N") return chords[i];
    }
    return null;
  }, [chords, activeIndex, currentTime]);

  if (chords.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        No chords detected
      </div>
    );
  }

  const hitLineY = HIT_LINE_POSITION * containerHeight;

  return (
    <div className="flex h-full flex-col">
      {/* Top: Current chord info + diagram */}
      <div className="flex items-center gap-4 border-b border-zinc-700/50 px-4 py-3">
        {/* Current chord diagram */}
        <div className="flex flex-col items-center">
          {activeChord && activeChord.chord !== "N" ? (
            <ChordDiagram chord={activeChord.chord} size={100} />
          ) : (
            <div className="flex h-[125px] w-[100px] items-center justify-center">
              <span className="text-2xl text-zinc-600">--</span>
            </div>
          )}
        </div>

        {/* Current + next chord labels */}
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Now Playing</p>
          <p className="text-3xl font-bold text-violet-400">
            {activeChord && activeChord.chord !== "N" ? activeChord.chord : "--"}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {formatTime(currentTime)} / {formatTime(durationSeconds)}
          </p>
          {nextChord && (
            <p className="text-xs text-zinc-500">
              Next: <span className="font-semibold text-zinc-300">{nextChord.chord}</span>
              <span className="ml-1 text-zinc-600">
                ({Math.max(0, nextChord.start - currentTime).toFixed(1)}s)
              </span>
            </p>
          )}
        </div>

        {/* Next chord diagram (smaller) */}
        <div className="flex flex-col items-center">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">Next</p>
          {nextChord ? (
            <ChordDiagram chord={nextChord.chord} size={70} />
          ) : (
            <div className="flex h-[87px] w-[70px] items-center justify-center">
              <span className="text-lg text-zinc-700">--</span>
            </div>
          )}
        </div>
      </div>

      {/* Falling notes lane */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-zinc-950/80"
      >
        {/* Background lane lines (subtle grid) */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Vertical center line */}
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-zinc-800/50" />
          {/* Horizontal timing guides */}
          {Array.from({ length: LOOK_AHEAD_SECONDS }, (_, i) => {
            const y = hitLineY - ((i + 1) / LOOK_AHEAD_SECONDS) * hitLineY;
            return (
              <div
                key={`guide-${i}`}
                className="absolute left-0 right-0 h-px bg-zinc-800/30"
                style={{ top: y }}
              />
            );
          })}
        </div>

        {/* Hit line (target zone) */}
        <div
          className="absolute left-0 right-0 z-10 flex items-center"
          style={{ top: hitLineY - 1 }}
        >
          <div className="h-[2px] w-full bg-violet-500/80 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
        </div>

        {/* Hit zone glow */}
        <div
          className="absolute left-0 right-0 z-0 pointer-events-none"
          style={{
            top: hitLineY - 20,
            height: 40,
            background:
              "linear-gradient(to bottom, transparent, rgba(139,92,246,0.08), transparent)",
          }}
        />

        {/* Falling chord blocks */}
        {visibleChords.map(({ chord, index }) => {
          const topY = timeToY(chord.start);
          const bottomY = timeToY(chord.end);
          const height = Math.max(bottomY - topY, 24); // minimum height for readability
          const isActive = index === activeIndex;
          const isPast = chord.end < currentTime;
          const colors = chordColors(chord.chord);

          const bgOpacity = isActive ? 0.3 : isPast ? 0.1 : 0.2;

          return (
            <button
              key={`${index}-${chord.start}`}
              className={`absolute left-2 right-2 z-20 flex items-center justify-center rounded-md border-l-4 transition-opacity ${
                isActive
                  ? "ring-2 ring-violet-400/60 shadow-lg shadow-violet-500/20"
                  : isPast
                    ? "opacity-40"
                    : ""
              }`}
              style={{
                top: topY,
                height,
                backgroundColor: `rgba(${colors.bg}, ${bgOpacity})`,
                borderLeftColor: colors.border,
              }}
              onClick={() => onSeek?.(chord.start)}
              aria-label={`${chord.chord} at ${formatTime(chord.start)}`}
            >
              <span
                className={`text-sm font-bold ${height < 32 ? "text-xs" : ""}`}
                style={{ color: isActive ? "#ffffff" : colors.text }}
              >
                {chord.chord}
              </span>
              {height >= 40 && (
                <span className="ml-2 text-[10px] text-zinc-500">
                  {formatTime(chord.start)}
                </span>
              )}
            </button>
          );
        })}

        {/* "Now" timestamp at hit line */}
        <div
          className="absolute left-1 z-10 text-[10px] font-mono text-violet-400/60 pointer-events-none"
          style={{ top: hitLineY + 4 }}
        >
          {formatTime(currentTime)}
        </div>
      </div>
    </div>
  );
}
