/**
 * Request processing service.
 *
 * Manages the lifecycle of a SongRequest:
 *   queued -> processing -> complete | failed
 *
 * Processing pipeline:
 *   1. Run backend Python pipeline (download/refine/chord detection)
 *   2. Store chord timeline + events in PostgreSQL
 *
 * Processing is done in-process (no external queue for MVP).
 */

import { prisma } from "./prisma.js";
import { runPythonPipeline } from "./python-pipeline.js";
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
  userId?: string | null,
  guestSessionHash?: string | null
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
      ...(userId
        ? { userId }
        : guestSessionHash
          ? { guestSessionHash }
          : {}),
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
        guestSessionHash: guestSessionHash ?? null,
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
 *   1. Run backend Python pipeline
 *   2. Store chord timeline in database
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

  try {
    // Step 1: Run backend Python pipeline
    await logSystem(
      requestId,
      "info",
      "PIPELINE_START",
      `Starting Python pipeline for ${request.youtubeUrl}`
    );

    const result = await runPythonPipeline(requestId, request.youtubeUrl);

    await logSystem(
      requestId,
      "info",
      "PIPELINE_COMPLETE",
      `Pipeline returned ${result.chords.length} chord events${result.bpm !== undefined ? ` and BPM ${result.bpm.toFixed(2)}` : ""}`
    );

    // Calculate duration from chord events if not provided by API
    const duration =
      result.duration ??
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
