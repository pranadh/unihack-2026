/**
 * Request processing service.
 *
 * Manages the lifecycle of a SongRequest:
 *   queued -> processing -> complete | failed
 *
 * Processing pipeline:
 *   1. Download YouTube audio to temp file via yt-dlp
 *   2. Upload audio file to ChordMini API for chord recognition
 *   3. Store chord timeline + events in PostgreSQL
 *   4. Clean up temp files
 *
 * Processing is done in-process (no external queue for MVP).
 */

import { prisma } from "./prisma.js";
import { recognizeChordsFromFile } from "./chordmini.js";
import {
  downloadYouTubeAudio,
  cleanupTempDir,
} from "./youtube-dl.js";
import { extractYouTubeVideoId } from "./youtube.js";
import type { SongRequest, ChordTimeline } from "@prisma/client";

export interface ProcessingResult {
  request: SongRequest;
  timeline: ChordTimeline | null;
  error?: string;
}

/**
 * Create a new song request and kick off async processing.
 */
export async function createSongRequest(
  youtubeUrl: string,
  userId?: string | null
): Promise<SongRequest> {
  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  // Check for existing complete request with same video ID
  const existing = await prisma.songRequest.findFirst({
    where: {
      youtubeVideoId: videoId,
      status: "complete",
    },
    include: { chordTimeline: true },
  });

  if (existing?.chordTimeline) {
    // Return the existing complete request instead of reprocessing
    return existing;
  }

  const request = await prisma.songRequest.create({
    data: {
      youtubeUrl,
      youtubeVideoId: videoId,
      status: "queued",
      userId: userId ?? null,
    },
  });

  // Fire-and-forget async processing
  processRequest(request.id).catch((err) => {
    console.error(`Background processing failed for ${request.id}:`, err);
  });

  return request;
}

/**
 * Process a song request:
 *   1. Download YouTube audio via yt-dlp
 *   2. Upload to ChordMini for chord recognition
 *   3. Store chord timeline in database
 *   4. Clean up temp files
 */
export async function processRequest(
  requestId: string
): Promise<ProcessingResult> {
  // Mark as processing
  let request = await prisma.songRequest.update({
    where: { id: requestId },
    data: { status: "processing" },
  });

  await logSystem(
    requestId,
    "info",
    "PROCESSING_START",
    "Chord extraction started"
  );

  let tempDir: string | null = null;

  try {
    // Step 1: Download YouTube audio
    await logSystem(
      requestId,
      "info",
      "DOWNLOAD_START",
      `Downloading audio from ${request.youtubeUrl}`
    );

    const download = await downloadYouTubeAudio(request.youtubeUrl);
    tempDir = download.tempDir;

    await logSystem(
      requestId,
      "info",
      "DOWNLOAD_COMPLETE",
      `Audio downloaded: ${download.title ?? "unknown title"}, ${download.duration ? `${download.duration.toFixed(1)}s` : "unknown duration"}`
    );

    // Step 2: Upload to ChordMini for chord recognition
    await logSystem(
      requestId,
      "info",
      "CHORDMINI_START",
      "Sending audio to ChordMini API for chord recognition"
    );

    const result = await recognizeChordsFromFile(download.filePath);

    // Calculate duration from chord events if not provided by API
    const duration =
      result.duration ??
      download.duration ??
      (result.chords.length > 0
        ? Math.max(...result.chords.map((c) => c.end))
        : 0);

    // Step 3: Store timeline and events in a transaction
    const timeline = await prisma.$transaction(async (tx) => {
      const tl = await tx.chordTimeline.create({
        data: {
          songRequestId: requestId,
          durationSeconds: duration,
          version: 1,
        },
      });

      if (result.chords.length > 0) {
        await tx.chordEvent.createMany({
          data: result.chords.map((c) => ({
            timelineId: tl.id,
            startTimeSec: c.start,
            endTimeSec: c.end,
            chordLabel: c.chord,
          })),
        });
      }

      return tl;
    });

    // Mark complete
    request = await prisma.songRequest.update({
      where: { id: requestId },
      data: {
        status: "complete",
        completedAt: new Date(),
      },
    });

    await logSystem(
      requestId,
      "info",
      "PROCESSING_COMPLETE",
      `Extracted ${result.chords.length} chord events in ${duration.toFixed(1)}s duration`
    );

    return { request, timeline };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown processing error";

    request = await prisma.songRequest.update({
      where: { id: requestId },
      data: {
        status: "failed",
        errorMessage,
      },
    });

    await logSystem(requestId, "error", "PROCESSING_FAILED", errorMessage);

    return { request, timeline: null, error: errorMessage };
  } finally {
    // Step 4: Always clean up temp files
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}

/**
 * Retry a failed request.
 */
export async function retryRequest(requestId: string): Promise<SongRequest> {
  const existing = await prisma.songRequest.findUnique({
    where: { id: requestId },
  });

  if (!existing) {
    throw new Error("Request not found");
  }

  if (existing.status !== "failed") {
    throw new Error("Only failed requests can be retried");
  }

  // Reset to queued
  const request = await prisma.songRequest.update({
    where: { id: requestId },
    data: {
      status: "queued",
      errorMessage: null,
      completedAt: null,
    },
  });

  // Clean up old timeline if exists
  await prisma.chordTimeline.deleteMany({
    where: { songRequestId: requestId },
  });

  // Fire-and-forget
  processRequest(requestId).catch((err) => {
    console.error(`Retry processing failed for ${requestId}:`, err);
  });

  return request;
}

async function logSystem(
  requestId: string,
  level: "debug" | "info" | "warn" | "error",
  code: string,
  message: string
): Promise<void> {
  try {
    // Try to link to song request if it exists
    const songRequest = await prisma.songRequest.findUnique({
      where: { id: requestId },
      select: { id: true },
    });

    await prisma.systemLog.create({
      data: {
        requestId,
        songRequestId: songRequest?.id ?? null,
        level,
        code,
        message,
      },
    });
  } catch {
    // Don't let logging failures break processing
    console.error(`Failed to write system log: ${code} - ${message}`);
  }
}
