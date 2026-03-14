"""
BPM detection and 8th-note grid generation for chord quantization.

Usage:
    python detect_bpm.py <audio_file_path>

Outputs JSON to stdout:
    {
        "bpm": 120.0,
        "grid": [0.0, 0.25, 0.5, 0.75, 1.0, ...],
        "beat_count": 240,
        "grid_count": 480,
        "duration": 180.5
    }

The "grid" array contains all 8th-note positions (every half-beat)
derived from librosa's beat tracker.  The Node.js API route uses this
grid to snap ChordMini chord start/end times to musically meaningful
positions so they align with actual beats in the song.
"""

import json
import sys

import librosa
import numpy as np


def detect_bpm_and_grid(audio_path: str) -> dict:
    """
    Load audio, detect tempo and beat positions, build an 8th-note grid.

    The grid is constructed by:
      1. Running librosa's beat tracker to get quarter-note beat times.
      2. Interpolating a midpoint between each pair of consecutive beats
         to produce 8th-note subdivisions.
      3. Extending the grid before the first beat and after the last beat
         using the median inter-beat interval so the grid covers the full
         audio duration.

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
            "error": "Audio too short for beat detection",
        }

    # Detect tempo (BPM) and beat frame indices
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.asarray(tempo).flat[0])

    # Convert frame indices to time in seconds
    beat_times: np.ndarray = librosa.frames_to_time(beat_frames, sr=sr)

    if len(beat_times) < 2:
        return {
            "bpm": round(bpm, 2),
            "grid": [round(float(t), 4) for t in beat_times],
            "beat_count": len(beat_times),
            "grid_count": len(beat_times),
            "duration": round(duration, 3),
        }

    # ── Build 8th-note grid ──────────────────────────────────────────────
    grid: list[float] = []
    for i in range(len(beat_times)):
        grid.append(float(beat_times[i]))
        if i + 1 < len(beat_times):
            midpoint = (float(beat_times[i]) + float(beat_times[i + 1])) / 2.0
            grid.append(midpoint)

    # Median half-beat interval for extending the grid
    avg_interval = float(np.median(np.diff(beat_times)))
    half_interval = avg_interval / 2.0

    # Prepend grid points before the first detected beat
    first = grid[0]
    prepend: list[float] = []
    t = first - half_interval
    while t >= 0:
        prepend.append(t)
        t -= half_interval
    grid = sorted(prepend) + grid

    # Append grid points after the last detected beat
    last = grid[-1]
    t = last + half_interval
    while t <= duration:
        grid.append(t)
        t += half_interval

    # Round to 4 decimal places for clean JSON
    grid = [round(g, 4) for g in grid]

    return {
        "bpm": round(bpm, 2),
        "grid": grid,
        "beat_count": int(len(beat_times)),
        "grid_count": len(grid),
        "duration": round(duration, 3),
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
