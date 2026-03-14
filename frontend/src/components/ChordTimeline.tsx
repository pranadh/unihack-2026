"use client";

import { useMemo } from "react";
import type { ChordEvent } from "@/lib/api";

interface ChordTimelineProps {
  chords: ChordEvent[];
  currentTime: number;
  durationSeconds: number;
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

  if (chords.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-blue-100/55">
        No chords detected
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Current chord display - large and prominent */}
      <div className="flex flex-col items-center justify-center border-b border-blue-300/20 py-6">
        <p className="mb-1 text-xs uppercase tracking-wider text-blue-100/55">
          Current Chord
        </p>
        <p className="text-5xl font-bold text-blue-100">
          {activeIndex >= 0 ? chords[activeIndex].chord : "--"}
        </p>
        <p className="mt-1 text-sm text-blue-100/55">
          {formatTime(currentTime)} / {formatTime(durationSeconds)}
        </p>
      </div>

      {/* Scrollable chord list */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {chords.map((chord, i) => {
            const isActive = i === activeIndex;
            const isPast = currentTime > chord.end;

            return (
              <button
                key={`${chord.start}-${chord.chord}`}
                onClick={() => onSeek?.(chord.start)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-all ${
                  isActive
                    ? "bg-[#3242CA]/25 ring-1 ring-blue-200/40"
                    : isPast
                      ? "opacity-50 hover:opacity-75"
                      : "hover:bg-blue-900/35"
                }`}
                aria-current={isActive ? "true" : undefined}
                aria-label={`${chord.chord} at ${formatTime(chord.start)}`}
              >
                <span className="w-12 text-right text-xs text-blue-100/55">
                  {formatTime(chord.start)}
                </span>
                <span
                  className={`text-lg font-semibold ${
                    isActive ? "text-blue-100" : "text-blue-50"
                  }`}
                >
                  {chord.chord}
                </span>
                <span className="ml-auto text-xs text-blue-100/45">
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
