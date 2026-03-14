"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getHistory, type SongRequest } from "@/lib/api";

const STATUS_STYLES: Record<
  SongRequest["status"],
  { label: string; className: string }
> = {
  queued: { label: "Queued", className: "bg-yellow-400/10 text-yellow-400" },
  processing: {
    label: "Processing",
    className: "bg-blue-400/10 text-blue-400",
  },
  complete: {
    label: "Complete",
    className: "bg-green-400/10 text-green-400",
  },
  failed: { label: "Failed", className: "bg-red-400/10 text-red-400" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      try {
        const data = await getHistory(pageSize, page * pageSize);
        setRequests(data.items);
        setTotal(data.total);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load history"
        );
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [page]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-zinc-950 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-white">History</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Previously processed songs
        </p>

        {loading && (
          <div className="mt-8 flex justify-center">
            <svg
              className="h-6 w-6 animate-spin text-violet-400"
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
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="mt-12 text-center">
            <p className="text-zinc-500">No songs processed yet.</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
            >
              Analyze your first song
            </Link>
          </div>
        )}

        {!loading && requests.length > 0 && (
          <>
            <div className="mt-6 space-y-2">
              {requests.map((req) => {
                const statusStyle = STATUS_STYLES[req.status];
                const canPlay = req.status === "complete";

                return (
                  <div
                    key={req.id}
                    className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {req.youtubeVideoId}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {req.youtubeUrl}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {formatDate(req.createdAt)}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle.className}`}
                    >
                      {statusStyle.label}
                    </span>

                    {canPlay && (
                      <Link
                        href={`/play?id=${req.id}`}
                        className="shrink-0 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
                      >
                        Play
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="min-h-[44px] rounded-md bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-zinc-500">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="min-h-[44px] rounded-md bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
