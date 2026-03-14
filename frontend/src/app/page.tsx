"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import UrlInput from "@/components/UrlInput";
import { recognizeChords } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (url: string) => {
      setIsLoading(true);
      setError("");
      setStatusMessage("Downloading audio and extracting chords... This may take up to 2 minutes.");

      try {
        const result = await recognizeChords(url);

        if (!result.chords || result.chords.length === 0) {
          setError("No chords detected in this video. Try a different song.");
          setIsLoading(false);
          setStatusMessage("");
          return;
        }

        // Store result in sessionStorage so the play page can read it
        const videoIdMatch = url.match(
          /(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/
        );
        const videoId = videoIdMatch?.[1] ?? "";

        const playData = {
          videoId,
          youtubeUrl: url,
          chords: result.chords,
          duration: result.duration,
          bpm: result.bpm,
        };
        sessionStorage.setItem("karachordy-play", JSON.stringify(playData));

        // Navigate to playback
        router.push(`/play?v=${videoId}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to process request"
        );
        setIsLoading(false);
        setStatusMessage("");
      }
    },
    [router]
  );

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-4">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Like karaoke... but for your instrument!
          </h1>
          <p className="mt-3 text-lg text-blue-100/80">
            Paste a YouTube link. Get synced chords. Practice along.
          </p>
        </div>

        {/* URL Input */}
        <UrlInput onSubmit={handleSubmit} isLoading={isLoading} />

        {/* Processing status */}
        {statusMessage && (
          <div className="w-full max-w-2xl rounded-lg border border-blue-300/35 bg-blue-300/10 p-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-transparent" />
              <p className="text-sm text-blue-100">{statusMessage}</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="w-full max-w-2xl rounded-lg border border-red-300/35 bg-red-300/10 p-4">
            <p className="text-sm text-red-100">{error}</p>
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
              className="rounded-lg border border-blue-300/20 bg-blue-950/35 p-4 text-center"
            >
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#3242CA]/25 text-sm font-bold text-blue-100">
                {item.step}
              </div>
              <h3 className="text-sm font-semibold text-white">{item.title}</h3>
              <p className="mt-1 text-xs text-blue-100/60">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
