"use client";

import { useState, useCallback, type FormEvent } from "react";

interface UrlInputProps {
  onSubmit: (input: string) => void;
  isLoading: boolean;
}

const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})(?:[&?#].*)?$/;

/**
 * Returns true if the input looks like it could be a URL (starts with http(s)
 * or contains youtube.com / youtu.be).  Used to decide whether to apply strict
 * YouTube URL validation or treat the input as a free-text search query.
 */
function looksLikeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    v.startsWith("http://") ||
    v.startsWith("https://") ||
    v.includes("youtube.com") ||
    v.includes("youtu.be")
  );
}

export default function UrlInput({ onSubmit, isLoading }: UrlInputProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const validate = useCallback((value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Please enter a YouTube URL or search for a song");
      return false;
    }
    // If it looks like a URL, enforce YouTube URL format
    if (looksLikeUrl(trimmed) && !YOUTUBE_REGEX.test(trimmed)) {
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
    if (validate(input)) {
      onSubmit(input.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="flex flex-col gap-3">
        <label htmlFor="youtube-url" className="text-sm font-medium text-zinc-300">
          YouTube URL or Song Search
        </label>
        <div className="flex gap-2">
          <input
            id="youtube-url"
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) validate(e.target.value);
            }}
            placeholder="Paste a YouTube URL or search for a song..."
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-base text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            disabled={isLoading}
            aria-describedby={error ? "url-error" : undefined}
            aria-invalid={error ? "true" : "false"}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-violet-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
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
              "Analyze Chords"
            )}
          </button>
        </div>
        {error && (
          <p id="url-error" className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
