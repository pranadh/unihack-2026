import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";

export const GUEST_SESSION_HEADER = "x-guest-session-id";

const GUEST_SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getGuestSessionIdFromRequest(
  request: FastifyRequest
): string | null {
  const raw = request.headers[GUEST_SESSION_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!GUEST_SESSION_ID_RE.test(normalized)) {
    return null;
  }

  return normalized;
}

export function hashGuestSessionId(guestSessionId: string): string {
  return createHash("sha256").update(guestSessionId).digest("hex");
}

export function getGuestSessionHashFromRequest(
  request: FastifyRequest
): string | null {
  const sessionId = getGuestSessionIdFromRequest(request);
  if (!sessionId) {
    return null;
  }

  return hashGuestSessionId(sessionId);
}
