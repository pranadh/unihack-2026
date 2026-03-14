"use client";

import { useState, useCallback, type FormEvent } from "react";

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})(?:[&?#].*)?$/;

export default function UrlInput({ onSubmit, isLoading }: UrlInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const validate = useCallback((value: string): boolean => {
    if (!value.trim()) {
      setError("Please enter a YouTube URL");
      return false;
    }
    if (!YOUTUBE_REGEX.test(value.trim())) {
      setError(
        "Please enter a valid YouTube URL (e.g. youtube.com/watch?v=... or youtu.be/...)"
      );
      return false;
    }
    setError("");
    return true;
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validate(url)) {
      onSubmit(url.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="flex flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-[linear-gradient(150deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur sm:p-5">
        <label htmlFor="youtube-url" className="text-sm font-medium text-stone-100/85">
          YouTube URL
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="youtube-url"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) validate(e.target.value);
            }}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1 rounded-xl border border-amber-100/15 bg-[#241a24]/70 px-4 py-3 text-base text-white placeholder-stone-300/40 outline-none transition-colors focus:border-amber-300/50 focus:ring-1 focus:ring-amber-300/45"
            disabled={isLoading}
            aria-describedby={error ? "url-error" : undefined}
            aria-invalid={error ? "true" : "false"}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-xl bg-gradient-to-r from-[#3242CA] via-[#7054b8] to-[#d7795f] px-6 py-3 text-base font-semibold text-white transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-amber-200/60 focus:ring-offset-2 focus:ring-offset-[#120f1b] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
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
                Processing
              </span>
            ) : (
              "Analyse Chords"
            )}
          </button>
        </div>
        {error && (
          <p id="url-error" className="text-sm text-rose-100" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
