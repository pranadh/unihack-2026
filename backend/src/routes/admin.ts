/**
 * Admin routes.
 *
 * GET /api/admin/failures - Recent failed processing jobs
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/admin/failures - Recent failed jobs
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>("/api/admin/failures", async (request, reply) => {
    const limit = Math.min(Number(request.query.limit ?? 20), 100);
    const offset = Number(request.query.offset ?? 0);

    const [failures, total] = await Promise.all([
      prisma.songRequest.findMany({
        where: { status: "failed" },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          youtubeUrl: true,
          youtubeVideoId: true,
          status: true,
          createdAt: true,
          errorMessage: true,
        },
      }),
      prisma.songRequest.count({ where: { status: "failed" } }),
    ]);

    // Include recent error logs for each failure
    const failuresWithLogs = await Promise.all(
      failures.map(async (f) => {
        const logs = await prisma.systemLog.findMany({
          where: { songRequestId: f.id, level: "error" },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            level: true,
            code: true,
            message: true,
            createdAt: true,
          },
        });
        return { ...f, recentLogs: logs };
      })
    );

    return reply.send({
      items: failuresWithLogs,
      total,
      limit,
      offset,
    });
  });
}
