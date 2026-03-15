"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import {
  fetchVideoMeta,
  searchYouTubeVideos,
  type YouTubeSearchResult,
} from "@/lib/api";

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

const MAX_ANALYSIS_DURATION_SECONDS = 10 * 60;

const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})(?:[&?#].*)?$/;

export default function UrlInput({
  onSubmit,
  isLoading,
}: UrlInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [isValidatingDuration, setIsValidatingDuration] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchedQuery, setSearchedQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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

  const canAnalyzeVideo = useCallback(async (youtubeUrl: string) => {
    const videoIdMatch = youtubeUrl.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    const videoId = videoIdMatch?.[1] ?? "";

    if (!videoId) {
      return true;
    }

    try {
      setIsValidatingDuration(true);
      const meta = await fetchVideoMeta(videoId);
      if (typeof meta.durationSeconds !== "number") {
        return true;
      }

      if (
        meta.durationSeconds > MAX_ANALYSIS_DURATION_SECONDS
      ) {
        setError("This video is longer than 10 minutes and cannot be analysed.");
        return false;
      }
    } catch {
      return true;
    } finally {
      setIsValidatingDuration(false);
    }

    return true;
  }, []);

  const handleSelectResult = useCallback(
    async (result: YouTubeSearchResult) => {
      setInputValue(result.title);
      const allowed = await canAnalyzeVideo(result.youtubeUrl);
      if (!allowed) {
        return;
      }
      submitYoutubeUrl(result.youtubeUrl);
    },
    [canAnalyzeVideo, submitYoutubeUrl]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const value = inputValue.trim();
    if (!value) {
      setError("Please enter a YouTube URL or a search query");
      return;
    }

    if (validateUrl(value)) {
      const allowed = await canAnalyzeVideo(value);
      if (!allowed) {
        return;
      }

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
        void handleSelectResult(selected);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="flex flex-col gap-3 rounded-[1.75rem] p-4 sm:p-5">
        <label htmlFor="youtube-url" className="text-sm font-medium text-stone-100/85">
          YouTube URL or Song Search
        </label>
        <div className="relative">
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
              className="h-11 w-full flex-1 rounded-xl border border-[var(--border-subtle)] bg-transparent px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[color:color-mix(in_oklab,var(--text-muted)_68%,transparent)] outline-none transition-colors focus-visible:border-[color:color-mix(in_oklab,var(--accent-tertiary)_58%,white_42%)] focus-visible:ring-1 focus-visible:ring-[color:color-mix(in_oklab,var(--accent-secondary)_45%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading || isValidatingDuration}
              aria-describedby={error || searchError ? "url-error" : undefined}
              aria-invalid={error || searchError ? "true" : "false"}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isLoading || isSearching || isValidatingDuration}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#3242ca] px-6 text-base font-semibold text-white transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#120f1b] disabled:pointer-events-none disabled:opacity-50"
            >
              {isLoading || isSearching || isValidatingDuration ? (
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
                  {isLoading
                    ? "Processing"
                    : isValidatingDuration
                      ? "Checking"
                      : "Searching"}
                </span>
              ) : (
                (YOUTUBE_REGEX.test(inputValue.trim())
                  ? "Analyse Chords"
                  : "Search YouTube")
              )}
            </button>
          </div>

          {!isSearching &&
            results.length > 0 &&
            searchedQuery === inputValue.trim() &&
            !YOUTUBE_REGEX.test(inputValue.trim()) && (
            <ul
              className="absolute top-full right-0 left-0 z-30 mt-2 max-h-80 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[color:color-mix(in_oklab,var(--surface-elevated)_90%,black_10%)] shadow-[0_24px_48px_rgba(0,0,0,0.35)]"
              role="listbox"
              aria-label="YouTube search suggestions"
            >
              {results.map((result, index) => (
                <li key={result.videoId}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                      index === activeIndex
                        ? "bg-[color:color-mix(in_oklab,var(--accent-secondary)_28%,transparent)]"
                        : "hover:bg-[color:color-mix(in_oklab,var(--text-muted)_14%,transparent)]"
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      void handleSelectResult(result);
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
                      <span className="block truncate text-sm font-medium text-[var(--foreground)]">
                        {result.title}
                      </span>
                      <span className="block truncate text-xs text-[var(--text-muted)]/85">
                        {result.channelTitle}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isSearching && searchedQuery.length >= 2 && !YOUTUBE_REGEX.test(inputValue.trim()) && (
          <p className="text-sm text-stone-200/85">Searching YouTube...</p>
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
