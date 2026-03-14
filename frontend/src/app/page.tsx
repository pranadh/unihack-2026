"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import UrlInput from "@/components/UrlInput";
import StatusPanel from "@/components/StatusPanel";
import {
  submitRequest,
  getRequestStatus,
  retryRequest,
  type SongRequest,
} from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [request, setRequest] = useState<SongRequest | null>(null);
  const [error, setError] = useState("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const startPolling = useCallback(
    (requestId: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        try {
          const status = await getRequestStatus(requestId);
          setRequest(status);

          if (status.status === "complete") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            // Navigate to playback page
            router.push(`/play?id=${requestId}`);
          } else if (status.status === "failed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setIsLoading(false);
          }
        } catch {
          // Continue polling on transient errors
        }
      }, 2000);
    },
    [router]
  );

  const handleSubmit = useCallback(
    async (url: string) => {
      setIsLoading(true);
      setError("");
      setRequest(null);

      try {
        const result = await submitRequest(url);
        setRequest(result);

        if (result.status === "complete") {
          // Already processed, go straight to playback
          router.push(`/play?id=${result.id}`);
          return;
        }

        // Start polling for status
        startPolling(result.id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to submit request"
        );
        setIsLoading(false);
      }
    },
    [router, startPolling]
  );

  const handleRetry = useCallback(async () => {
    if (!request) return;

    setIsLoading(true);
    setError("");

    try {
      const result = await retryRequest(request.id);
      setRequest({
        ...request,
        status: result.status as SongRequest["status"],
        errorMessage: null,
      });
      startPolling(request.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
      setIsLoading(false);
    }
  }, [request, startPolling]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Karachordy
          </h1>
          <p className="mt-3 text-lg text-zinc-400">
            Paste a YouTube link. Get synced chords. Practice along.
          </p>
        </div>

        {/* URL Input */}
        <UrlInput onSubmit={handleSubmit} isLoading={isLoading} />

        {/* Status */}
        {request && (
          <StatusPanel request={request} onRetry={handleRetry} />
        )}

        {/* Error */}
        {error && !request && (
          <div className="w-full max-w-2xl rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* How it works */}
        <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Paste Link",
              desc: "Enter any YouTube URL with music",
            },
            {
              step: "2",
              title: "AI Analysis",
              desc: "ChordMini extracts timed chords",
            },
            {
              step: "3",
              title: "Practice",
              desc: "Play video with synced chord cues",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-center"
            >
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-violet-600/20 text-sm font-bold text-violet-400">
                {item.step}
              </div>
              <h3 className="text-sm font-semibold text-white">{item.title}</h3>
              <p className="mt-1 text-xs text-zinc-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
