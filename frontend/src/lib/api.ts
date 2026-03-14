/**
 * API client for the Karachordy backend.
 *
 * All requests use relative paths (e.g. "/api/requests") so they go
 * through the Next.js rewrite proxy defined in next.config.ts.
 * This avoids CORS issues entirely — the browser only ever talks
 * to the same origin.
 */

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = path;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? res.statusText,
      res.status
    );
  }

  return res.json() as Promise<T>;
}

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

export interface SongRequest {
  id: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  status: "queued" | "processing" | "complete" | "failed";
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface ChordEvent {
  start: number;
  end: number;
  chord: string;
}

export interface ChordTimeline {
  id: string;
  songRequestId: string;
  youtubeVideoId: string;
  durationSeconds: number;
  version: number;
  generatedAt: string;
  chords: ChordEvent[];
}

export interface HistoryResponse {
  items: SongRequest[];
  total: number;
  limit: number;
  offset: number;
}

// ── API Methods ─────────────────────────────────────────────────────────────

/** Submit a YouTube URL for chord processing. */
export async function submitRequest(url: string): Promise<SongRequest> {
  return apiFetch<SongRequest>("/api/requests", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

/** Get the status of a processing request. */
export async function getRequestStatus(id: string): Promise<SongRequest> {
  return apiFetch<SongRequest>(`/api/requests/${id}`);
}

/** Get the chord timeline for a completed request. */
export async function getTimeline(
  requestId: string
): Promise<ChordTimeline> {
  return apiFetch<ChordTimeline>(`/api/requests/${requestId}/timeline`);
}

/** Retry a failed request. */
export async function retryRequest(
  requestId: string
): Promise<{ id: string; status: string; message: string }> {
  return apiFetch(`/api/requests/${requestId}/retry`, {
    method: "POST",
  });
}

/** Get recent request history. */
export async function getHistory(
  limit = 20,
  offset = 0
): Promise<HistoryResponse> {
  return apiFetch<HistoryResponse>(
    `/api/history?limit=${limit}&offset=${offset}`
  );
}
