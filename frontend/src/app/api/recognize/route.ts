import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { readdirSync } from "node:fs";

const execFileAsync = promisify(execFile);

const CHORDMINI_URL =
  process.env.CHORDMINI_API_URL ?? "http://134.199.153.5:5001";

const YOUTUBE_URL_RE =
  /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{11}/;

/**
 * Extract a YouTube video ID from a URL string.
 * Returns null if the string is not a recognizable YouTube URL.
 */
function extractVideoId(url: string): string | null {
  const match = url.match(
    /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/
  );
  return match?.[1] ?? null;
}

/**
 * Determine whether user input is a YouTube URL or a free-text search query.
 */
function isYouTubeUrl(input: string): boolean {
  return YOUTUBE_URL_RE.test(input);
}

/**
 * Fixed offset (seconds) subtracted from all chord timestamps to
 * compensate for YouTube player latency.
 *
 * YouTube videos have ~50-200ms of encoding padding at the start, and
 * the IFrame API reports playback time with some polling delay (~50ms
 * average at our 100ms polling interval).  Combined, chords from the
 * raw audio appear ~100-250ms LATE relative to the YouTube player.
 *
 * A positive value here shifts chords EARLIER.
 */
const YOUTUBE_OFFSET_S = 0.2;

/**
 * Resolve the path to the BPM detection script.
 * In development `process.cwd()` points to the frontend/ directory,
 * so `scripts/detect_bpm.py` lives there.  In production the working
 * directory may differ, so we resolve relative to this source file's
 * location as a fallback.
 */
const BPM_SCRIPT_PATH = resolve(
  process.cwd(),
  "scripts",
  "detect_bpm.py"
);

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
  // ffmpeg (winget default - Gyan build)
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

// ── BPM / beat-grid types ─────────────────────────────────────────────────

interface BpmResult {
  bpm: number;
  grid: number[];
  beat_count: number;
  grid_count: number;
  duration: number;
  variable_tempo?: boolean;
  error?: string;
}

interface ChordEvent {
  start: number;
  end: number;
  chord: string;
}

// ── Beat-snap helpers ─────────────────────────────────────────────────────

/**
 * Binary-search for the grid point closest to `time`.
 * `grid` must be sorted in ascending order.
 */
function snapToGrid(time: number, grid: number[]): number {
  if (grid.length === 0) return time;
  if (time <= grid[0]) return grid[0];
  if (time >= grid[grid.length - 1]) return grid[grid.length - 1];

  let lo = 0;
  let hi = grid.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (grid[mid] < time) lo = mid + 1;
    else hi = mid;
  }

  // `lo` is the first grid point >= time.  Compare with previous.
  if (lo > 0 && Math.abs(grid[lo - 1] - time) < Math.abs(grid[lo] - time)) {
    return grid[lo - 1];
  }
  return grid[lo];
}

/**
 * Find the local grid interval at a given time position.
 * Returns the distance between the two nearest grid points surrounding `time`.
 * Falls back to `fallback` if the grid is too sparse.
 */
function localGridInterval(time: number, grid: number[], fallback: number): number {
  if (grid.length < 2) return fallback;

  // Binary search for first grid point >= time
  let lo = 0;
  let hi = grid.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (grid[mid] < time) lo = mid + 1;
    else hi = mid;
  }

  if (lo > 0 && lo < grid.length) {
    return grid[lo] - grid[lo - 1];
  }
  if (lo === 0 && grid.length > 1) {
    return grid[1] - grid[0];
  }
  return fallback;
}

/**
 * Snap every chord's start/end to the nearest grid point.
 *
 * Post-processing guarantees:
 *   - Every chord has end > start (minimum gap = smallest grid interval)
 *   - No overlap between consecutive chords (later chord's start >= prev end)
 *   - Original chord labels are preserved
 */
function quantizeChords(chords: ChordEvent[], grid: number[]): ChordEvent[] {
  if (grid.length < 2 || chords.length === 0) return chords;

  const minGap = Math.min(
    ...grid.slice(1).map((g, i) => g - grid[i])
  );

  const quantized: ChordEvent[] = chords.map((c) => ({
    start: snapToGrid(c.start, grid),
    end: snapToGrid(c.end, grid),
    chord: c.chord,
  }));

  // Fix collapsed chords (end <= start after snapping)
  for (const c of quantized) {
    if (c.end <= c.start) {
      c.end = c.start + minGap;
    }
  }

  // Fix overlaps: ensure each chord starts at or after the previous chord's end
  for (let i = 1; i < quantized.length; i++) {
    if (quantized[i].start < quantized[i - 1].end) {
      quantized[i].start = quantized[i - 1].end;
    }
    // Re-check end > start after overlap fix
    if (quantized[i].end <= quantized[i].start) {
      quantized[i].end = quantized[i].start + minGap;
    }
  }

  return quantized;
}

/**
 * Apply a fixed time offset to all chord timestamps.
 * Shifts chords earlier by `offsetS` seconds to compensate for
 * YouTube player latency.  Clamps start to >= 0.
 */
function applyOffset(chords: ChordEvent[], offsetS: number): ChordEvent[] {
  if (offsetS === 0) return chords;

  return chords.map((c) => ({
    start: Math.max(0, c.start - offsetS),
    end: Math.max(0.001, c.end - offsetS), // end must stay > 0
    chord: c.chord,
  }));
}

/**
 * Remove micro-chords that are likely recognition artifacts.
 *
 * The minimum duration threshold adapts to the local tempo:
 *   - For real chords: threshold = 1/4 of local beat interval (≈ 16th note)
 *   - For "N" (no-chord) events: threshold = 1/2 of local beat interval
 *     (short silence gaps are almost always artifacts)
 *
 * After removal, consecutive identical chords are merged, and gaps
 * left by removed chords are absorbed by the previous chord.
 *
 * Safety: if filtering would remove all chords, returns the input unchanged.
 */
function filterMicroChords(
  chords: ChordEvent[],
  grid: number[],
  globalBpm: number
): ChordEvent[] {
  if (chords.length === 0) return chords;

  // Global fallback interval: one beat at the detected BPM
  const globalBeatInterval = globalBpm > 0 ? 60.0 / globalBpm : 0.5;

  const kept: ChordEvent[] = [];

  for (const c of chords) {
    const dur = c.end - c.start;
    const localInterval = localGridInterval(c.start, grid, globalBeatInterval);

    // Threshold: 16th note for real chords, 8th note for "N" (silence)
    const isNoChord = c.chord === "N";
    const threshold = isNoChord
      ? localInterval * 0.5   // ~8th note — short silences are artifacts
      : localInterval * 0.25; // ~16th note — preserves passing chords

    if (dur >= threshold) {
      kept.push({ ...c });
    }
  }

  // Safety: never filter everything
  if (kept.length === 0) return chords;

  // Merge consecutive identical chords (can happen after micro-chord removal)
  const merged: ChordEvent[] = [kept[0]];
  for (let i = 1; i < kept.length; i++) {
    const prev = merged[merged.length - 1];
    if (kept[i].chord === prev.chord) {
      // Extend the previous chord to cover the gap + new chord
      prev.end = kept[i].end;
    } else {
      // Fill any gap left by removed chords: extend previous chord's end
      // to meet the next chord's start (no silent gaps)
      if (kept[i].start > prev.end) {
        prev.end = kept[i].start;
      }
      merged.push(kept[i]);
    }
  }

  return merged;
}

// ── BPM detection via Python subprocess ───────────────────────────────────

async function detectBpm(audioPath: string): Promise<BpmResult | null> {
  try {
    const { stdout } = await execFileAsync(
      "python",
      [BPM_SCRIPT_PATH, audioPath],
      {
        timeout: 60_000,
        maxBuffer: 50 * 1024 * 1024, // grid arrays can be large
        env: buildEnv(),
      }
    );

    const result = JSON.parse(stdout.trim()) as BpmResult;
    if (result.error) {
      console.warn("BPM detection warning:", result.error);
      return null;
    }
    return result;
  } catch (err) {
    // BPM detection is best-effort; don't fail the whole request
    console.warn("BPM detection failed (non-fatal):", err);
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────

/**
 * POST /api/recognize
 *
 * Accepts: { url: string }
 *   - If `url` is a YouTube URL, downloads audio directly.
 *   - If `url` is a free-text query, uses yt-dlp's ytsearch to find and download the top result.
 *
 * Returns: { chords, duration?, bpm?, variable_tempo?, videoId?, title? }
 *
 * Pipeline:
 *   1. Download YouTube audio via yt-dlp (direct URL or ytsearch:query)
 *   2. In parallel:
 *      a. Upload audio to ChordMini for chord recognition
 *      b. Run variable-tempo BPM detection via librosa PLP
 *   3. Snap chord timestamps to the beat grid
 *   4. Apply YouTube offset correction
 *   5. Filter micro-chord artifacts
 *   6. Return processed chord data with resolved video ID
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

  const rawInput = body.url?.trim();
  if (!rawInput) {
    return NextResponse.json(
      { error: "Please provide a YouTube URL or search query." },
      { status: 400 }
    );
  }

  // Determine if this is a direct URL or a search query
  const isUrl = isYouTubeUrl(rawInput);

  // For URLs, validate format; for search queries, just check length
  if (!isUrl) {
    if (rawInput.length < 2) {
      return NextResponse.json(
        { error: "Search query is too short. Please enter at least 2 characters." },
        { status: 400 }
      );
    }
    if (rawInput.length > 200) {
      return NextResponse.json(
        { error: "Search query is too long. Please keep it under 200 characters." },
        { status: 400 }
      );
    }
  }

  // The argument passed to yt-dlp: either the raw URL or a ytsearch: query
  const ytDlpTarget = isUrl ? rawInput : `ytsearch1:${rawInput}`;

  let tempDir: string | null = null;

  try {
    // ── Step 1: Download audio via yt-dlp ─────────────────────────────
    tempDir = await mkdtemp(join(tmpdir(), "karachordy-"));
    const outputTemplate = join(tempDir, "audio.%(ext)s");

    const ffmpegBinDir = EXTRA_PATH_DIRS.find((d) => d.includes("FFmpeg"));
    const ytDlpArgs = [
      "-m",
      "yt_dlp",
      "--extract-audio",
      "--no-playlist",
      "--no-overwrites",
      "--no-warnings",
      "--print-json",
      ...(ffmpegBinDir ? ["--ffmpeg-location", ffmpegBinDir] : []),
      "-o",
      outputTemplate,
      ytDlpTarget,
    ];

    const { stdout: ytDlpStdout } = await execFileAsync("python", ytDlpArgs, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: buildEnv(),
    });

    // Parse yt-dlp JSON output to extract resolved video ID and title.
    // yt-dlp with --print-json outputs a single JSON object to stdout.
    // We look for the last complete JSON object in case there is
    // any stray output before/after it.
    let resolvedVideoId: string | undefined;
    let resolvedTitle: string | undefined;
    try {
      // Try parsing the entire output first (fastest path)
      const ytDlpJson = JSON.parse(ytDlpStdout.trim()) as {
        id?: string;
        title?: string;
        webpage_url?: string;
      };
      resolvedVideoId = ytDlpJson.id ?? undefined;
      resolvedTitle = ytDlpJson.title ?? undefined;
    } catch {
      // Fallback: find the last JSON object in the output (handles stray warnings)
      const jsonMatch = ytDlpStdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as {
            id?: string;
            title?: string;
          };
          resolvedVideoId = parsed.id ?? undefined;
          resolvedTitle = parsed.title ?? undefined;
        } catch {
          // give up on JSON parsing
        }
      }
      // If still no video ID, try to extract from the URL input
      if (!resolvedVideoId && isUrl) {
        resolvedVideoId = extractVideoId(rawInput) ?? undefined;
      }
      if (!resolvedVideoId) {
        console.warn("Could not parse yt-dlp JSON output for metadata.");
      }
    }

    // Find the downloaded audio file
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

    // ── Step 2: ChordMini + BPM detection in parallel ─────────────────
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([audioBuffer], { type: mimeType }),
      audioFile
    );
    formData.append("model", "chord-cnn-lstm");

    const [chordRes, bpmResult] = await Promise.all([
      fetch(`${CHORDMINI_URL}/api/recognize-chords`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(600_000), // 10 min for long songs
      }),
      detectBpm(audioPath),
    ]);

    if (!chordRes.ok) {
      const errText = await chordRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: `ChordMini API error (${chordRes.status}): ${errText || chordRes.statusText}`,
        },
        { status: 502 }
      );
    }

    const chordData = (await chordRes.json()) as {
      chords?: ChordEvent[];
      duration?: number;
    };

    // ── Step 3: Quantize chords to beat grid ──────────────────────────
    let chords: ChordEvent[] = chordData.chords ?? [];
    const hasGrid = bpmResult && bpmResult.grid.length >= 2;
    const bpm = bpmResult?.bpm ?? 0;

    if (hasGrid && chords.length > 0) {
      console.log(
        `BPM detected: ${bpm} (variable: ${bpmResult.variable_tempo}), ` +
        `grid points: ${bpmResult.grid_count}. Quantizing ${chords.length} chords.`
      );
      chords = quantizeChords(chords, bpmResult.grid);
    }

    // ── Step 4: Apply YouTube offset correction ───────────────────────
    chords = applyOffset(chords, YOUTUBE_OFFSET_S);

    // ── Step 5: Filter micro-chord artifacts ──────────────────────────
    const preFilterCount = chords.length;
    chords = filterMicroChords(
      chords,
      hasGrid ? bpmResult.grid : [],
      bpm
    );
    const filtered = preFilterCount - chords.length;
    if (filtered > 0) {
      console.log(`Filtered ${filtered} micro-chord artifacts (${preFilterCount} -> ${chords.length}).`);
    }

    // ── Step 6: Return enriched chord data ────────────────────────────
    return NextResponse.json({
      chords,
      duration: chordData.duration ?? bpmResult?.duration,
      bpm: bpm || undefined,
      variable_tempo: bpmResult?.variable_tempo,
      videoId: resolvedVideoId,
      title: resolvedTitle,
    });
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
