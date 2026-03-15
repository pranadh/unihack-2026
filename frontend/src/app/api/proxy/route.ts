import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

type ProxyRequest = {
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

const normalizeEndpoint = (endpoint: string) => {
  if (!endpoint.startsWith("/")) {
    return `/${endpoint}`;
  }

  return endpoint;
};

export async function POST(request: NextRequest) {
  const guestSessionId = request.headers.get("x-guest-session-id")?.trim();
  if (!guestSessionId) {
    return NextResponse.json(
      { error: "Missing guest session header." },
      { status: 400 }
    );
  }

  let payload: ProxyRequest;

  try {
    payload = (await request.json()) as ProxyRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!payload.endpoint || typeof payload.endpoint !== "string") {
    return NextResponse.json({ error: "endpoint is required." }, { status: 400 });
  }

  const endpoint = normalizeEndpoint(payload.endpoint);

  if (endpoint.includes("..")) {
    return NextResponse.json({ error: "Invalid endpoint path." }, { status: 400 });
  }

  if (!ALLOWED_METHODS.has(payload.method)) {
    return NextResponse.json({ error: "Unsupported HTTP method." }, { status: 400 });
  }

  const targetUrl = `${API_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(targetUrl, {
      method: payload.method,
      headers: {
        "Content-Type": "application/json",
        ...(guestSessionId ? { "x-guest-session-id": guestSessionId } : {}),
      },
      body: payload.method === "GET" ? undefined : JSON.stringify(payload.body ?? {}),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();
    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") ?? "text/plain";

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Upstream API request timed out." }, { status: 504 });
    }

    return NextResponse.json({ error: "Unable to reach upstream API." }, { status: 502 });
  }
}
