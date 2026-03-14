import type { ChordEvent } from "@/lib/api";
import {
  NOTE_TO_PITCH_CLASS,
  parseChordName,
  type ParsedChord,
  type ChordQualityFamily,
} from "@/lib/chords";

export type ChordDisplayMode = "names" | "roman";

export const DEFAULT_CHORD_DISPLAY_MODE: ChordDisplayMode = "names";
export const CHORD_DISPLAY_MODE_STORAGE_KEY = "karachordy-chord-display-mode";

export function isChordDisplayMode(value: unknown): value is ChordDisplayMode {
  return value === "names" || value === "roman";
}

export interface ChordDisplaySegment {
  start: number;
  end: number;
  keyLabel: string;
  keyRoot: string;
  isMinor: boolean;
}

export interface ChordDisplayInfo {
  mode: ChordDisplayMode;
  original: string;
  display: string;
  keyLabel: string | null;
}

interface CandidateKey {
  rootPc: number;
  isMinor: boolean;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const MAJOR_ROMANS = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];
const MINOR_ROMANS = ["i", "bII", "ii", "III", "#III", "iv", "#iv", "v", "VI", "#VI", "VII", "#VII"];

const MAJOR_SCALE_DEGREES = new Set([0, 2, 4, 5, 7, 9, 11]);
const MINOR_SCALE_DEGREES = new Set([0, 2, 3, 5, 7, 8, 10]);

const WINDOW_SECONDS = 20;
const MIN_KEY_CHANGE_CHORDS = 3;
const MIN_KEY_CHANGE_SECONDS = 10;

export function buildChordDisplaySegments(chords: ChordEvent[]): ChordDisplaySegment[] {
  const tonalChords = chords.filter((chord) => parseChordName(chord.chord) !== null);
  if (tonalChords.length === 0) {
    return [];
  }

  const analyses = tonalChords.map((_, index) => analyzeWindow(tonalChords, index));
  const firstAnalysis = analyses.find((analysis): analysis is CandidateKey => analysis !== null);
  if (!firstAnalysis) {
    return [];
  }

  const smoothedAnalyses: CandidateKey[] = Array.from({ length: tonalChords.length }, () => firstAnalysis);
  let currentKey = firstAnalysis;
  let pendingChange: { candidate: CandidateKey; startIndex: number; count: number } | null = null;

  for (let i = 0; i < tonalChords.length; i++) {
    const analysis = analyses[i] ?? currentKey;

    if (sameKey(analysis, currentKey)) {
      pendingChange = null;
      smoothedAnalyses[i] = currentKey;
      continue;
    }

    if (pendingChange && sameKey(pendingChange.candidate, analysis)) {
      pendingChange.count += 1;
    } else {
      pendingChange = { candidate: analysis, startIndex: i, count: 1 };
    }

    const pendingDuration =
      tonalChords[i].end - tonalChords[pendingChange.startIndex].start;
    const shouldCommitChange =
      pendingChange.count >= MIN_KEY_CHANGE_CHORDS ||
      pendingDuration >= MIN_KEY_CHANGE_SECONDS;

    if (shouldCommitChange) {
      currentKey = pendingChange.candidate;
      for (let j = pendingChange.startIndex; j <= i; j++) {
        smoothedAnalyses[j] = currentKey;
      }
      pendingChange = null;
    } else {
      smoothedAnalyses[i] = currentKey;
    }
  }

  const segments: ChordDisplaySegment[] = [];

  for (let i = 0; i < tonalChords.length; i++) {
    const analysis = smoothedAnalyses[i];

    const current = {
      start: tonalChords[i].start,
      end: tonalChords[i].end,
      keyLabel: formatKeyLabel(analysis.rootPc, analysis.isMinor, tonalChords[i].chord),
      keyRoot: formatPitchClassName(analysis.rootPc, tonalChords[i].chord),
      isMinor: analysis.isMinor,
    };

    const last = segments[segments.length - 1];
    if (
      last &&
      last.keyRoot === current.keyRoot &&
      last.isMinor === current.isMinor
    ) {
      last.end = Math.max(last.end, tonalChords[i].end);
    } else {
      segments.push(current);
    }
  }

  return segments;
}

function sameKey(a: CandidateKey, b: CandidateKey): boolean {
  return a.rootPc === b.rootPc && a.isMinor === b.isMinor;
}

function analyzeWindow(chords: ChordEvent[], centerIndex: number): CandidateKey | null {
  const center = chords[centerIndex];
  const windowStart = center.start - WINDOW_SECONDS;
  const windowEnd = center.start + WINDOW_SECONDS;
  const parsed = chords
    .filter((chord) => chord.end > windowStart && chord.start < windowEnd)
    .map((chord) => ({ chord, parsed: parseChordName(chord.chord) }))
    .filter((entry): entry is { chord: ChordEvent; parsed: ParsedChord } => entry.parsed !== null);

  if (parsed.length === 0) {
    return null;
  }

  const candidates: CandidateKey[] = [];
  for (let i = 0; i < 12; i++) {
    candidates.push({ rootPc: i, isMinor: false }, { rootPc: i, isMinor: true });
  }

  let best: CandidateKey | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    let score = 0;
    for (const entry of parsed) {
      score += scoreChordInKey(entry.parsed, entry.chord, candidate);
    }

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function scoreChordInKey(
  chord: ParsedChord,
  event: ChordEvent,
  candidate: CandidateKey
): number {
  const durationWeight = Math.max(0.5, Math.min(4, event.end - event.start));
  const interval = mod12(chord.pitchClass - candidate.rootPc);
  const scale = candidate.isMinor ? MINOR_SCALE_DEGREES : MAJOR_SCALE_DEGREES;

  let score = scale.has(interval) ? 2 : -1.5;

  if (interval === 0) {
    score += chord.qualityFamily === (candidate.isMinor ? "minor" : "major") ? 3 : 1;
  }

  if (interval === 7 && (chord.qualityFamily === "major" || chord.qualityFamily === "dominant")) {
    score += 2.5;
  }

  if (!candidate.isMinor && interval === 5 && chord.qualityFamily === "major") {
    score += 1.5;
  }

  if (candidate.isMinor && interval === 3 && chord.qualityFamily === "major") {
    score += 1.5;
  }

  if (chord.qualityFamily === "diminished" || chord.qualityFamily === "half-diminished") {
    score += scale.has(interval) ? 1 : -1;
  }

  if (chord.bassPitchClass !== null && chord.bassPitchClass !== chord.pitchClass) {
    score += 0.1;
  }

  return score * durationWeight;
}

export function getChordDisplayInfo(
  chordName: string,
  mode: ChordDisplayMode,
  keySegments: ChordDisplaySegment[],
  time: number
): ChordDisplayInfo {
  if (mode === "names") {
    const segment = getKeySegmentAtTime(keySegments, time);
    return {
      mode,
      original: chordName,
      display: chordName,
      keyLabel: segment?.keyLabel ?? null,
    };
  }

  const parsed = parseChordName(chordName);
  const segment = getKeySegmentAtTime(keySegments, time);
  if (!parsed || !segment) {
    return {
      mode,
      original: chordName,
      display: chordName,
      keyLabel: segment?.keyLabel ?? null,
    };
  }

  return {
    mode,
    original: chordName,
    display: formatRomanNumeral(parsed, segment),
    keyLabel: segment.keyLabel,
  };
}

function getKeySegmentAtTime(
  segments: ChordDisplaySegment[],
  time: number
): ChordDisplaySegment | null {
  for (const segment of segments) {
    if (time >= segment.start && time < segment.end) {
      return segment;
    }
  }

  if (segments.length > 0 && time >= segments[segments.length - 1].end) {
    return segments[segments.length - 1];
  }

  return segments[0] ?? null;
}

function formatRomanNumeral(parsed: ParsedChord, segment: ChordDisplaySegment): string {
  const interval = mod12(parsed.pitchClass - NOTE_TO_PITCH_CLASS[segment.keyRoot]);
  let roman = segment.isMinor ? MINOR_ROMANS[interval] : MAJOR_ROMANS[interval];
  roman = applyChordQualityToRoman(roman, parsed.qualityFamily, segment.isMinor, interval);

  let suffix = parsed.quality;
  suffix = suffix.replace(/^m(?!aj)/i, "");
  suffix = suffix.replace(/^maj/i, "maj");

  if (parsed.qualityFamily === "diminished") {
    roman += "°";
    suffix = suffix.replace(/^dim/i, "");
  } else if (parsed.qualityFamily === "half-diminished") {
    roman += "ø";
    suffix = suffix.replace(/^m7b5/i, "7");
  } else if (parsed.qualityFamily === "augmented") {
    roman += "+";
    suffix = suffix.replace(/^aug/i, "");
  }

  if (parsed.bass) {
    const bassInterval = mod12((parsed.bassPitchClass ?? parsed.pitchClass) - NOTE_TO_PITCH_CLASS[segment.keyRoot]);
    const bassRoman = segment.isMinor ? MINOR_ROMANS[bassInterval] : MAJOR_ROMANS[bassInterval];
    return `${roman}${suffix}/${bassRoman}`;
  }

  return `${roman}${suffix}`;
}

function applyChordQualityToRoman(
  roman: string,
  qualityFamily: ChordQualityFamily,
  isMinorKey: boolean,
  interval: number
): string {
  if (qualityFamily === "minor") {
    return roman.toLowerCase();
  }

  if (qualityFamily === "major" || qualityFamily === "dominant" || qualityFamily === "augmented") {
    return roman.replace(/[iv]+/g, (match) => match.toUpperCase());
  }

  if (qualityFamily === "diminished" || qualityFamily === "half-diminished") {
    return roman.toLowerCase();
  }

  if (qualityFamily === "suspended" || qualityFamily === "power") {
    if (!isMinorKey || interval === 0 || interval === 7) {
      return roman.replace(/[iv]+/g, (match) => match.toUpperCase());
    }
  }

  return roman;
}

function formatKeyLabel(rootPc: number, isMinor: boolean, sourceChord: string): string {
  const root = formatPitchClassName(rootPc, sourceChord);
  return `${root} ${isMinor ? "minor" : "major"}`;
}

function formatPitchClassName(pitchClass: number, sourceChord: string): string {
  const preferFlats = sourceChord.includes("b");
  return preferFlats ? FLAT_NAMES[pitchClass] : SHARP_NAMES[pitchClass];
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}
