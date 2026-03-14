"use client";

import type { SongRequest } from "@/lib/api";

interface StatusPanelProps {
  request: SongRequest | null;
  onRetry?: () => void;
}

const STATUS_CONFIG: Record<
  SongRequest["status"],
  { label: string; color: string; bgColor: string }
> = {
  queued: {
    label: "Queued",
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10 border-yellow-400/20",
  },
  processing: {
    label: "Processing",
    color: "text-blue-400",
    bgColor: "bg-blue-400/10 border-blue-400/20",
  },
  complete: {
    label: "Complete",
    color: "text-green-400",
    bgColor: "bg-green-400/10 border-green-400/20",
  },
  failed: {
    label: "Failed",
    color: "text-red-400",
    bgColor: "bg-red-400/10 border-red-400/20",
  },
};

export default function StatusPanel({ request, onRetry }: StatusPanelProps) {
  if (!request) return null;

  const config = STATUS_CONFIG[request.status];

  return (
    <div
      className={`w-full max-w-2xl rounded-lg border p-4 ${config.bgColor}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(request.status === "queued" || request.status === "processing") && (
            <svg
              className="h-5 w-5 animate-spin text-blue-400"
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
          )}
          <div>
            <p className={`text-sm font-semibold ${config.color}`}>
              {config.label}
            </p>
            <p className="text-xs text-zinc-400">
              Request ID: {request.id.slice(0, 12)}...
            </p>
          </div>
        </div>

        {request.status === "failed" && onRetry && (
          <button
            onClick={onRetry}
            className="rounded-md bg-red-600/20 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-600/30"
          >
            Retry
          </button>
        )}
      </div>

      {request.status === "failed" && request.errorMessage && (
        <p className="mt-2 text-sm text-red-300/80">
          {request.errorMessage}
        </p>
      )}

      {request.status === "processing" && (
        <p className="mt-2 text-sm text-blue-300/80">
          Extracting chords from video... This may take up to 60 seconds.
        </p>
      )}
    </div>
  );
}
