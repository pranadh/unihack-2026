"use client";

import { useMemo } from "react";
import type { ChordEvent } from "@/lib/api";
import {
  getChordDisplayInfo,
  type ChordDisplayMode,
  type ChordDisplaySegment,
} from "@/lib/notation";

interface ChordTimelineProps {
  chords: ChordEvent[];
  currentTime: number;
  durationSeconds: number;
  displayMode: ChordDisplayMode;
  keySegments: ChordDisplaySegment[];
  onSeek?: (time: number) => void;
}

/** Format seconds to M:SS */
function formatTime(seconds: number): string {
  if (seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ChordTimeline({
  chords,
  currentTime,
  durationSeconds,
  displayMode,
  keySegments,
  onSeek,
}: ChordTimelineProps) {
  // Find the active chord index using binary search for performance
  const activeIndex = useMemo(() => {
    if (chords.length === 0) return -1;

    // Binary search for the chord whose start <= currentTime < end
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

    // Verify the found chord actually contains currentTime
    if (result >= 0 && currentTime < chords[result].end) {
      return result;
    }

    return -1;
  }, [chords, currentTime]);

  const activeDisplay =
    activeIndex >= 0
      ? getChordDisplayInfo(chords[activeIndex].chord, displayMode, keySegments, chords[activeIndex].start)
      : null;

  if (chords.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-stone-200/55">
        No chords detected
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Current chord display - large and prominent */}
      <div className="flex flex-col items-center justify-center border-b border-white/8 py-6">
        <p className="mb-1 text-xs uppercase tracking-wider text-stone-200/55">
          Current Chord
        </p>
        <p className="text-5xl font-bold text-stone-50">
          {activeIndex >= 0 ? activeDisplay?.display ?? chords[activeIndex].chord : "--"}
        </p>
        {activeDisplay?.keyLabel ? (
          <p className="mt-1 text-xs text-stone-200/55">Key: {activeDisplay.keyLabel}</p>
        ) : null}
        <p className="mt-1 text-sm text-stone-200/55">
          {formatTime(currentTime)} / {formatTime(durationSeconds)}
        </p>
      </div>

      {/* Scrollable chord list */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {chords.map((chord, i) => {
            const isActive = i === activeIndex;
            const isPast = currentTime > chord.end;
            const display = getChordDisplayInfo(chord.chord, displayMode, keySegments, chord.start);

            return (
              <button
                key={`${chord.start}-${chord.chord}`}
                onClick={() => onSeek?.(chord.start)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-all ${
                  isActive
                    ? "bg-white/8 ring-1 ring-white/12"
                    : isPast
                      ? "opacity-50 hover:opacity-75"
                      : "hover:bg-white/6"
                }`}
                aria-current={isActive ? "true" : undefined}
                aria-label={`${chord.chord} at ${formatTime(chord.start)}`}
                title={display.keyLabel ? `${display.original} - ${display.keyLabel}` : display.original}
              >
                <span className="w-12 text-right text-xs text-stone-200/55">
                  {formatTime(chord.start)}
                </span>
                <span
                  className={`text-lg font-semibold ${
                    isActive ? "text-amber-50" : "text-stone-100"
                  }`}
                >
                  {display.display}
                </span>
                {display.keyLabel ? (
                  <span className="text-[11px] text-stone-300/45">{display.keyLabel}</span>
                ) : null}
                <span className="ml-auto text-xs text-stone-300/40">
                  {(chord.end - chord.start).toFixed(1)}s
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
