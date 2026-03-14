/**
 * ChordMini API client.
 *
 * The self-hosted ChordMini API (Docker: ptnghia/chordminiapp-backend)
 * exposes a multipart file upload endpoint for chord recognition.
 *
 * Endpoint: POST /api/recognize-chords
 *   - file: audio file (multipart form data)
 *   - model: chord model name (e.g. "chord-cnn-lstm")
 *
 * This module handles uploading an audio file and normalising the response
 * into our internal chord-event format.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { getRequiredEnv } from "./env.js";

export interface RawChordEvent {
  start: number;
  end: number;
  chord: string;
}

export interface ChordMiniResult {
  chords: RawChordEvent[];
  duration?: number;
}

/** Default chord recognition model */
const DEFAULT_MODEL = "chord-cnn-lstm";

/**
 * Upload an audio file to ChordMini for chord recognition.
 *
 * Mirrors the Python reference implementation which sends:
 *   files = {'file': (filename, audio_file, mime_type)}
 *   data  = {'model': 'chord-cnn-lstm'}
 *
 * @param audioFilePath - Absolute path to an audio file (MP3, WAV, etc.)
 * @param model - Chord model to use (default: chord-cnn-lstm)
 * @returns Parsed chord events and optional duration
 */
export async function recognizeChordsFromFile(
  audioFilePath: string,
  model: string = DEFAULT_MODEL
): Promise<ChordMiniResult> {
  const env = getRequiredEnv();
  const base = env.CHORDMINI_API_BASE_URL.replace(/\/+$/, "");
  const endpoint = `${base}/api/recognize-chords`;

  // Read the audio file into a buffer
  const fileBuffer = await readFile(audioFilePath);
  const fileName = basename(audioFilePath);

  // Determine MIME type from extension
  const mimeType = fileName.endsWith(".wav") ? "audio/wav" : "audio/mpeg";

  // Build multipart form data (Node 18+ native FormData + Blob)
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([fileBuffer], { type: mimeType }),
    fileName
  );
  formData.append("model", model);

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(600_000), // 10 minute timeout for large files
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `ChordMini API error ${response.status}: ${text || response.statusText}`
    );
  }

  const data = (await response.json()) as {
    chords?: RawChordEvent[];
    duration?: number;
  };

  if (!data.chords || !Array.isArray(data.chords)) {
    throw new Error(
      "ChordMini API returned unexpected shape (no chords array)"
    );
  }

  return {
    chords: data.chords,
    duration: data.duration,
  };
}

/** Health-check the ChordMini service. */
export async function checkChordMiniHealth(): Promise<boolean> {
  const env = getRequiredEnv();
  const base = env.CHORDMINI_API_BASE_URL.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
