export type Instrument = "guitar" | "piano";

export const DEFAULT_INSTRUMENT: Instrument = "guitar";
export const INSTRUMENT_STORAGE_KEY = "karachordy-instrument";

export function isInstrument(value: unknown): value is Instrument {
  return value === "guitar" || value === "piano";
}
