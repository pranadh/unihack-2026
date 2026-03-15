/**
 * History routes.
 *
 * GET /api/history - List recent processed requests
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getGuestSessionHashFromRequest } from "../lib/guest-session.js";

export async function historyRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/history - List recent requests
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>("/api/history", async (request, reply) => {
    const limit = Math.min(Number(request.query.limit ?? 20), 100);
    const offset = Number(request.query.offset ?? 0);
    const guestSessionHash = getGuestSessionHashFromRequest(request);

    if (!guestSessionHash) {
      return reply.status(400).send({
        error: "Missing guest session. Provide x-guest-session-id header.",
      });
    }

    const where = { guestSessionHash };

    const [requests, total] = await Promise.all([
      prisma.songRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          youtubeUrl: true,
          youtubeVideoId: true,
          status: true,
          createdAt: true,
          completedAt: true,
          errorMessage: true,
        },
      }),
      prisma.songRequest.count({ where }),
    ]);

    return reply.send({
      items: requests,
      total,
      limit,
      offset,
    });
  });
}
