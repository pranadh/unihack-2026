import { NextRequest, NextResponse } from "next/server";

const VIDEO_ID_RE = /^[\w-]{11}$/;

function parseDurationSeconds(html: string): number | null {
  const lengthSecondsMatch = html.match(/"lengthSeconds":"(\d+)"/);
  if (lengthSecondsMatch) {
    const value = Number(lengthSecondsMatch[1]);
    return Number.isFinite(value) ? value : null;
  }

  const approxDurationMsMatch = html.match(/"approxDurationMs":"(\d+)"/);
  if (approxDurationMsMatch) {
    const ms = Number(approxDurationMsMatch[1]);
    if (Number.isFinite(ms)) {
      return Math.round(ms / 1000);
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("v")?.trim();

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return NextResponse.json({ error: "Invalid video ID." }, { status: 400 });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const [oembedResponse, watchResponse] = await Promise.all([
      fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`,
        {
          cache: "force-cache",
          signal: AbortSignal.timeout(10_000),
        }
      ),
      fetch(youtubeUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }),
    ]);

    if (!oembedResponse.ok) {
      return NextResponse.json({ error: "Video title not found." }, { status: 404 });
    }

    const data = (await oembedResponse.json()) as { title?: unknown };

    if (typeof data.title !== "string" || data.title.trim().length === 0) {
      return NextResponse.json({ error: "Video title unavailable." }, { status: 404 });
    }

    let durationSeconds: number | null = null;
    if (watchResponse.ok) {
      const watchHtml = await watchResponse.text();
      durationSeconds = parseDurationSeconds(watchHtml);
    }

    return NextResponse.json({ title: data.title.trim(), durationSeconds });
  } catch {
    return NextResponse.json({ error: "Failed to fetch video title." }, { status: 500 });
  }
}
