"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchTimelineByRequestId,
  fetchVideoMeta,
} from "@/lib/api";
import {
  getAccessHistory,
  recordAccess,
  updateAccessTitle,
  type AccessedHistoryItem,
} from "@/lib/history";

const PAGE_SIZE = 20;

function getRelativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) {
    return "Unknown time";
  }

  const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (deltaSec < 60) return "just now";
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`;
  return `${Math.floor(deltaSec / 86400)}d ago`;
}

function formatVideoLabel(videoId: string): string {
  return `youtube.com/watch?v=${videoId}`;
}

function buildThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export default function HistoryPage() {
  const [items, setItems] = useState<AccessedHistoryItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");

  const loadHistory = useCallback((nextOffset: number) => {
    const all = getAccessHistory();
    const maxOffset = Math.max(0, all.length - PAGE_SIZE);
    const safeOffset = Math.max(0, Math.min(nextOffset, maxOffset));
    const page = all.slice(safeOffset, safeOffset + PAGE_SIZE);

    setLoading(true);
    setError("");

    setItems(page);
    setOffset(safeOffset);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadHistory(0);
  }, [loadHistory]);

  const canGoPrevious = offset > 0;
  const total = getAccessHistory().length;
  const canGoNext = offset + items.length < total;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + items.length, total);

  const loadingLabel = useMemo(() => {
    if (loading) {
      return "Loading your song history...";
    }
    if (total === 0) {
      return "No songs analysed yet for this browser session.";
    }
    return `Showing ${pageStart}-${pageEnd} of ${total}`;
  }, [loading, total, pageStart, pageEnd]);

  const handleOpen = useCallback(async (requestId: string, youtubeUrl: string) => {
    setBusyRequestId(requestId);
    setError("");

    try {
      const timeline = await fetchTimelineByRequestId(requestId);
      const videoIdMatch = youtubeUrl.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
      const videoId = videoIdMatch?.[1] ?? timeline.youtubeVideoId;
      const accessItem = items.find((item) => item.requestId === requestId);

      sessionStorage.setItem(
        "karachordy-play",
        JSON.stringify({
          videoId,
          youtubeUrl,
          chords: timeline.chords,
          duration: timeline.durationSeconds,
        })
      );

      recordAccess({
        requestId,
        youtubeUrl,
        videoId,
        title: accessItem?.title,
      });

      window.location.href = `/play?v=${encodeURIComponent(videoId)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open song");
    } finally {
      setBusyRequestId("");
    }
  }, [items]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    let cancelled = false;

    const fillMissingTitles = async () => {
      for (const item of items) {
        if (cancelled || item.title) {
          continue;
        }

        try {
          const meta = await fetchVideoMeta(item.videoId);
          if (cancelled || !meta.title) {
            continue;
          }

          updateAccessTitle(item.requestId, meta.title);
          loadHistory(offset);
        } catch {
          // Best-effort metadata enrichment.
        }
      }
    };

    void fillMissingTitles();

    return () => {
      cancelled = true;
    };
  }, [items, loadHistory, offset]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#0d0b12] px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-[1.5rem] border border-white/8 bg-[#15111b] p-8">
        <h1 className="text-2xl font-bold text-white">History</h1>
        <p className="mt-2 text-stone-200/75">{loadingLabel}</p>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200/20 bg-red-300/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="mt-6 space-y-3">
            {items.map((item) => {
              const isBusy = busyRequestId === item.requestId;

              return (
                <div
                  key={item.requestId}
                  className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="overflow-hidden rounded-md border border-white/10">
                        <Image
                          src={buildThumbnailUrl(item.videoId)}
                          alt=""
                          width={120}
                          height={68}
                          className="h-[68px] w-[120px] object-cover"
                          unoptimized
                        />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {item.title?.trim() || formatVideoLabel(item.videoId)}
                        </p>
                        <p className="mt-1 truncate text-xs text-stone-200/70">
                          Accessed {getRelativeTime(item.lastAccessedAt)}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-stone-300/60">
                          {formatVideoLabel(item.videoId)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleOpen(item.requestId, item.youtubeUrl)}
                      disabled={isBusy}
                      className="rounded-lg bg-[#3242CA] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2b3ab2] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? "Opening..." : "Open"}
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => void loadHistory(Math.max(0, offset - PAGE_SIZE))}
                disabled={!canGoPrevious || loading}
                className="rounded-lg border border-white/12 px-3 py-1.5 text-xs text-stone-100 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => void loadHistory(offset + PAGE_SIZE)}
                disabled={!canGoNext || loading}
                className="rounded-lg border border-white/12 px-3 py-1.5 text-xs text-stone-100 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-[#3242CA] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2b3ab2]"
        >
          Analyse a song
        </Link>
      </div>
    </div>
  );
}
