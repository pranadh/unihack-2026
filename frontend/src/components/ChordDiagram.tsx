"use client";

import { useMemo } from "react";
import type { Instrument } from "@/lib/instruments";

/**
 * Guitar chord diagram rendered as SVG.
 *
 * Shows a 5-fret × 6-string grid with:
 * - Finger dot positions
 * - Open (o) and muted (x) string indicators
 * - Optional barre indicators
 * - Fret offset label when chord starts above fret 1
 */

// ── Chord voicing data ──────────────────────────────────────────────────────
// Each voicing: [E, A, D, G, B, e] where:
//   -1 = muted (x)
//    0 = open (o)
//    n = fret number (finger placement)

interface ChordVoicing {
  frets: [number, number, number, number, number, number];
  baseFret: number; // 1 = open position, >1 = fret offset
  barres?: number[]; // fret numbers (relative to baseFret) that are barred
}

const CHORD_DB: Record<string, ChordVoicing> = {
  // Major chords
  C: { frets: [-1, 3, 2, 0, 1, 0], baseFret: 1 },
  D: { frets: [-1, -1, 0, 2, 3, 2], baseFret: 1 },
  E: { frets: [0, 2, 2, 1, 0, 0], baseFret: 1 },
  F: { frets: [1, 3, 3, 2, 1, 1], baseFret: 1, barres: [1] },
  G: { frets: [3, 2, 0, 0, 0, 3], baseFret: 1 },
  A: { frets: [-1, 0, 2, 2, 2, 0], baseFret: 1 },
  B: { frets: [-1, 2, 4, 4, 4, 2], baseFret: 1, barres: [2] },

  // Minor chords
  Cm: { frets: [-1, 3, 5, 5, 4, 3], baseFret: 1, barres: [3] },
  Dm: { frets: [-1, -1, 0, 2, 3, 1], baseFret: 1 },
  Em: { frets: [0, 2, 2, 0, 0, 0], baseFret: 1 },
  Fm: { frets: [1, 3, 3, 1, 1, 1], baseFret: 1, barres: [1] },
  Gm: { frets: [3, 5, 5, 3, 3, 3], baseFret: 1, barres: [3] },
  Am: { frets: [-1, 0, 2, 2, 1, 0], baseFret: 1 },
  Bm: { frets: [-1, 2, 4, 4, 3, 2], baseFret: 1, barres: [2] },

  // 7th chords
  C7: { frets: [-1, 3, 2, 3, 1, 0], baseFret: 1 },
  D7: { frets: [-1, -1, 0, 2, 1, 2], baseFret: 1 },
  E7: { frets: [0, 2, 0, 1, 0, 0], baseFret: 1 },
  F7: { frets: [1, 3, 1, 2, 1, 1], baseFret: 1, barres: [1] },
  G7: { frets: [3, 2, 0, 0, 0, 1], baseFret: 1 },
  A7: { frets: [-1, 0, 2, 0, 2, 0], baseFret: 1 },
  B7: { frets: [-1, 2, 1, 2, 0, 2], baseFret: 1 },

  // Minor 7th chords
  Cm7: { frets: [-1, 3, 5, 3, 4, 3], baseFret: 1, barres: [3] },
  Dm7: { frets: [-1, -1, 0, 2, 1, 1], baseFret: 1 },
  Em7: { frets: [0, 2, 0, 0, 0, 0], baseFret: 1 },
  Fm7: { frets: [1, 3, 1, 1, 1, 1], baseFret: 1, barres: [1] },
  Gm7: { frets: [3, 5, 3, 3, 3, 3], baseFret: 1, barres: [3] },
  Am7: { frets: [-1, 0, 2, 0, 1, 0], baseFret: 1 },
  Bm7: { frets: [-1, 2, 0, 2, 0, 2], baseFret: 1 },

  // Major 7th chords
  Cmaj7: { frets: [-1, 3, 2, 0, 0, 0], baseFret: 1 },
  Dmaj7: { frets: [-1, -1, 0, 2, 2, 2], baseFret: 1 },
  Emaj7: { frets: [0, 2, 1, 1, 0, 0], baseFret: 1 },
  Fmaj7: { frets: [1, 3, 3, 2, 1, 0], baseFret: 1 },
  Gmaj7: { frets: [3, 2, 0, 0, 0, 2], baseFret: 1 },
  Amaj7: { frets: [-1, 0, 2, 1, 2, 0], baseFret: 1 },
  Bmaj7: { frets: [-1, 2, 4, 3, 4, 2], baseFret: 1, barres: [2] },

  // Suspended chords
  Csus2: { frets: [-1, 3, 5, 5, 3, 3], baseFret: 1, barres: [3] },
  Csus4: { frets: [-1, 3, 3, 0, 1, 1], baseFret: 1 },
  Dsus2: { frets: [-1, -1, 0, 2, 3, 0], baseFret: 1 },
  Dsus4: { frets: [-1, -1, 0, 2, 3, 3], baseFret: 1 },
  Esus2: { frets: [0, 2, 4, 4, 0, 0], baseFret: 1 },
  Esus4: { frets: [0, 2, 2, 2, 0, 0], baseFret: 1 },
  Fsus2: { frets: [1, 3, 3, 0, 1, 1], baseFret: 1, barres: [1] },
  Fsus4: { frets: [1, 3, 3, 3, 1, 1], baseFret: 1, barres: [1] },
  Gsus2: { frets: [3, 0, 0, 0, 3, 3], baseFret: 1 },
  Gsus4: { frets: [3, 5, 5, 5, 3, 3], baseFret: 1, barres: [3] },
  Asus2: { frets: [-1, 0, 2, 2, 0, 0], baseFret: 1 },
  Asus4: { frets: [-1, 0, 2, 2, 3, 0], baseFret: 1 },
  Bsus2: { frets: [-1, 2, 4, 4, 2, 2], baseFret: 1, barres: [2] },
  Bsus4: { frets: [-1, 2, 4, 4, 5, 2], baseFret: 1, barres: [2] },

  // Power chords
  C5: { frets: [-1, 3, 5, 5, -1, -1], baseFret: 1 },
  D5: { frets: [-1, -1, 0, 2, 3, -1], baseFret: 1 },
  E5: { frets: [0, 2, 2, -1, -1, -1], baseFret: 1 },
  F5: { frets: [1, 3, 3, -1, -1, -1], baseFret: 1 },
  G5: { frets: [3, 5, 5, -1, -1, -1], baseFret: 1 },
  A5: { frets: [-1, 0, 2, 2, -1, -1], baseFret: 1 },
  B5: { frets: [-1, 2, 4, 4, -1, -1], baseFret: 1 },

  // Diminished / Augmented / Dim7
  Cdim: { frets: [-1, 3, 4, 5, 4, -1], baseFret: 1 },
  Ddim: { frets: [-1, -1, 0, 1, 3, 1], baseFret: 1 },
  Edim: { frets: [0, 1, 2, 0, -1, -1], baseFret: 1 },
  Fdim: { frets: [1, 2, 3, 1, -1, -1], baseFret: 1 },
  Gdim: { frets: [3, 4, 5, 3, -1, -1], baseFret: 1 },
  Adim: { frets: [-1, 0, 1, 2, 1, -1], baseFret: 1 },
  Bdim: { frets: [-1, 2, 3, 4, 3, -1], baseFret: 1 },
  Caug: { frets: [-1, 3, 2, 1, 1, 0], baseFret: 1 },
  Daug: { frets: [-1, -1, 0, 3, 3, 2], baseFret: 1 },
  Eaug: { frets: [0, 3, 2, 1, 1, 0], baseFret: 1 },
  Faug: { frets: [1, 0, 3, 2, 2, 1], baseFret: 1 },
  Gaug: { frets: [3, 2, 1, 0, 0, 3], baseFret: 1 },
  Aaug: { frets: [-1, 0, 3, 2, 2, 1], baseFret: 1 },
  Baug: { frets: [-1, 2, 1, 0, 0, 3], baseFret: 1 },
  Cdim7: { frets: [-1, 3, 4, 2, 4, 2], baseFret: 1 },
  Ddim7: { frets: [-1, -1, 0, 1, 0, 1], baseFret: 1 },
  Edim7: { frets: [0, 1, 2, 0, 2, 0], baseFret: 1 },
  Fdim7: { frets: [1, 2, 3, 1, 3, 1], baseFret: 1, barres: [1] },
  Gdim7: { frets: [3, 4, 5, 3, 5, 3], baseFret: 1, barres: [3] },
  Adim7: { frets: [-1, 0, 1, 2, 1, 2], baseFret: 1 },
  Bdim7: { frets: [-1, 2, 3, 1, 3, 1], baseFret: 1 },

  // Add / Slash common variants
  "Cadd9": { frets: [-1, 3, 2, 0, 3, 0], baseFret: 1 },
  "G/B": { frets: [-1, 2, 0, 0, 0, 3], baseFret: 1 },
  "D/F#": { frets: [2, -1, 0, 2, 3, 2], baseFret: 1 },
  "C/G": { frets: [3, 3, 2, 0, 1, 0], baseFret: 1 },
  "Am/G": { frets: [3, 0, 2, 2, 1, 0], baseFret: 1 },
  "Em/B": { frets: [-1, 2, 2, 0, 0, 0], baseFret: 1 },

  // Sharp/flat equivalents
  "C#": { frets: [-1, 4, 6, 6, 6, 4], baseFret: 1, barres: [4] },
  "Db": { frets: [-1, 4, 6, 6, 6, 4], baseFret: 1, barres: [4] },
  "D#": { frets: [-1, 6, 8, 8, 8, 6], baseFret: 1, barres: [6] },
  "Eb": { frets: [-1, 6, 8, 8, 8, 6], baseFret: 1, barres: [6] },
  "F#": { frets: [2, 4, 4, 3, 2, 2], baseFret: 1, barres: [2] },
  "Gb": { frets: [2, 4, 4, 3, 2, 2], baseFret: 1, barres: [2] },
  "G#": { frets: [4, 6, 6, 5, 4, 4], baseFret: 1, barres: [4] },
  "Ab": { frets: [4, 6, 6, 5, 4, 4], baseFret: 1, barres: [4] },
  "A#": { frets: [-1, 1, 3, 3, 3, 1], baseFret: 1, barres: [1] },
  "Bb": { frets: [-1, 1, 3, 3, 3, 1], baseFret: 1, barres: [1] },

  // Sharp/flat minors
  "C#m": { frets: [-1, 4, 6, 6, 5, 4], baseFret: 1, barres: [4] },
  "Dbm": { frets: [-1, 4, 6, 6, 5, 4], baseFret: 1, barres: [4] },
  "D#m": { frets: [-1, 6, 8, 8, 7, 6], baseFret: 1, barres: [6] },
  "Ebm": { frets: [-1, 6, 8, 8, 7, 6], baseFret: 1, barres: [6] },
  "F#m": { frets: [2, 4, 4, 2, 2, 2], baseFret: 1, barres: [2] },
  "Gbm": { frets: [2, 4, 4, 2, 2, 2], baseFret: 1, barres: [2] },
  "G#m": { frets: [4, 6, 6, 4, 4, 4], baseFret: 1, barres: [4] },
  "Abm": { frets: [4, 6, 6, 4, 4, 4], baseFret: 1, barres: [4] },
  "A#m": { frets: [-1, 1, 3, 3, 2, 1], baseFret: 1, barres: [1] },
  "Bbm": { frets: [-1, 1, 3, 3, 2, 1], baseFret: 1, barres: [1] },

  // Sharp/flat 7th chords
  "C#7": { frets: [-1, 4, 6, 4, 6, 4], baseFret: 1, barres: [4] },
  "Db7": { frets: [-1, 4, 6, 4, 6, 4], baseFret: 1, barres: [4] },
  "D#7": { frets: [-1, 6, 8, 6, 8, 6], baseFret: 1, barres: [6] },
  "Eb7": { frets: [-1, 6, 8, 6, 8, 6], baseFret: 1, barres: [6] },
  "F#7": { frets: [2, 4, 2, 3, 2, 2], baseFret: 1, barres: [2] },
  "Gb7": { frets: [2, 4, 2, 3, 2, 2], baseFret: 1, barres: [2] },
  "G#7": { frets: [4, 6, 4, 5, 4, 4], baseFret: 1, barres: [4] },
  "Ab7": { frets: [4, 6, 4, 5, 4, 4], baseFret: 1, barres: [4] },
  "A#7": { frets: [-1, 1, 3, 1, 3, 1], baseFret: 1, barres: [1] },
  "Bb7": { frets: [-1, 1, 3, 1, 3, 1], baseFret: 1, barres: [1] },

  // Sharp/flat minor 7th chords
  "C#m7": { frets: [-1, 4, 6, 4, 5, 4], baseFret: 1, barres: [4] },
  "Dbm7": { frets: [-1, 4, 6, 4, 5, 4], baseFret: 1, barres: [4] },
  "D#m7": { frets: [-1, 6, 8, 6, 7, 6], baseFret: 1, barres: [6] },
  "Ebm7": { frets: [-1, 6, 8, 6, 7, 6], baseFret: 1, barres: [6] },
  "F#m7": { frets: [2, 4, 2, 2, 2, 2], baseFret: 1, barres: [2] },
  "Gbm7": { frets: [2, 4, 2, 2, 2, 2], baseFret: 1, barres: [2] },
  "G#m7": { frets: [4, 6, 4, 4, 4, 4], baseFret: 1, barres: [4] },
  "Abm7": { frets: [4, 6, 4, 4, 4, 4], baseFret: 1, barres: [4] },
  "A#m7": { frets: [-1, 1, 3, 1, 2, 1], baseFret: 1, barres: [1] },
  "Bbm7": { frets: [-1, 1, 3, 1, 2, 1], baseFret: 1, barres: [1] },

  // Sharp/flat major 7th chords
  "C#maj7": { frets: [-1, 4, 6, 5, 6, 4], baseFret: 1, barres: [4] },
  "Dbmaj7": { frets: [-1, 4, 6, 5, 6, 4], baseFret: 1, barres: [4] },
  "D#maj7": { frets: [-1, 6, 8, 7, 8, 6], baseFret: 1, barres: [6] },
  "Ebmaj7": { frets: [-1, 6, 8, 7, 8, 6], baseFret: 1, barres: [6] },
  "F#maj7": { frets: [2, 4, 3, 3, 2, 2], baseFret: 1, barres: [2] },
  "Gbmaj7": { frets: [2, 4, 3, 3, 2, 2], baseFret: 1, barres: [2] },
  "G#maj7": { frets: [4, 6, 5, 5, 4, 4], baseFret: 1, barres: [4] },
  "Abmaj7": { frets: [4, 6, 5, 5, 4, 4], baseFret: 1, barres: [4] },
  "A#maj7": { frets: [-1, 1, 3, 2, 3, 1], baseFret: 1, barres: [1] },
  "Bbmaj7": { frets: [-1, 1, 3, 2, 3, 1], baseFret: 1, barres: [1] },
};

/**
 * Normalize chord names from various formats to our CHORD_DB key format.
 *
 * Handles:
 *  - MIREX colon format: "C:maj" -> "C", "A:min" -> "Am", "F#:min7" -> "F#m7"
 *  - Long quality names: "Cmaj" -> "C", "Cmin" -> "Cm", "Cmin7" -> "Cm7"
 *  - No-chord tokens: "N", "NC", "X" -> ""
 */
function normalizeChordName(raw: string): string {
  const name = raw.trim();
  // Handle "N" (no chord) or empty
  if (!name || name === "N" || name === "NC" || name === "X") return "";

  // ── MIREX colon format: "root:quality" ──
  // e.g. "C:maj", "A:min", "F#:min7", "Bb:sus4", "D:7", "G:maj7", "E:aug", "B:dim"
  if (name.includes(":")) {
    const [root, qualityRaw] = name.split(":", 2);
    const [quality, inversionRaw] = (qualityRaw ?? "").split("/", 2);
    const inversion = (inversionRaw ?? "").trim();
    const inversionIsNote = /^[A-G][#b]?$/.test(inversion);

    const withInversion = (base: string) =>
      inversionIsNote ? `${base}/${inversion}` : base;

    if (!quality || quality === "maj") return withInversion(root); // "C:maj" -> "C"
    if (quality === "min") return withInversion(`${root}m`);       // "A:min" -> "Am"
    if (quality === "min7") return withInversion(`${root}m7`);     // "F#:min7" -> "F#m7"
    if (quality === "maj7") return withInversion(`${root}maj7`);   // "G:maj7" -> "Gmaj7"
    if (quality === "7") return withInversion(`${root}7`);         // "D:7" -> "D7"
    if (quality === "sus2") return withInversion(`${root}sus2`);
    if (quality === "sus4") return withInversion(`${root}sus4`);
    if (quality === "dim") return withInversion(`${root}dim`);
    if (quality === "dim7") return withInversion(`${root}dim7`);
    if (quality === "aug") return withInversion(`${root}aug`);
    if (quality === "hdim7") return withInversion(`${root}m7`);    // half-dim -> closest: m7
    if (quality === "minmaj7") return withInversion(`${root}m7`);  // minor-major-7 -> closest: m7
    if (quality === "9") return withInversion(`${root}7`);         // 9th -> closest: 7
    if (quality === "min9") return withInversion(`${root}m7`);     // min9 -> closest: m7
    if (quality === "maj9") return withInversion(`${root}maj7`);   // maj9 -> closest: maj7
    // Fallback: try root + quality directly (e.g. "C:add9" -> "Cadd9")
    return withInversion(`${root}${quality}`);
  }

  // ── Standard text format ──
  let base = name;
  let inversion: string | null = null;
  if (name.includes("/")) {
    const [basePart, inversionPart] = name.split("/", 2);
    base = basePart;
    const trimmedInversion = inversionPart.trim();
    // Keep note inversions (e.g. G/B), drop voicing-degree suffixes (e.g. Emaj/5)
    if (/^[A-G][#b]?$/.test(trimmedInversion)) {
      inversion = trimmedInversion;
    }
  }

  // "Cmaj" -> "C" (but not "Cmaj7")
  base = base.replace(/maj(?!7)$/i, "");
  // "Cmin" -> "Cm" (but not "Cmin7")
  base = base.replace(/min(?!7)/i, "m");
  // "Cmin7" -> "Cm7"
  base = base.replace(/min7/i, "m7");
  // "Cmaj7" stays "Cmaj7"

  return inversion ? `${base}/${inversion}` : base;
}

function lookupVoicing(chordName: string): ChordVoicing | null {
  const normalized = normalizeChordName(chordName);
  if (!normalized) return null;

  // Direct lookup
  if (CHORD_DB[normalized]) return CHORD_DB[normalized];

  // If chord includes slash inversion and no exact voicing exists,
  // fall back to the base chord diagram.
  if (normalized.includes("/")) {
    const [base] = normalized.split("/", 2);
    if (CHORD_DB[base]) return CHORD_DB[base];
  }

  // Try without trailing modifiers (e.g., "Am7b5" -> "Am7" -> "Am")
  const simpler = normalized.replace(/[b#]?\d+$/, "");
  if (simpler !== normalized && CHORD_DB[simpler]) return CHORD_DB[simpler];

  // Try just the root + quality
  const rootMatch = normalized.match(/^([A-G][#b]?)(m?)$/);
  if (rootMatch) {
    const key = rootMatch[1] + rootMatch[2];
    if (CHORD_DB[key]) return CHORD_DB[key];
  }

  return null;
}

// ── SVG Diagram Component ───────────────────────────────────────────────────

interface PianoChordShape {
  root: string;
  bass: string | null;
  tonePitchClasses: number[];
  toneLabels: string[];
}

const NOTE_TO_PITCH_CLASS: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

const SHARP_PITCH_CLASS_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const FLAT_PITCH_CLASS_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

const PIANO_QUALITY_INTERVALS: Array<[RegExp, number[]]> = [
  [/^$/, [0, 4, 7]],
  [/^m$/, [0, 3, 7]],
  [/^7$/, [0, 4, 7, 10]],
  [/^m7$/, [0, 3, 7, 10]],
  [/^maj7$/, [0, 4, 7, 11]],
  [/^sus2$/, [0, 2, 7]],
  [/^sus4$/, [0, 5, 7]],
  [/^5$/, [0, 7]],
  [/^dim$/, [0, 3, 6]],
  [/^dim7$/, [0, 3, 6, 9]],
  [/^aug$/, [0, 4, 8]],
  [/^add9$/, [0, 4, 7]],
  [/^m(6|9|11|13)$/, [0, 3, 7, 10]],
  [/^(6|9|11|13)$/, [0, 4, 7, 10]],
  [/^maj(9|11|13)$/, [0, 4, 7, 11]],
  [/^m7b5$/, [0, 3, 6, 10]],
  [/^m7#5$/, [0, 3, 8, 10]],
];

const PIANO_WHITE_KEYS = [
  { note: "C", pitchClass: 0 },
  { note: "D", pitchClass: 2 },
  { note: "E", pitchClass: 4 },
  { note: "F", pitchClass: 5 },
  { note: "G", pitchClass: 7 },
  { note: "A", pitchClass: 9 },
  { note: "B", pitchClass: 11 },
  { note: "C", pitchClass: 0 },
];

const PIANO_BLACK_KEYS = [
  { note: "C#", pitchClass: 1, leftWhiteKey: 0 },
  { note: "D#", pitchClass: 3, leftWhiteKey: 1 },
  { note: "F#", pitchClass: 6, leftWhiteKey: 3 },
  { note: "G#", pitchClass: 8, leftWhiteKey: 4 },
  { note: "A#", pitchClass: 10, leftWhiteKey: 5 },
];

function toPitchClass(note: string): number | null {
  return NOTE_TO_PITCH_CLASS[note] ?? null;
}

function formatPitchClassName(pitchClass: number, preferFlats: boolean): string {
  const normalized = ((pitchClass % 12) + 12) % 12;
  return preferFlats
    ? FLAT_PITCH_CLASS_NAMES[normalized]
    : SHARP_PITCH_CLASS_NAMES[normalized];
}

function getPianoIntervals(quality: string): number[] | null {
  for (const [pattern, intervals] of PIANO_QUALITY_INTERVALS) {
    if (pattern.test(quality)) {
      return intervals;
    }
  }

  if (quality.startsWith("maj7")) return [0, 4, 7, 11];
  if (quality.startsWith("m7")) return [0, 3, 7, 10];
  if (quality.startsWith("m")) return [0, 3, 7];
  if (quality.startsWith("7")) return [0, 4, 7, 10];
  if (quality.startsWith("sus2")) return [0, 2, 7];
  if (quality.startsWith("sus4")) return [0, 5, 7];
  if (quality.includes("dim7")) return [0, 3, 6, 9];
  if (quality.includes("dim")) return [0, 3, 6];
  if (quality.includes("aug")) return [0, 4, 8];
  if (quality.includes("add9")) return [0, 4, 7];
  if (quality.includes("5")) return [0, 7];

  return null;
}

function simplifyPianoToneLabels(labels: string[]): string[] {
  return Array.from(new Set(labels)).slice(0, 4);
}

function lookupPianoShape(chordName: string): PianoChordShape | null {
  const normalized = normalizeChordName(chordName);
  if (!normalized) return null;

  const [base, bassRaw] = normalized.split("/", 2);
  const match = base.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return null;

  const [, root, quality] = match;
  const rootPitchClass = toPitchClass(root);
  if (rootPitchClass === null) return null;

  const intervals = getPianoIntervals(quality);
  if (!intervals) return null;

  const preferFlats = root.includes("b") || bassRaw?.includes("b") === true;
  const tonePitchClasses = Array.from(
    new Set(intervals.map((interval) => (rootPitchClass + interval) % 12))
  );
  const toneLabels = simplifyPianoToneLabels(
    intervals.map((interval) =>
      formatPitchClassName(rootPitchClass + interval, preferFlats)
    )
  );

  return {
    root,
    bass: bassRaw && /^[A-G][#b]?$/.test(bassRaw) ? bassRaw : null,
    tonePitchClasses,
    toneLabels,
  };
}

function GuitarChordDiagram({ chord, size }: { chord: string; size: number }) {
  const voicing = useMemo(() => lookupVoicing(chord), [chord]);
  const normalized = normalizeChordName(chord);

  if (!voicing || !normalized) {
    return null;
  }

  const viewW = 128;
  const viewH = 140;
  const padL = 24;
  const padR = 24;
  const padT = 22;
  const padB = 10;
  const gridW = viewW - padL - padR;
  const gridH = viewH - padT - padB;
  const stringSpacing = gridW / 5;
  const fretSpacing = gridH / 5;
  const dotR = stringSpacing * 0.3;

  const activeFrets = voicing.frets.filter((f) => f > 0);
  const minFret = activeFrets.length > 0 ? Math.min(...activeFrets) : 1;
  const maxFret = activeFrets.length > 0 ? Math.max(...activeFrets) : 1;

  let displayBaseFret = voicing.baseFret;
  if (maxFret > 5 && voicing.baseFret === 1) {
    displayBaseFret = minFret;
  } else if (maxFret - minFret >= 5) {
    displayBaseFret = minFret;
  }

  const stringX = (s: number) => padL + s * stringSpacing;
  const fretY = (f: number) => padT + f * fretSpacing;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      width={size}
      height={size * (viewH / viewW)}
      overflow="visible"
      style={{ overflow: "visible" }}
      role="img"
      aria-label={`${chord} guitar chord diagram`}
    >
      {displayBaseFret === 1 ? (
        <line
          x1={padL}
          y1={padT}
          x2={padL + gridW}
          y2={padT}
          stroke="#d4d4d8"
          strokeWidth={1}
        />
      ) : (
        <text
          x={-2}
          y={padT + fretSpacing / 2 + 3.5}
          textAnchor="start"
          fontSize={12}
          fontWeight={800}
          fill="#fafafa"
        >
          {displayBaseFret}fr
        </text>
      )}

      {Array.from({ length: 6 }, (_, i) => (
        <line
          key={`fret-${i}`}
          x1={padL}
          y1={fretY(i)}
          x2={padL + gridW}
          y2={fretY(i)}
          stroke="#52525b"
          strokeWidth={1}
        />
      ))}

      {Array.from({ length: 6 }, (_, i) => (
        <line
          key={`string-${i}`}
          x1={stringX(i)}
          y1={padT}
          x2={stringX(i)}
          y2={padT + gridH}
          stroke="#71717a"
          strokeWidth={i < 3 ? 1.5 : 1}
        />
      ))}

      {voicing.barres?.map((barreFret) => {
        const relFret = barreFret - displayBaseFret + 1;
        if (relFret < 1 || relFret > 5) return null;
        const barreStrings = voicing.frets
          .map((f, i) => (f >= barreFret ? i : -1))
          .filter((i) => i >= 0);
        if (barreStrings.length < 2) return null;
        const firstString = Math.min(...barreStrings);
        const lastString = Math.max(...barreStrings);
        const y = fretY(relFret) - fretSpacing / 2;
        return (
          <rect
            key={`barre-${barreFret}`}
            x={stringX(firstString) - dotR}
            y={y - dotR}
            width={stringX(lastString) - stringX(firstString) + dotR * 2}
            height={dotR * 2}
            rx={dotR}
            fill="#d7795f"
          />
        );
      })}

      {voicing.frets.map((fret, stringIdx) => {
        const x = stringX(stringIdx);

        if (fret === -1) {
          return (
            <text
              key={`m-${stringIdx}`}
              x={x}
              y={padT - 6}
              textAnchor="middle"
              fontSize={10}
              fontWeight="bold"
              fill="#71717a"
            >
              ×
            </text>
          );
        }

        if (fret === 0) {
          return (
            <circle
              key={`o-${stringIdx}`}
              cx={x}
              cy={padT - 10}
              r={4}
              fill="none"
              stroke="#a1a1aa"
              strokeWidth={1.5}
            />
          );
        }

        const relFret = fret - displayBaseFret + 1;
        if (relFret < 1 || relFret > 5) return null;
        const y = fretY(relFret) - fretSpacing / 2;

        return (
          <circle
            key={`d-${stringIdx}`}
            cx={x}
            cy={y}
            r={dotR}
            fill="#d7795f"
          />
        );
      })}
    </svg>
  );
}

function PianoChordDiagram({ chord, size }: { chord: string; size: number }) {
  const shape = useMemo(() => lookupPianoShape(chord), [chord]);

  if (!shape) {
    return null;
  }

  const whiteKeyWidth = 24;
  const whiteKeyHeight = 96;
  const blackKeyWidth = 14;
  const blackKeyHeight = 56;
  const viewW = PIANO_WHITE_KEYS.length * whiteKeyWidth;
  const viewH = 142;
  const activePitchClasses = new Set(shape.tonePitchClasses);
  const rootPitchClass = toPitchClass(shape.root);

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      width={size}
      height={size * (viewH / viewW)}
      role="img"
      aria-label={`${chord} piano chord diagram`}
    >
      <text
        x={viewW / 2}
        y={15}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill="#e7e5e4"
      >
        {shape.toneLabels.join(" - ")}
        {shape.bass ? `  bass ${shape.bass}` : ""}
      </text>

      <g transform="translate(0 28)">
        {PIANO_WHITE_KEYS.map((key, index) => {
          const isActive = activePitchClasses.has(key.pitchClass);
          const isRoot = key.pitchClass === rootPitchClass;

          return (
            <g key={`${key.note}-${index}`}>
              <rect
                x={index * whiteKeyWidth}
                y={0}
                width={whiteKeyWidth}
                height={whiteKeyHeight}
                rx={2}
                fill={isRoot ? "#7b2f55" : isActive ? "#2f4f8f" : "#f5f3f0"}
                stroke="#1c1917"
                strokeWidth={1}
              />
              <text
                x={index * whiteKeyWidth + whiteKeyWidth / 2}
                y={whiteKeyHeight - 10}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill={isActive ? "#fff8f4" : "#44403c"}
              >
                {key.note}
              </text>
            </g>
          );
        })}

        {PIANO_BLACK_KEYS.map((key, index) => {
          const isActive = activePitchClasses.has(key.pitchClass);
          const isRoot = key.pitchClass === rootPitchClass;

          return (
            <rect
              key={`${key.note}-${index}`}
              x={(key.leftWhiteKey + 1) * whiteKeyWidth - blackKeyWidth / 2}
              y={0}
              width={blackKeyWidth}
              height={blackKeyHeight}
              rx={2}
              fill={isRoot ? "#7b2f55" : isActive ? "#2f4f8f" : "#111827"}
              stroke="#0a0a0a"
              strokeWidth={1}
            />
          );
        })}
      </g>
    </svg>
  );
}

interface ChordDiagramProps {
  chord: string;
  instrument?: Instrument;
  /** Width/height in pixels. Diagram maintains aspect ratio. */
  size?: number;
}

export default function ChordDiagram({
  chord,
  instrument = "guitar",
  size = 120,
}: ChordDiagramProps) {
  const normalized = normalizeChordName(chord);
  const guitarVoicing = useMemo(() => lookupVoicing(chord), [chord]);
  const pianoShape = useMemo(() => lookupPianoShape(chord), [chord]);

  if (!normalized || (instrument === "guitar" ? !guitarVoicing : !pianoShape)) {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{ width: size, height: instrument === "piano" ? size * 0.9 : size * 1.25 }}
      >
        <p className="text-xs text-zinc-600">No {instrument} diagram</p>
        <p className="text-sm font-semibold text-zinc-400">{chord}</p>
      </div>
    );
  }

  return instrument === "piano" ? (
    <PianoChordDiagram chord={chord} size={size} />
  ) : (
    <GuitarChordDiagram chord={chord} size={size} />
  );
}

export { normalizeChordName, lookupVoicing };
export type { ChordVoicing };
