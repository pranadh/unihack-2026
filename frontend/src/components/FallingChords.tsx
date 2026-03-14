"use client";

import { useMemo, useRef, useEffect, useCallback, useState } from "react";
import type { ChordEvent } from "@/lib/api";
import ChordDiagram from "./ChordDiagram";

/**
 * osu!mania-style rising chord display.
 *
 * Chords rise from the bottom of the lane toward a "hit line" near the top.
 * When the current playback time matches a chord's start, that chord's leading
 * (top) edge reaches the hit line. The visible window covers a configurable
 * number of seconds ahead of and behind the current time.
 *
 * Uses CSS `transform: translateY()` for GPU-accelerated animation.
 * Updates position via requestAnimationFrame for smooth 60fps movement,
 * interpolating between the 100ms state updates from the YouTube player.
 */

interface FallingChordsProps {
  chords: ChordEvent[];
  currentTime: number;
  durationSeconds: number;
  onSeek?: (time: number) => void;
}

// How many seconds of "look-ahead" are visible below the hit line
const LOOK_AHEAD_SECONDS = 4;
// How many seconds of "look-behind" are visible above the hit line
const LOOK_BEHIND_SECONDS = 1;
// Hit line position as a fraction from top (0.2 = near top)
const HIT_LINE_POSITION = 0.2;

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
  { bg: "50,66,202", border: "#6f7ff0", text: "#dce5ff" },
  { bg: "59,130,246", border: "#60a5fa", text: "#dbeafe" },
  { bg: "14,116,144", border: "#22d3ee", text: "#cffafe" },
  { bg: "30,64,175", border: "#93c5fd", text: "#dbeafe" },
  { bg: "37,99,235", border: "#93c5fd", text: "#dbeafe" },
  { bg: "3,105,161", border: "#7dd3fc", text: "#e0f2fe" },
  { bg: "15,23,42", border: "#60a5fa", text: "#bfdbfe" },
  { bg: "67,56,202", border: "#a5b4fc", text: "#e0e7ff" },
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

  // ── Smooth interpolation state ──
  // We track when the last currentTime update arrived and interpolate forward
  // using performance.now() to achieve 60fps smooth scrolling.
  const interpRef = useRef({
    baseTime: 0,          // last currentTime from props
    baseTimestamp: 0,     // performance.now() when baseTime was received
    prevBaseTime: 0,      // previous baseTime (to detect seeks/pauses)
    isPlaying: false,     // whether playback appears active
  });

  // Update interpolation anchor whenever currentTime changes from props
  useEffect(() => {
    const now = performance.now();
    const prev = interpRef.current;
    const timeDelta = currentTime - prev.baseTime;

    // Detect if playback is active: time moved forward by ~50-200ms
    // A seek or pause will have a very different delta
    const isNormalTick = timeDelta > 0.01 && timeDelta < 0.5;

    prev.prevBaseTime = prev.baseTime;
    prev.baseTime = currentTime;
    prev.baseTimestamp = now;
    prev.isPlaying = isNormalTick;
  }, [currentTime]);

  // ── rAF-driven lane ──
  // We use a ref to the lane container and update transforms directly in rAF,
  // bypassing React re-renders for the falling blocks.
  const laneRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef(0);
  const nowLabelRef = useRef<HTMLDivElement>(null);

  // Store chord block refs for direct DOM manipulation
  const blockRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());

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

  // Compute visible chords with extra buffer for smooth scrolling
  const visibleChords = useMemo(() => {
    if (chords.length === 0) return [];

    // Add extra buffer beyond the visible window so blocks don't pop in/out
    const bufferS = 0.5;
    const windowStart = currentTime - LOOK_BEHIND_SECONDS - bufferS;
    const windowEnd = currentTime + LOOK_AHEAD_SECONDS + bufferS;

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
  }, [chords, currentTime]);

  // ── rAF animation loop ──
  // Directly update DOM positions every frame using interpolated time.
  useEffect(() => {
    const animate = () => {
      const interp = interpRef.current;
      let smoothTime = interp.baseTime;

      // Only interpolate forward if playback appears active
      if (interp.isPlaying) {
        const elapsed = (performance.now() - interp.baseTimestamp) / 1000;
        // Cap interpolation to 250ms to avoid overshooting during pauses
        smoothTime = interp.baseTime + Math.min(elapsed, 0.25);
      }

      const hitLineY = HIT_LINE_POSITION * containerHeight;
      const pixelsPerSecond = (containerHeight - hitLineY) / LOOK_AHEAD_SECONDS;

      // Update each chord block's position
      blockRefsMap.current.forEach((el) => {
        if (!el) return;

        // Parse the data attributes for start/end time
        const startTime = parseFloat(el.dataset.start ?? "0");
        const endTime = parseFloat(el.dataset.end ?? "0");

        // Upward lane mapping:
        // - Future chords are below the hit line
        // - Past chords are above the hit line
        // The leading (top) edge reaches the hit line at startTime.
        const startEdgeY = hitLineY + (startTime - smoothTime) * pixelsPerSecond;
        const endEdgeY = hitLineY + (endTime - smoothTime) * pixelsPerSecond;
        const height = Math.max(endEdgeY - startEdgeY, 36);
        const topY = startEdgeY;

        // Use transform for GPU acceleration (no layout thrash)
        el.style.transform = `translateY(${topY}px)`;
        el.style.height = `${height}px`;

        // Hide blocks that are completely off-screen
        const isOffscreen = topY + height < -50 || topY > containerHeight + 50;
        el.style.visibility = isOffscreen ? "hidden" : "visible";
      });

      // Update "now" timestamp label
      if (nowLabelRef.current) {
        nowLabelRef.current.textContent = formatTime(smoothTime);
      }

      rafIdRef.current = requestAnimationFrame(animate);
    };

    rafIdRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [containerHeight, visibleChords]);

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

  // Callback to register block refs
  const setBlockRef = useCallback(
    (key: string) => (el: HTMLButtonElement | null) => {
      if (el) {
        blockRefsMap.current.set(key, el);
      } else {
        blockRefsMap.current.delete(key);
      }
    },
    []
  );

  if (chords.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-blue-100/55">
        No chords detected
      </div>
    );
  }

  const hitLineY = HIT_LINE_POSITION * containerHeight;

  return (
    <div className="flex h-full flex-col">
      {/* Top: prioritize current + next chord visibility */}
      <div className="border-b border-blue-300/20 px-3 py-3 sm:px-4">
        <div className="flex items-stretch justify-center gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 max-w-[260px] flex-col items-center rounded-lg border border-blue-300/35 bg-[#3242CA]/20 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wider text-blue-100/80">Now</p>
            <p className="truncate text-3xl font-bold text-blue-100">
              {activeChord && activeChord.chord !== "N" ? activeChord.chord : "--"}
            </p>
            {activeChord && activeChord.chord !== "N" ? (
              <ChordDiagram chord={activeChord.chord} size={112} />
            ) : (
              <div className="flex h-[140px] w-[112px] items-center justify-center">
                <span className="text-2xl text-blue-100/45">--</span>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 max-w-[260px] flex-col items-center rounded-lg border border-blue-300/20 bg-blue-950/45 px-2 py-2">
            <p className="text-[10px] uppercase tracking-wider text-blue-100/60">Next</p>
            <p className="truncate text-3xl font-bold text-blue-50">
              {nextChord ? nextChord.chord : "--"}
            </p>
            {nextChord ? (
              <ChordDiagram chord={nextChord.chord} size={100} />
            ) : (
              <div className="flex h-[125px] w-[100px] items-center justify-center">
                <span className="text-2xl text-blue-100/35">--</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-center gap-2 text-xs sm:text-sm">
          <span className="font-medium text-blue-100/80">
            {formatTime(currentTime)} / {formatTime(durationSeconds)}
          </span>
          {nextChord ? (
            <span className="text-blue-100/50">
              in {Math.max(0, nextChord.start - currentTime).toFixed(1)}s
            </span>
          ) : null}
        </div>
      </div>

      {/* Rising notes lane */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-[#060d1f]/80"
      >
        {/* Background lane lines (subtle grid) */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Vertical center line */}
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-blue-300/20" />
          {/* Horizontal timing guides (look-ahead below hit line) */}
          {Array.from({ length: LOOK_AHEAD_SECONDS }, (_, i) => {
            const belowHitLine = containerHeight - hitLineY;
            const y = hitLineY + ((i + 1) / LOOK_AHEAD_SECONDS) * belowHitLine;
            return (
              <div
                key={`guide-${i}`}
                className="absolute left-0 right-0 h-px bg-blue-300/15"
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
          <div className="h-[2px] w-full bg-blue-300/80 shadow-[0_0_8px_rgba(147,197,253,0.45)]" />
        </div>

        {/* Hit zone glow */}
        <div
          className="absolute left-0 right-0 z-0 pointer-events-none"
          style={{
            top: hitLineY - 20,
            height: 40,
            background:
              "linear-gradient(to bottom, transparent, rgba(147,197,253,0.12), transparent)",
          }}
        />

        {/* Rising chord blocks - positioned by rAF, not React render */}
        <div ref={laneRef}>
          {visibleChords.map(({ chord, index }) => {
            const isActive = index === activeIndex;
            const isPast = chord.end < currentTime;
            const colors = chordColors(chord.chord);
            const bgOpacity = isActive ? 0.35 : isPast ? 0.1 : 0.25;
            const blockKey = `${index}-${chord.start}`;

            return (
              <button
                key={blockKey}
                ref={setBlockRef(blockKey)}
                data-start={chord.start}
                data-end={chord.end}
                className={`absolute left-2 right-2 z-20 flex items-center justify-center rounded-lg border-l-4 will-change-transform ${
                  isActive
                    ? "ring-2 ring-blue-200/60 shadow-lg shadow-blue-400/20"
                    : isPast
                      ? "opacity-40"
                      : ""
                }`}
                style={{
                  top: 0, // actual position set by transform in rAF
                  backgroundColor: `rgba(${colors.bg}, ${bgOpacity})`,
                  borderLeftColor: colors.border,
                }}
                onClick={() => onSeek?.(chord.start)}
                aria-label={`${chord.chord} at ${formatTime(chord.start)}`}
              >
                <span
                  className="text-base font-bold"
                  style={{ color: isActive ? "#ffffff" : colors.text }}
                >
                  {chord.chord}
                </span>
                <span className="ml-2 text-[11px] text-blue-100/50">
                  {formatTime(chord.start)}
                </span>
              </button>
            );
          })}
        </div>

        {/* "Now" timestamp at hit line */}
        <div
          ref={nowLabelRef}
          className="absolute left-1 z-10 text-[10px] font-mono text-blue-200/70 pointer-events-none"
          style={{ top: Math.max(0, hitLineY - 14) }}
        >
          {formatTime(currentTime)}
        </div>
      </div>
    </div>
  );
}
