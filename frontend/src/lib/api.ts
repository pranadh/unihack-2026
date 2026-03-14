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
  chords: ChordEvent[];
  duration?: number;
  bpm?: number;
}

export interface VideoMetaResult {
  title: string;
}

// ── API Methods ─────────────────────────────────────────────────────────────

/**
 * Submit a YouTube URL for chord recognition.
 * Calls /api/recognize which downloads audio and sends to ChordMini.
 */
export async function recognizeChords(
  youtubeUrl: string
): Promise<RecognizeResult> {
  const res = await fetch("/api/recognize", {
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
  const res = await fetch("/api/proxy", {
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
  const res = await fetch(`/api/video-meta?v=${encodeURIComponent(videoId)}`, {
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
