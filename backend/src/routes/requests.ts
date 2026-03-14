/**
 * Request routes.
 *
 * POST /api/requests          - Submit YouTube URL for processing
 * GET  /api/requests/:id      - Get request status
 * GET  /api/requests/:id/timeline - Get chord timeline
 * POST /api/requests/:id/retry    - Retry failed request
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { extractYouTubeVideoId, isValidYouTubeUrl } from "../lib/youtube.js";
import {
  createSongRequest,
  retryRequest,
} from "../lib/processing.js";

const YOUTUBE_VIDEO_ID_RE = /^[\w-]{11}$/;

export async function requestRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/requests/lookup - Check if a processed timeline already exists
  app.get<{
    Querystring: { url?: string; videoId?: string };
  }>("/api/requests/lookup", async (request, reply) => {
    const rawUrl = request.query.url?.trim();
    const rawVideoId = request.query.videoId?.trim();

    let videoId: string | null = null;

    if (rawVideoId) {
      if (!YOUTUBE_VIDEO_ID_RE.test(rawVideoId)) {
        return reply.status(400).send({
          error: "videoId must be a valid YouTube video ID.",
        });
      }
      videoId = rawVideoId;
    } else if (rawUrl) {
      videoId = extractYouTubeVideoId(rawUrl);
    }

    if (!videoId) {
      return reply.status(400).send({
        error: "Provide a valid YouTube url or videoId.",
      });
    }

    const existing = await prisma.songRequest.findFirst({
      where: {
        youtubeVideoId: videoId,
        status: "complete",
      },
      orderBy: { completedAt: "desc" },
      include: {
        chordTimeline: {
          include: {
            chordEvents: {
              orderBy: { startTimeSec: "asc" },
            },
          },
        },
      },
    });

    if (!existing?.chordTimeline) {
      return reply.send({ found: false, youtubeVideoId: videoId });
    }

    return reply.send({
      found: true,
      requestId: existing.id,
      youtubeVideoId: existing.youtubeVideoId,
      durationSeconds: existing.chordTimeline.durationSeconds,
      generatedAt: existing.chordTimeline.generatedAt,
      chords: existing.chordTimeline.chordEvents.map((event) => ({
        start: event.startTimeSec,
        end: event.endTimeSec,
        chord: event.chordLabel,
      })),
    });
  });

  // POST /api/requests - Submit YouTube URL
  app.post<{
    Body: { url: string; userId?: string };
  }>("/api/requests", async (request, reply) => {
    const { url, userId } = request.body ?? {};

    if (!url || typeof url !== "string") {
      return reply.status(400).send({
        error: "Missing required field: url",
      });
    }

    if (!isValidYouTubeUrl(url)) {
      return reply.status(400).send({
        error: "Invalid YouTube URL. Please provide a valid youtube.com or youtu.be link.",
      });
    }

    try {
      const songRequest = await createSongRequest(url, userId);
      return reply.status(201).send({
        id: songRequest.id,
        status: songRequest.status,
        youtubeUrl: songRequest.youtubeUrl,
        youtubeVideoId: songRequest.youtubeVideoId,
        createdAt: songRequest.createdAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      request.log.error({ err }, "Failed to create song request");
      return reply.status(500).send({ error: message });
    }
  });

  // GET /api/requests/:id - Get request status
  app.get<{
    Params: { id: string };
  }>("/api/requests/:id", async (request, reply) => {
    const { id } = request.params;

    const songRequest = await prisma.songRequest.findUnique({
      where: { id },
      select: {
        id: true,
        youtubeUrl: true,
        youtubeVideoId: true,
        status: true,
        createdAt: true,
        completedAt: true,
        errorMessage: true,
      },
    });

    if (!songRequest) {
      return reply.status(404).send({ error: "Request not found" });
    }

    return reply.send(songRequest);
  });

  // GET /api/requests/:id/timeline - Get chord timeline with events
  app.get<{
    Params: { id: string };
  }>("/api/requests/:id/timeline", async (request, reply) => {
    const { id } = request.params;

    const songRequest = await prisma.songRequest.findUnique({
      where: { id },
      include: {
        chordTimeline: {
          include: {
            chordEvents: {
              orderBy: { startTimeSec: "asc" },
            },
          },
        },
      },
    });

    if (!songRequest) {
      return reply.status(404).send({ error: "Request not found" });
    }

    if (!songRequest.chordTimeline) {
      if (songRequest.status === "failed") {
        return reply.status(422).send({
          error: "Processing failed",
          message: songRequest.errorMessage,
        });
      }
      return reply.status(202).send({
        status: songRequest.status,
        message: "Timeline not ready yet. Processing is in progress.",
      });
    }

    return reply.send({
      id: songRequest.chordTimeline.id,
      songRequestId: id,
      youtubeVideoId: songRequest.youtubeVideoId,
      durationSeconds: songRequest.chordTimeline.durationSeconds,
      version: songRequest.chordTimeline.version,
      generatedAt: songRequest.chordTimeline.generatedAt,
      chords: songRequest.chordTimeline.chordEvents.map((e) => ({
        start: e.startTimeSec,
        end: e.endTimeSec,
        chord: e.chordLabel,
      })),
    });
  });

  // POST /api/requests/:id/retry - Retry a failed request
  app.post<{
    Params: { id: string };
  }>("/api/requests/:id/retry", async (request, reply) => {
    const { id } = request.params;

    try {
      const retried = await retryRequest(id);
      return reply.send({
        id: retried.id,
        status: retried.status,
        message: "Retry initiated",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Retry failed";
      if (message === "Request not found") {
        return reply.status(404).send({ error: message });
      }
      if (message === "Only failed requests can be retried") {
        return reply.status(400).send({ error: message });
      }
      request.log.error({ err }, "Retry failed");
      return reply.status(500).send({ error: message });
    }
  });
}
