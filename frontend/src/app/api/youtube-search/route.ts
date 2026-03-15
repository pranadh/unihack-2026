import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function GET(request: NextRequest) {
  const guestSessionId = request.headers.get("x-guest-session-id")?.trim();
  if (!guestSessionId) {
    return NextResponse.json(
      { error: "Missing guest session header." },
      { status: 400 }
    );
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = request.nextUrl.searchParams.get("limit")?.trim() ?? "5";

  if (q.length < 2 || q.length > 100) {
    return NextResponse.json(
      { error: "Query must be between 2 and 100 characters." },
      { status: 400 }
    );
  }

  const backendUrl = new URL(`${API_BASE_URL}/api/youtube/search`);
  backendUrl.searchParams.set("q", q);
  backendUrl.searchParams.set("limit", limit);

  try {
    const backendRes = await fetch(backendUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: guestSessionId ? { "x-guest-session-id": guestSessionId } : undefined,
    });

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: await parseError(backendRes) },
        { status: backendRes.status }
      );
    }

    const data = (await backendRes.json()) as unknown;
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
