import { NextRequest, NextResponse } from "next/server";

const VIDEO_ID_RE = /^[\w-]{11}$/;

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("v")?.trim();

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return NextResponse.json({ error: "Invalid video ID." }, { status: 400 });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`,
      {
        cache: "force-cache",
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Video title not found." }, { status: 404 });
    }

    const data = (await response.json()) as { title?: unknown };

    if (typeof data.title !== "string" || data.title.trim().length === 0) {
      return NextResponse.json({ error: "Video title unavailable." }, { status: 404 });
    }

    return NextResponse.json({ title: data.title.trim() });
  } catch {
    return NextResponse.json({ error: "Failed to fetch video title." }, { status: 500 });
  }
}
