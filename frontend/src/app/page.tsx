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
    async (input: string) => {
      setIsLoading(true);
      setError("");

      // Determine if this is a search query or a URL
      const isUrl =
        input.startsWith("http://") ||
        input.startsWith("https://") ||
        input.includes("youtube.com") ||
        input.includes("youtu.be");

      setStatusMessage(
        isUrl
          ? "Downloading audio and extracting chords... This may take up to 2 minutes."
          : `Searching YouTube for "${input}" and extracting chords... This may take up to 2 minutes.`
      );

      try {
        const result = await recognizeChords(input);

        if (!result.chords || result.chords.length === 0) {
          setError("No chords detected in this video. Try a different song.");
          setIsLoading(false);
          setStatusMessage("");
          return;
        }

        // Get the video ID: prefer API response (covers search queries),
        // fall back to extracting from the URL input
        let videoId = result.videoId ?? "";
        if (!videoId && isUrl) {
          const videoIdMatch = input.match(
            /(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/
          );
          videoId = videoIdMatch?.[1] ?? "";
        }

        if (!videoId) {
          setError("Could not determine the video ID. Please try again.");
          setIsLoading(false);
          setStatusMessage("");
          return;
        }

        const playData = {
          videoId,
          youtubeUrl: isUrl ? input : `https://www.youtube.com/watch?v=${videoId}`,
          chords: result.chords,
          duration: result.duration,
          bpm: result.bpm,
          variable_tempo: result.variable_tempo,
          title: result.title,
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
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center bg-zinc-950 px-4">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Karachordy
          </h1>
          <p className="mt-3 text-lg text-zinc-400">
            Paste a YouTube link or search for a song. Get synced chords. Practice along.
          </p>
        </div>

        {/* URL Input */}
        <UrlInput onSubmit={handleSubmit} isLoading={isLoading} />

        {/* Processing status */}
        {statusMessage && (
          <div className="w-full max-w-2xl rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
              <p className="text-sm text-blue-300">{statusMessage}</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="w-full max-w-2xl rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* How it works */}
        <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Paste or Search",
              desc: "Enter a YouTube URL or search for any song",
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
