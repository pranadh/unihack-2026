"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import UrlInput from "@/components/UrlInput";
import { recognizeChords } from "@/lib/api";

const HOME_STEPS = [
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
];

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
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center bg-[#0d0b12] px-4 py-10">
      <div className="flex w-full max-w-3xl flex-col items-center gap-8">
        {/* Hero */}
        <div className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] px-6 py-10 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:px-10">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-10 top-8 h-28 w-28 rounded-full border border-white/8 bg-white/4" />
            <div className="absolute bottom-8 left-8 flex gap-2 opacity-60">
              <span className="h-px w-14 bg-white/12" />
              <span className="h-px w-14 bg-white/12" />
              <span className="h-px w-14 bg-white/12" />
              <span className="h-px w-14 bg-white/12" />
            </div>
          </div>

          <div className="relative text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Like karaoke... but for your instrument!
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-200/78">
              Paste a YouTube link. Get synced chords. Practice along.
            </p>
          </div>
        </div>

        {/* URL Input */}
        <UrlInput
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />

        {/* Processing status */}
        {statusMessage && (
          <div className="w-full max-w-2xl rounded-2xl border border-amber-200/20 bg-amber-100/10 p-4 shadow-[0_12px_40px_rgba(217,121,95,0.12)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-transparent" />
              <p className="text-sm text-stone-100">{statusMessage}</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="w-full max-w-2xl rounded-2xl border border-rose-300/25 bg-rose-300/10 p-4 backdrop-blur">
            <p className="text-sm text-red-100">{error}</p>
          </div>
        )}

        {/* How it works */}
        <div className="mt-6 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          {HOME_STEPS.map((item) => (
            <div
              key={item.step}
              className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,248,240,0.08),rgba(255,248,240,0.03))] p-5 text-center shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur"
            >
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-200/35 to-rose-300/30 text-sm font-bold text-stone-50">
                {item.step}
              </div>
              <h3 className="text-sm font-semibold text-white">{item.title}</h3>
              <p className="mt-1 text-xs text-stone-200/65">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
