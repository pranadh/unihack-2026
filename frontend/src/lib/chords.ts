export const NOTE_TO_PITCH_CLASS: Record<string, number> = {
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

export type ChordQualityFamily =
  | "major"
  | "minor"
  | "dominant"
  | "diminished"
  | "half-diminished"
  | "augmented"
  | "suspended"
  | "power"
  | "other";

export interface ParsedChord {
  raw: string;
  normalized: string;
  root: string;
  bass: string | null;
  quality: string;
  pitchClass: number;
  bassPitchClass: number | null;
  qualityFamily: ChordQualityFamily;
}

export function normalizeChordName(raw: string): string {
  const name = raw.trim();
  if (!name || name === "N" || name === "NC" || name === "X") return "";

  if (name.includes(":")) {
    const [root, qualityRaw] = name.split(":", 2);
    const [quality, inversionRaw] = (qualityRaw ?? "").split("/", 2);
    const inversion = (inversionRaw ?? "").trim();
    const inversionIsNote = /^[A-G][#b]?$/.test(inversion);

    const withInversion = (base: string) =>
      inversionIsNote ? `${base}/${inversion}` : base;

    if (!quality || quality === "maj") return withInversion(root);
    if (quality === "min") return withInversion(`${root}m`);
    if (quality === "min7") return withInversion(`${root}m7`);
    if (quality === "maj7") return withInversion(`${root}maj7`);
    if (quality === "7") return withInversion(`${root}7`);
    if (quality === "sus2") return withInversion(`${root}sus2`);
    if (quality === "sus4") return withInversion(`${root}sus4`);
    if (quality === "dim") return withInversion(`${root}dim`);
    if (quality === "dim7") return withInversion(`${root}dim7`);
    if (quality === "aug") return withInversion(`${root}aug`);
    if (quality === "hdim7") return withInversion(`${root}m7b5`);
    if (quality === "minmaj7") return withInversion(`${root}m(maj7)`);
    if (quality === "9") return withInversion(`${root}9`);
    if (quality === "min9") return withInversion(`${root}m9`);
    if (quality === "maj9") return withInversion(`${root}maj9`);
    return withInversion(`${root}${quality}`);
  }

  let base = name;
  let inversion: string | null = null;
  if (name.includes("/")) {
    const [basePart, inversionPart] = name.split("/", 2);
    base = basePart;
    const trimmedInversion = inversionPart.trim();
    if (/^[A-G][#b]?$/.test(trimmedInversion)) {
      inversion = trimmedInversion;
    }
  }

  base = base.replace(/maj(?!7|9|11|13)$/i, "");
  base = base.replace(/min7/gi, "m7");
  base = base.replace(/min(?!7|9|11|13)/gi, "m");

  return inversion ? `${base}/${inversion}` : base;
}

export function parseChordName(raw: string): ParsedChord | null {
  const normalized = normalizeChordName(raw);
  if (!normalized) {
    return null;
  }

  const [base, bassRaw] = normalized.split("/", 2);
  const match = base.match(/^([A-G][#b]?)(.*)$/);
  if (!match) {
    return null;
  }

  const [, root, qualityRaw] = match;
  const pitchClass = NOTE_TO_PITCH_CLASS[root];
  if (pitchClass === undefined) {
    return null;
  }

  const quality = qualityRaw ?? "";
  const bass = bassRaw && /^[A-G][#b]?$/.test(bassRaw) ? bassRaw : null;
  const bassPitchClass = bass ? NOTE_TO_PITCH_CLASS[bass] ?? null : null;

  return {
    raw,
    normalized,
    root,
    bass,
    quality,
    pitchClass,
    bassPitchClass,
    qualityFamily: getChordQualityFamily(quality),
  };
}

function getChordQualityFamily(quality: string): ChordQualityFamily {
  if (!quality) return "major";

  const normalized = quality.toLowerCase();
  if (normalized === "5") return "power";
  if (normalized.includes("sus")) return "suspended";
  if (normalized.includes("aug") || normalized.includes("#5")) return "augmented";
  if (normalized === "m7b5" || normalized.includes("hdim")) return "half-diminished";
  if (normalized.includes("dim")) return "diminished";
  if (normalized.startsWith("maj")) return "major";
  if (normalized === "7" || /^[0-9]/.test(normalized)) return "dominant";
  if (normalized.startsWith("m")) return "minor";
  if (normalized.includes("add") || normalized.includes("6")) return "major";
  return "other";
}
