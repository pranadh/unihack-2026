"""
Variable-tempo BPM detection and beat grid generation for chord quantization.

Usage:
    python detect_bpm.py <audio_file_path>

Outputs JSON to stdout:
    {
        "bpm": 120.0,
        "grid": [0.0, 0.25, 0.5, 0.75, 1.0, ...],
        "beat_count": 240,
        "grid_count": 480,
        "duration": 180.5,
        "variable_tempo": true
    }

Uses librosa's Predominant Local Pulse (PLP) estimator, which adapts to
tempo changes within a song.  PLP naturally detects sub-beat (≈8th-note)
pulses, so the grid already has sufficient density without manual
interpolation.  The grid is extended before the first and after the last
detected pulse to cover the full audio duration.
"""

import json
import sys

import librosa
import numpy as np


def detect_bpm_and_grid(audio_path: str) -> dict:
    """
    Load audio, detect variable-tempo beat positions via PLP, build a grid.

    PLP (Predominant Local Pulse) is preferred over beat_track() because:
      - It adapts to tempo changes within the song.
      - It naturally detects sub-beat pulses (~8th-note density).
      - It does not require a global tempo assumption.

    The grid is constructed by:
      1. Running PLP to get a pulse curve.
      2. Extracting local maxima as beat positions.
      3. Extending the grid before/after detected beats using
         the local median interval.

    Returns a dict with bpm, the grid array, and metadata.
    """
    # Load at 22050 Hz — librosa's default, optimal for beat tracking
    y, sr = librosa.load(audio_path, sr=22050)
    duration = float(len(y) / sr)

    if duration < 2.0:
        return {
            "bpm": 0,
            "grid": [],
            "beat_count": 0,
            "grid_count": 0,
            "duration": round(duration, 3),
            "variable_tempo": False,
            "error": "Audio too short for beat detection",
        }

    # ── PLP-based beat detection (variable-tempo aware) ──────────────────
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    pulse = librosa.beat.plp(y=y, sr=sr, onset_envelope=onset_env)

    # Local maxima of the pulse curve are beat positions
    beat_frame_indices = np.flatnonzero(librosa.util.localmax(pulse))
    beat_times: np.ndarray = librosa.frames_to_time(beat_frame_indices, sr=sr)

    # ── Estimate global BPM from per-frame tempo ─────────────────────────
    # Use aggregate=None for per-frame estimates, then take the median
    # as a representative global BPM for display purposes.
    per_frame_tempo = librosa.feature.tempo(
        onset_envelope=onset_env, sr=sr, aggregate=None
    )
    bpm = float(np.median(per_frame_tempo))

    # Check if tempo is truly variable (std > 5% of median)
    tempo_std = float(np.std(per_frame_tempo))
    variable_tempo = tempo_std > (bpm * 0.05)

    if len(beat_times) < 2:
        # Fallback: not enough beats detected — return what we have
        return {
            "bpm": round(bpm, 2),
            "grid": [round(float(t), 4) for t in beat_times],
            "beat_count": len(beat_times),
            "grid_count": len(beat_times),
            "duration": round(duration, 3),
            "variable_tempo": variable_tempo,
        }

    # ── Build grid from PLP beats ────────────────────────────────────────
    # PLP already detects sub-beat pulses (~8th-note density for most
    # music), so we use the beat positions directly as our grid.
    grid: list[float] = [float(t) for t in beat_times]

    # Compute the median interval for extending the grid at edges
    intervals = np.diff(beat_times)
    median_interval = float(np.median(intervals))

    # Prepend grid points before the first detected beat
    first = grid[0]
    prepend: list[float] = []
    t = first - median_interval
    while t >= 0:
        prepend.append(t)
        t -= median_interval
    grid = sorted(prepend) + grid

    # Append grid points after the last detected beat
    last = grid[-1]
    t = last + median_interval
    while t <= duration:
        grid.append(t)
        t += median_interval

    # Round to 4 decimal places for clean JSON
    grid = [round(g, 4) for g in grid]

    return {
        "bpm": round(bpm, 2),
        "grid": grid,
        "beat_count": int(len(beat_times)),
        "grid_count": len(grid),
        "duration": round(duration, 3),
        "variable_tempo": variable_tempo,
    }


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: detect_bpm.py <audio_file_path>"}))
        sys.exit(1)

    audio_path = sys.argv[1]

    try:
        result = detect_bpm_and_grid(audio_path)
        # Flush stdout so the Node.js parent process gets the output immediately
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
