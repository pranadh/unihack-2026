import { spawn } from "node:child_process";
import { getRequiredEnv } from "./env.js";

export interface PipelineChordEvent {
  start: number;
  end: number;
  chord: string;
}

export interface PipelineResult {
  duration?: number;
  bpm?: number;
  chords: PipelineChordEvent[];
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeResult = (raw: unknown): PipelineResult => {
  if (!raw || typeof raw !== "object") {
    throw new Error("Pipeline output must be an object");
  }

  const candidate = raw as {
    duration?: unknown;
    bpm?: unknown;
    chords?: unknown;
  };

  if (!Array.isArray(candidate.chords)) {
    throw new Error("Pipeline output missing chords array");
  }

  const chords: PipelineChordEvent[] = candidate.chords.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Chord at index ${index} must be an object`);
    }

    const chord = entry as {
      start?: unknown;
      end?: unknown;
      chord?: unknown;
    };

    if (!isFiniteNumber(chord.start) || chord.start < 0) {
      throw new Error(`Chord at index ${index} has invalid start`);
    }

    if (!isFiniteNumber(chord.end) || chord.end < chord.start) {
      throw new Error(`Chord at index ${index} has invalid end`);
    }

    if (typeof chord.chord !== "string" || chord.chord.trim().length === 0) {
      throw new Error(`Chord at index ${index} has invalid chord label`);
    }

    return {
      start: chord.start,
      end: chord.end,
      chord: chord.chord.trim(),
    };
  });

  const normalized: PipelineResult = { chords };

  if (candidate.duration !== undefined) {
    if (!isFiniteNumber(candidate.duration) || candidate.duration < 0) {
      throw new Error("Pipeline output has invalid duration");
    }
    normalized.duration = candidate.duration;
  }

  if (candidate.bpm !== undefined) {
    if (!isFiniteNumber(candidate.bpm) || candidate.bpm < 0) {
      throw new Error("Pipeline output has invalid bpm");
    }
    normalized.bpm = candidate.bpm;
  }

  return normalized;
};

export async function runPythonPipeline(
  requestId: string,
  youtubeUrl: string,
  timeoutMs = 15 * 60 * 1000
): Promise<PipelineResult> {
  const env = getRequiredEnv();

  return await new Promise((resolve, reject) => {
    const child = spawn(
      env.PYTHON_BIN,
      [env.PYTHON_PIPELINE_SCRIPT, "--request-id", requestId, "--url", youtubeUrl],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finishWithError = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finishWithError(new Error("Python pipeline timed out"));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      finishWithError(
        new Error(`Failed to spawn python pipeline: ${error.message}`)
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;

      if (code !== 0) {
        return finishWithError(
          new Error(
            `Python pipeline exited with code ${code}. stderr: ${stderr.trim() || "(empty)"}`
          )
        );
      }

      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const lastLine = lines.at(-1);

      if (!lastLine) {
        return finishWithError(
          new Error("Python pipeline produced no stdout output")
        );
      }

      try {
        const parsed = JSON.parse(lastLine) as unknown;
        const result = normalizeResult(parsed);
        settled = true;
        resolve(result);
      } catch (error) {
        finishWithError(
          new Error(
            `Invalid pipeline JSON output: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    });
  });
}
