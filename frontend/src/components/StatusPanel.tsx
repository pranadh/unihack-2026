"use client";

/** Local type – mirrors the shape the old backend API returned. */
interface SongRequest {
  id: string;
  status: "queued" | "processing" | "complete" | "failed";
  errorMessage?: string;
}

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
    color: "text-amber-50",
    bgColor: "bg-amber-100/10 border-amber-100/15",
  },
  processing: {
    label: "Processing",
    color: "text-stone-100",
    bgColor: "bg-white/7 border-white/10",
  },
  complete: {
    label: "Complete",
    color: "text-emerald-100",
    bgColor: "bg-emerald-200/10 border-emerald-100/15",
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
              className="h-5 w-5 animate-spin text-amber-50"
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
            <p className="text-xs text-stone-200/65">
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
        <p className="mt-2 text-sm text-stone-100/85">
          Extracting chords from video... This may take up to 60 seconds.
        </p>
      )}
    </div>
  );
}
