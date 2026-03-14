import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

const YOUTUBE_URL_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]{11}/;

interface ChordEvent {
  start: number;
  end: number;
  chord: string;
}

type RequestStatus = "queued" | "processing" | "complete" | "failed";

interface CreateRequestResponse {
  id: string;
  status: RequestStatus;
}

interface StatusResponse {
  id: string;
  status: RequestStatus;
  errorMessage?: string | null;
}

interface TimelineResponse {
  chords: ChordEvent[];
  durationSeconds?: number;
}

async function parseError(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string; message?: string };
    return json.error ?? json.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCompletion(requestId: string): Promise<void> {
  const maxAttempts = 120;
  const pollIntervalMs = 2_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusRes = await fetch(`${API_BASE_URL}/api/requests/${requestId}`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!statusRes.ok) {
      throw new Error(`Status check failed: ${await parseError(statusRes)}`);
    }

    const statusData = (await statusRes.json()) as StatusResponse;

    if (statusData.status === "complete") {
      return;
    }

    if (statusData.status === "failed") {
      throw new Error(statusData.errorMessage ?? "Processing failed");
    }

    await wait(pollIntervalMs);
  }

  throw new Error("Timed out waiting for chord processing to complete");
}

export async function POST(request: NextRequest) {
  let body: { url?: string };

  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const url = body.url?.trim();
  if (!url || !YOUTUBE_URL_RE.test(url)) {
    return NextResponse.json(
      { error: "Please provide a valid YouTube URL." },
      { status: 400 }
    );
  }

  try {
    const createRes = await fetch(`${API_BASE_URL}/api/requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!createRes.ok) {
      return NextResponse.json(
        { error: await parseError(createRes) },
        { status: createRes.status }
      );
    }

    const createData = (await createRes.json()) as CreateRequestResponse;

    await waitForCompletion(createData.id);

    const timelineRes = await fetch(
      `${API_BASE_URL}/api/requests/${createData.id}/timeline`,
      {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      }
    );

    if (!timelineRes.ok) {
      return NextResponse.json(
        { error: await parseError(timelineRes) },
        { status: timelineRes.status }
      );
    }

    const timeline = (await timelineRes.json()) as TimelineResponse;

    return NextResponse.json({
      requestId: createData.id,
      chords: timeline.chords,
      duration: timeline.durationSeconds,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
