import Fastify from "fastify";
import { checkChordMiniHealth } from "./lib/chordmini.js";
import { checkYtDlp } from "./lib/youtube-dl.js";
import { requestRoutes } from "./routes/requests.js";
import { historyRoutes } from "./routes/history.js";
import { adminRoutes } from "./routes/admin.js";
import { getRequiredEnv } from "./lib/env.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

const app = Fastify({
  logger: true,
});
const env = getRequiredEnv();
const allowedOrigins = new Set(env.ALLOWED_ORIGINS);

// ── CORS ────────────────────────────────────────────────────────────────────
// Allow frontend origins (Vercel + local dev)
app.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
  }
  reply.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  reply.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  if (origin) {
    reply.header("Vary", "Origin");
  }
  reply.header("Access-Control-Max-Age", "86400");

  if (request.method === "OPTIONS") {
    return reply.status(204).send();
  }
});

// ── Request body parsing ────────────────────────────────────────────────────
// Fastify parses JSON by default.

// ── Simple in-memory rate limiter for POST /api/requests ────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.REQUEST_RATE_LIMIT_PER_MINUTE ?? 30);

app.addHook("onRequest", async (request, reply) => {
  if (request.method !== "POST" || request.url !== "/api/requests") return;

  const ip =
    (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    request.ip;
  const now = Date.now();

  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }

  entry.count++;

  reply.header("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
  reply.header(
    "X-RateLimit-Remaining",
    String(Math.max(0, RATE_LIMIT_MAX - entry.count))
  );
  reply.header(
    "X-RateLimit-Reset",
    String(Math.ceil(entry.resetAt / 1000))
  );

  if (entry.count > RATE_LIMIT_MAX) {
    return reply.status(429).send({
      error: "Too many requests. Please wait before submitting again.",
    });
  }
});

// Periodic cleanup of stale rate-limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 60_000).unref();

// ── Health endpoint ─────────────────────────────────────────────────────────
app.get("/api/health", async () => {
  const [chordMiniHealthy, ytDlpAvailable] = await Promise.all([
    checkChordMiniHealth(),
    checkYtDlp(),
  ]);
  return {
    status: "ok",
    service: "karachordy-backend",
    timestamp: new Date().toISOString(),
    dependencies: {
      chordmini: chordMiniHealthy ? "healthy" : "unreachable",
      ytdlp: ytDlpAvailable ? "available" : "missing",
    },
  };
});

// ── Register route modules ──────────────────────────────────────────────────
await app.register(requestRoutes);
await app.register(historyRoutes);
await app.register(adminRoutes);

// ── Start ───────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({ port, host });
    app.log.info(`Backend running on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
