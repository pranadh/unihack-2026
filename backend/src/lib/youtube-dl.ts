/**
 * YouTube audio download via yt-dlp subprocess.
 *
 * Downloads the best audio from a YouTube URL to a temporary MP3 file.
 * Requires `yt-dlp` and `ffmpeg` to be installed on the system PATH.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getRequiredEnv } from "./env.js";

const execFileAsync = promisify(execFile);

/** Result from downloading YouTube audio. */
export interface DownloadResult {
  /** Absolute path to the downloaded audio file. */
  filePath: string;
  /** Temporary directory containing the file (caller must clean up). */
  tempDir: string;
  /** Duration in seconds (if available from yt-dlp). */
  duration?: number;
  /** Video title (if available). */
  title?: string;
}

/**
 * Check if yt-dlp is available on the system.
 */
export async function checkYtDlp(): Promise<boolean> {
  const env = getRequiredEnv();

  try {
    await execFileAsync("yt-dlp", ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    // Fallback for VPS/systemd setups where yt-dlp is installed only in the
    // backend Python environment (python -m yt_dlp) and not on global PATH.
  }

  try {
    await execFileAsync(env.PYTHON_BIN, ["-m", "yt_dlp", "--version"], {
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Download YouTube audio as MP3 to a temporary directory.
 *
 * The caller is responsible for cleaning up `result.tempDir` when done.
 *
 * @param youtubeUrl - Valid YouTube URL
 * @param timeoutMs - Download timeout in milliseconds (default 5 minutes)
 * @returns DownloadResult with file path and metadata
 */
export async function downloadYouTubeAudio(
  youtubeUrl: string,
  timeoutMs = 300_000
): Promise<DownloadResult> {
  // Create a unique temp directory for this download
  const tempDir = await mkdtemp(join(tmpdir(), "karachordy-"));
  const outputTemplate = join(tempDir, "audio.%(ext)s");

  try {
    // Use yt-dlp to download best audio and convert to mp3
    // --extract-audio: extract audio only
    // --audio-format mp3: convert to mp3
    // --audio-quality 192K: 192kbps quality
    // --no-playlist: don't download playlists
    // --no-overwrites: don't overwrite existing files
    // --print-json: output metadata as JSON to stdout
    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "192K",
        "--no-playlist",
        "--no-overwrites",
        "--print-json",
        "-o",
        outputTemplate,
        youtubeUrl,
      ],
      {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10 MB buffer for JSON output
      }
    );

    // Parse yt-dlp JSON output to get metadata
    let duration: number | undefined;
    let title: string | undefined;
    try {
      const info = JSON.parse(stdout) as {
        duration?: number;
        title?: string;
        requested_downloads?: Array<{ filepath?: string }>;
      };
      duration = info.duration;
      title = info.title;
    } catch {
      // JSON parse failed, not critical
    }

    // The output file should be at audio.mp3 in the temp dir
    const mp3Path = join(tempDir, "audio.mp3");

    // Verify the file exists
    try {
      await stat(mp3Path);
    } catch {
      throw new Error(
        `yt-dlp completed but MP3 file not found at ${mp3Path}. ` +
          `Check that ffmpeg is installed for audio conversion.`
      );
    }

    return {
      filePath: mp3Path,
      tempDir,
      duration,
      title,
    };
  } catch (err) {
    // Clean up temp dir on failure
    await cleanupTempDir(tempDir);
    throw err;
  }
}

/**
 * Clean up a temporary directory created by downloadYouTubeAudio.
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
    console.error(`Failed to clean up temp directory: ${tempDir}`);
  }
}
