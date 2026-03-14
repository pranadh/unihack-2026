export type AppEnv = {
  DATABASE_URL: string;
  CHORDMINI_API_BASE_URL: string;
  CHORDMINI_API_KEY: string;
  REDIS_URL: string;
  REQUEST_RATE_LIMIT_PER_MINUTE: number;
  PORT: number;
  HOST: string;
};

export const getEnv = (): AppEnv => {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  const CHORDMINI_API_BASE_URL =
    process.env.CHORDMINI_API_BASE_URL ?? "http://127.0.0.1:5001";
  const CHORDMINI_API_KEY = process.env.CHORDMINI_API_KEY ?? "";
  const REDIS_URL = process.env.REDIS_URL ?? "";
  const REQUEST_RATE_LIMIT_PER_MINUTE = Number(
    process.env.REQUEST_RATE_LIMIT_PER_MINUTE ?? 30
  );
  const PORT = Number(process.env.PORT ?? 4000);
  const HOST = process.env.HOST ?? "0.0.0.0";

  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required but was not provided");
  }

  return {
    DATABASE_URL,
    CHORDMINI_API_BASE_URL,
    CHORDMINI_API_KEY,
    REDIS_URL,
    REQUEST_RATE_LIMIT_PER_MINUTE,
    PORT,
    HOST,
  };
};

/** Lazy singleton so modules can import without top-level throw during tests */
let _cached: AppEnv | null = null;
export const getRequiredEnv = (): AppEnv => {
  if (!_cached) _cached = getEnv();
  return _cached;
};
