"use client";

import { useState, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { recognizeChords } from "@/lib/api";

const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})(?:[&?#].*)?$/;

const HOW_STEPS = [
  {
    icon: "*",
    title: "Paste any YouTube URL",
    desc: "Paste the YouTube link of a song that you want to learn.",
  },
  {
    icon: "*",
    title: "Wait while Karachordy analyzes",
    desc: "Karachordy analyzes the track and aligns each chord to exact timestamps.",
  },
  {
    icon: "*",
    title: "Play and follow highlighted chords",
    desc: "Follow the highlighted chord as the video plays, pauses, or seeks.",
  },
];

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (youtubeUrl: string) => {
      setIsLoading(true);
      setError("");
      setStatusMessage("Processing link and building chord timeline...");

      try {
        const result = await recognizeChords(youtubeUrl);

        if (!result.chords || result.chords.length === 0) {
          setError("No chords detected in this video. Try a different song.");
          setIsLoading(false);
          setStatusMessage("");
          return;
        }

        // Store result in sessionStorage so the play page can read it
        const videoIdMatch = youtubeUrl.match(
          /(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/
        );
        const videoId = videoIdMatch?.[1] ?? "";

        const playData = {
          videoId,
          youtubeUrl,
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

  const onFormSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const value = url.trim();
    if (!value) {
      setError("Please paste a YouTube URL.");
      return;
    }

    if (!YOUTUBE_REGEX.test(value)) {
      setError("Please enter a valid YouTube URL.");
      return;
    }

    await handleSubmit(value);
  };

  return (
    <div className="bg-[#0d0b12] pb-14 text-[#f4f7ff]">
      <div className="mx-auto w-full max-w-[1440px] px-6 lg:px-[120px]">
        <section className="flex h-[355px] items-center justify-center pt-3 text-center">
          <div className="flex h-[294px] w-[900px] flex-col items-center justify-center gap-3">
            <h1 className="w-[760px] text-[54px] font-bold leading-[1.05] tracking-[-0.6px]">
              Like karaoke... but for your instrument.
            </h1>
            <p className="w-full text-center text-[16px] leading-[1.35] font-medium text-[#aeb7d9]">
              Paste any YouTube link. Get real-time chord cues synced to the music. Follow along and play.
            </p>

            <form className="mt-1 flex items-center gap-2" onSubmit={onFormSubmit}>
              <div className="flex h-11 w-[360px] items-center rounded-md border border-[#2a3348] bg-[#0f1627] px-3">
                <input
                  type="text"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="Search YouTube..."
                  className="h-full w-full bg-transparent text-[14px] font-medium text-[#94a3b8] outline-none"
                  disabled={isLoading}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="flex h-11 items-center justify-center rounded-md bg-[#3242ca] px-4 text-[14px] font-bold text-white disabled:opacity-60"
              >
                {isLoading ? "Analysing..." : "Analyse Chords"}
              </button>
            </form>

            {statusMessage ? (
              <p className="mt-1 max-w-lg text-sm text-[#aeb7d9]">{statusMessage}</p>
            ) : null}

            {error ? (
              <p className="mt-1 max-w-lg rounded-md border border-red-300/30 bg-red-300/10 px-3 py-2 text-sm text-red-100">
                {error}
              </p>
            ) : null}
          </div>
        </section>

        <section>
          <div className="py-[36px]">
            <h2 className="text-[34px] font-bold leading-tight">How it works</h2>
            <div className="mt-3 flex w-full items-center rounded-xl border border-[#2a3348] bg-[#111827] py-[22px]">
              {HOW_STEPS.map((item, index) => (
                <div
                  key={item.title}
                  className={`flex-1 px-4 ${index < HOW_STEPS.length - 1 ? "border-r border-[#2a3348]" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] text-[#9aa5ff]">{item.icon}</span>
                    <span className="w-[250px] text-[15px] font-bold leading-tight text-[#f3f4f6]">
                      {item.title}
                    </span>
                  </div>
                  <p className="mt-2 w-[250px] text-[12px] font-medium leading-[1.3] text-[#aeb7d9]">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pb-6">
          <div className="flex items-start gap-7 px-0 py-7">
            <div className="flex h-[360px] flex-1 flex-col justify-center gap-2 py-2">
              <h2 className="text-[34px] font-bold leading-tight">Chord timeline</h2>
              <p className="text-[14px] font-medium leading-[1.4] text-[#aeb7d9]">
                Play the right chords at the right time alongside your favourite tracks. Follow along
                with this karaoke style timeline which denotes chords and the duration of each.
                Switch between tabs or piano chord diagrams for easy learning.
              </p>
            </div>

            <div className="flex-1">
              <div className="aspect-video w-full rounded-[10px] border border-[#2a3348] bg-[#101726]">
                <div className="flex h-full items-center justify-center px-6 text-center text-sm font-medium text-[#aeb7d9]">
                  Video wireframe object (1920x1080) - replace this container with a video/embed component.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
