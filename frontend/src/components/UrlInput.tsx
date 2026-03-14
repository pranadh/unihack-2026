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
      <div className="flex flex-col gap-3">
        <label htmlFor="youtube-url" className="text-sm font-medium text-blue-100/85">
          YouTube URL
        </label>
        <div className="flex gap-2">
          <input
            id="youtube-url"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) validate(e.target.value);
            }}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1 rounded-lg border border-blue-300/25 bg-blue-950/45 px-4 py-3 text-base text-white placeholder-blue-100/45 outline-none transition-colors focus:border-[#4f5de0] focus:ring-1 focus:ring-[#4f5de0]"
            disabled={isLoading}
            aria-describedby={error ? "url-error" : undefined}
            aria-invalid={error ? "true" : "false"}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-[#3242CA] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#2b3ab2] focus:outline-none focus:ring-2 focus:ring-[#4f5de0] focus:ring-offset-2 focus:ring-offset-[#0a132b] disabled:cursor-not-allowed disabled:opacity-50"
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
          <p id="url-error" className="text-sm text-red-100" role="alert">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
