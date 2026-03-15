/**
 * API client for Karachordy.
 *
 * Uses Next.js API routes that run server-side and proxy to the
 * backend API running on the VPS.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface ChordEvent {
  start: number;
  end: number;
  chord: string;
}

export interface RecognizeResult {
  requestId?: string;
  chords: ChordEvent[];
  duration?: number;
  bpm?: number;
}

export interface VideoMetaResult {
  title: string;
  thumbnailUrl?: string;
  durationSeconds?: number | null;
}

const GUEST_SESSION_STORAGE_KEY = "karachordy-guest-session-id";

function createUuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getGuestSessionId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = createUuidV4();
  window.localStorage.setItem(GUEST_SESSION_STORAGE_KEY, next);
  return next;
}

type ApiFetchInit = RequestInit & { withGuestSession?: boolean };

export async function apiFetch(input: RequestInfo | URL, init: ApiFetchInit = {}) {
  const { withGuestSession = true, headers, ...rest } = init;
  const requestHeaders = new Headers(headers);

  if (withGuestSession && typeof window !== "undefined") {
    requestHeaders.set("x-guest-session-id", getGuestSessionId());
  }

  return fetch(input, {
    ...rest,
    headers: requestHeaders,
  });
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  youtubeUrl: string;
}

export type SongRequestStatus = "queued" | "processing" | "complete" | "failed";

export interface SongRequestSummary {
  id: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  status: SongRequestStatus;
  createdAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
}

export interface HistoryResponse {
  items: SongRequestSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface TimelineResult {
  id: string;
  songRequestId: string;
  youtubeVideoId: string;
  durationSeconds?: number;
  chords: ChordEvent[];
}

// ── API Methods ─────────────────────────────────────────────────────────────

/**
 * Submit a YouTube URL for chord recognition.
 * Calls /api/recognize which downloads audio and sends to ChordMini.
 */
export async function recognizeChords(
  youtubeUrl: string
): Promise<RecognizeResult> {
  const res = await apiFetch("/api/recognize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: youtubeUrl }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? res.statusText,
      res.status
    );
  }

  return res.json() as Promise<RecognizeResult>;
}

/**
 * Health-check the ChordMini API via the proxy route.
 */
export async function checkHealth(): Promise<{ status: string }> {
  const res = await apiFetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: "/health", method: "GET" }),
  });

  if (!res.ok) {
    throw new ApiError("Health check failed", res.status);
  }

  return res.json() as Promise<{ status: string }>;
}

export async function fetchVideoTitle(videoId: string): Promise<string> {
  const res = await apiFetch(`/api/video-meta?v=${encodeURIComponent(videoId)}`, {
    method: "GET",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? "Failed to fetch video title",
      res.status
    );
  }

  const data = (await res.json()) as VideoMetaResult;
  return data.title;
}

export async function fetchVideoMeta(videoId: string): Promise<VideoMetaResult> {
  const res = await apiFetch(`/api/video-meta?v=${encodeURIComponent(videoId)}`, {
    method: "GET",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? "Failed to fetch video metadata",
      res.status
    );
  }

  return (await res.json()) as VideoMetaResult;
}

export async function searchYouTubeVideos(
  query: string,
  signal?: AbortSignal
): Promise<YouTubeSearchResult[]> {
  const res = await apiFetch(
    `/api/youtube-search?q=${encodeURIComponent(query)}&limit=5`,
    {
      method: "GET",
      cache: "no-store",
      signal,
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? "YouTube search failed",
      res.status
    );
  }

  const data = (await res.json()) as { results?: YouTubeSearchResult[] };
  return data.results ?? [];
}

export async function fetchHistory(
  offset = 0,
  limit = 20
): Promise<HistoryResponse> {
  const params = new URLSearchParams({
    offset: String(Math.max(0, offset)),
    limit: String(Math.min(Math.max(limit, 1), 100)),
  });

  const res = await apiFetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: `/api/history?${params.toString()}`,
      method: "GET",
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? "Failed to load history",
      res.status
    );
  }

  return (await res.json()) as HistoryResponse;
}

export async function fetchTimelineByRequestId(
  requestId: string
): Promise<TimelineResult> {
  const res = await apiFetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: `/api/requests/${encodeURIComponent(requestId)}/timeline`,
      method: "GET",
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? "Failed to load timeline",
      res.status
    );
  }

  return (await res.json()) as TimelineResult;
}

export async function retrySongRequest(requestId: string): Promise<void> {
  const res = await apiFetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: `/api/requests/${encodeURIComponent(requestId)}/retry`,
      method: "POST",
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? "Failed to retry request",
      res.status
    );
  }
}
