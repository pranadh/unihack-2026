"use client";

interface PlaybackControlsProps {
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5];

export default function PlaybackControls({
  playbackRate,
  onPlaybackRateChange,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-blue-100/65">Speed:</span>
      <div className="flex gap-1">
        {RATES.map((rate) => (
          <button
            key={rate}
            onClick={() => onPlaybackRateChange(rate)}
            className={`min-w-[44px] min-h-[44px] rounded-md px-2 py-1 text-sm font-medium transition-colors ${
              playbackRate === rate
                ? "bg-[#3242CA] text-white"
                : "bg-blue-950/60 text-blue-100/75 hover:bg-blue-900/70 hover:text-white"
            }`}
            aria-label={`Set playback speed to ${rate}x`}
            aria-pressed={playbackRate === rate}
          >
            {rate}x
          </button>
        ))}
      </div>
    </div>
  );
}
