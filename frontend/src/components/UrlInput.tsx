"use client";

import {
  useState,
  useCallback,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import { searchYouTubeVideos, type YouTubeSearchResult } from "@/lib/api";

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})(?:[&?#].*)?$/;

export default function UrlInput({ onSubmit, isLoading }: UrlInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchedQuery, setSearchedQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const validateUrl = useCallback((value: string): boolean => {
    if (!value.trim()) {
      setError("Please enter a YouTube URL or a search query");
      return false;
    }
    if (!YOUTUBE_REGEX.test(value.trim())) {
      return false;
    }
    setError("");
    return true;
  }, []);

  const runSearch = useCallback(async (query: string) => {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      setIsSearching(true);
      setError("");
      setSearchError("");
      setResults([]);
      setActiveIndex(-1);
      setSearchedQuery(query);

      const items = await searchYouTubeVideos(query, controller.signal);
      if (controller.signal.aborted) {
        return;
      }

      setResults(items);
      setActiveIndex(items.length > 0 ? 0 : -1);

      if (items.length === 0) {
        setSearchError("No YouTube results found. Try a different query.");
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setResults([]);
        setActiveIndex(-1);
        setSearchError(err instanceof Error ? err.message : "Search failed");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, []);

  const submitYoutubeUrl = useCallback(
    (url: string) => {
      setError("");
      setSearchError("");
      setResults([]);
      setActiveIndex(-1);
      onSubmit(url);
    },
    [onSubmit]
  );

  const handleSelectResult = useCallback(
    (result: YouTubeSearchResult) => {
      setInputValue(result.title);
      submitYoutubeUrl(result.youtubeUrl);
    },
    [submitYoutubeUrl]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const value = inputValue.trim();
    if (!value) {
      setError("Please enter a YouTube URL or a search query");
      return;
    }

    if (validateUrl(value)) {
      submitYoutubeUrl(value);
      return;
    }

    if (value.length < 2) {
      setError("Search query must be at least 2 characters.");
      return;
    }

    if (isSearching) {
      setError("Searching videos... Please wait a moment.");
      return;
    }

    await runSearch(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
      return;
    }

    if (event.key === "Enter" && !YOUTUBE_REGEX.test(inputValue.trim())) {
      const value = inputValue.trim();

      if (value !== searchedQuery) {
        return;
      }

      event.preventDefault();
      const selected =
        activeIndex >= 0 && activeIndex < results.length
          ? results[activeIndex]
          : results[0];
      if (selected) {
        handleSelectResult(selected);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="flex flex-col gap-3 rounded-[1.75rem] border border-white/10 bg-[linear-gradient(150deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur sm:p-5">
        <label htmlFor="youtube-url" className="text-sm font-medium text-stone-100/85">
          YouTube URL or Song Search
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="youtube-url"
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (error) setError("");
              if (searchError) setSearchError("");
              if (results.length > 0) {
                setResults([]);
                setActiveIndex(-1);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Paste URL or type song title..."
            className="flex-1 rounded-xl border border-amber-100/15 bg-[#241a24]/70 px-4 py-3 text-base text-white placeholder-stone-300/40 outline-none transition-colors focus:border-amber-300/50 focus:ring-1 focus:ring-amber-300/45"
            disabled={isLoading}
            aria-describedby={error || searchError ? "url-error" : undefined}
            aria-invalid={error || searchError ? "true" : "false"}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isLoading || isSearching}
            className="rounded-xl bg-gradient-to-r from-[#3242CA] via-[#7054b8] to-[#d7795f] px-6 py-3 text-base font-semibold text-white transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-amber-200/60 focus:ring-offset-2 focus:ring-offset-[#120f1b] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading || isSearching ? (
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
                {isLoading ? "Processing" : "Searching"}
              </span>
            ) : (
              (YOUTUBE_REGEX.test(inputValue.trim())
                ? "Analyse Chords"
                : "Search YouTube")
            )}
          </button>
        </div>

        {isSearching && searchedQuery.length >= 2 && !YOUTUBE_REGEX.test(inputValue.trim()) && (
          <p className="text-sm text-stone-200/85">Searching YouTube...</p>
        )}

        {!isSearching &&
          results.length > 0 &&
          searchedQuery === inputValue.trim() &&
          !YOUTUBE_REGEX.test(inputValue.trim()) && (
          <ul
            className="max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-[#17121f]/95"
            role="listbox"
            aria-label="YouTube search suggestions"
          >
            {results.map((result, index) => (
              <li key={result.videoId}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    index === activeIndex
                      ? "bg-amber-200/20"
                      : "hover:bg-white/5"
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelectResult(result);
                  }}
                >
                  {result.thumbnailUrl ? (
                    <Image
                      src={result.thumbnailUrl}
                      alt=""
                      width={80}
                      height={48}
                      className="h-12 w-20 rounded-md object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="h-12 w-20 rounded-md bg-white/10" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">
                      {result.title}
                    </span>
                    <span className="block truncate text-xs text-stone-300/80">
                      {result.channelTitle}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {(error || searchError) && (
          <p id="url-error" className="text-sm text-rose-100" role="alert">
            {error || searchError}
          </p>
        )}
      </div>
    </form>
  );
}
