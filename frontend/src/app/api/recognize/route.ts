import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { readdirSync } from "node:fs";

const execFileAsync = promisify(execFile);

const CHORDMINI_URL =
  process.env.CHORDMINI_API_URL ?? "http://134.199.153.5:5001";

const YOUTUBE_URL_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]{11}/;

/**
 * Extra directories to prepend to PATH so child processes can find
 * deno (JS runtime for yt-dlp) and ffmpeg/ffprobe even when the
 * server was started before they were installed via winget.
 */
const EXTRA_PATH_DIRS = [
  // deno (winget default)
  join(
    process.env.LOCALAPPDATA ?? "",
    "Microsoft",
    "WinGet",
    "Packages",
    "DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe"
  ),
  // ffmpeg (winget default – Gyan build)
  join(
    process.env.LOCALAPPDATA ?? "",
    "Microsoft",
    "WinGet",
    "Packages",
    "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
    "ffmpeg-8.0.1-full_build",
    "bin"
  ),
].filter(Boolean);

function buildEnv(): NodeJS.ProcessEnv {
  const sep = process.platform === "win32" ? ";" : ":";
  return {
    ...process.env,
    PATH: [...EXTRA_PATH_DIRS, process.env.PATH ?? ""].join(sep),
  };
}

/**
 * POST /api/recognize
 *
 * Accepts: { url: string }
 * Returns: { chords: Array<{ start, end, chord }>, duration?: number }
 *
 * Pipeline:
 *   1. Download YouTube audio via yt-dlp (python -m yt_dlp)
 *   2. Upload the audio file to ChordMini at /api/recognize-chords
 *   3. Return chord data to the browser
 */
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

  let tempDir: string | null = null;

  try {
    // ── Step 1: Download audio via yt-dlp ─────────────────────────────
    tempDir = await mkdtemp(join(tmpdir(), "karachordy-"));
    const outputTemplate = join(tempDir, "audio.%(ext)s");

    // Use python -m yt_dlp since yt-dlp isn't on PATH but the Python
    // package is installed.  We inject EXTRA_PATH_DIRS so deno and
    // ffmpeg/ffprobe are discoverable even if the server was launched
    // before they were installed.
    const ffmpegBinDir = EXTRA_PATH_DIRS.find((d) => d.includes("FFmpeg"));
    const ytDlpArgs = [
      "-m",
      "yt_dlp",
      "--extract-audio",
      "--no-playlist",
      "--no-overwrites",
      ...(ffmpegBinDir ? ["--ffmpeg-location", ffmpegBinDir] : []),
      "-o",
      outputTemplate,
      url,
    ];

    await execFileAsync("python", ytDlpArgs, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: buildEnv(),
    });

    // Find whatever audio file yt-dlp created (could be .opus, .m4a, .webm, .mp3, etc.)
    const files = readdirSync(tempDir);
    const audioFile = files.find((f) => f.startsWith("audio."));
    if (!audioFile) {
      return NextResponse.json(
        { error: "Failed to download audio from YouTube." },
        { status: 500 }
      );
    }

    const audioPath = join(tempDir, audioFile);
    const audioBuffer = await readFile(audioPath);

    // Determine mime type from extension
    const ext = audioFile.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      opus: "audio/opus",
      ogg: "audio/ogg",
      webm: "audio/webm",
    };
    const mimeType = mimeMap[ext] ?? "application/octet-stream";

    // ── Step 2: Upload to ChordMini ───────────────────────────────────
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([audioBuffer], { type: mimeType }),
      audioFile
    );
    formData.append("model", "chord-cnn-lstm");

    const chordRes = await fetch(
      `${CHORDMINI_URL}/api/recognize-chords`,
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(600_000), // 10 min for long songs
      }
    );

    if (!chordRes.ok) {
      const errText = await chordRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: `ChordMini API error (${chordRes.status}): ${errText || chordRes.statusText}`,
        },
        { status: 502 }
      );
    }

    const chordData = await chordRes.json();

    // ── Step 3: Return chord data ─────────────────────────────────────
    return NextResponse.json(chordData);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error occurred";
    console.error("recognize error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Always clean up temp files
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
