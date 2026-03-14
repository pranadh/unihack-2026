#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile

import soundfile as sf

from audio_refine import detect_bpm, refine_audio
from chordmini_client import recognize_chords
from youtube_to_mp3 import convert_youtube_to_mp3


def normalize_chords(raw: dict) -> list[dict]:
    chords = raw.get("chords", [])
    if not isinstance(chords, list):
        raise RuntimeError("ChordMini response missing chords array")

    normalized: list[dict] = []
    for chord in chords:
        if not isinstance(chord, dict):
            continue

        start = chord.get("start")
        end = chord.get("end")
        label = chord.get("chord")

        if not isinstance(start, (int, float)):
            continue
        if not isinstance(end, (int, float)):
            continue
        if not isinstance(label, str) or not label.strip():
            continue
        if float(start) < 0 or float(end) < float(start):
            continue

        normalized.append(
            {
                "start": float(start),
                "end": float(end),
                "chord": label.strip(),
            }
        )

    return normalized


def main() -> int:
    parser = argparse.ArgumentParser(description="Backend Python audio pipeline")
    parser.add_argument("--request-id", required=True)
    parser.add_argument("--url", required=True)
    args = parser.parse_args()

    temp_dir = tempfile.mkdtemp(prefix=f"karachordy-{args.request_id}-")
    temp_wav = os.path.join(temp_dir, "refined.wav")

    try:
        mp3_path = convert_youtube_to_mp3(args.url, temp_dir)

        y, sr = refine_audio(mp3_path, auto_calibrate=True)
        bpm = detect_bpm(y, sr)
        sf.write(temp_wav, y, sr)

        raw = recognize_chords(temp_wav)
        chords = normalize_chords(raw)

        duration = raw.get("duration")
        if not isinstance(duration, (int, float)):
            duration = max((c["end"] for c in chords), default=0.0)

        payload = {
            "duration": float(duration),
            "bpm": float(bpm),
            "chords": chords,
        }
        print(json.dumps(payload), flush=True)
        return 0
    except Exception as error:
        print(
            json.dumps(
                {
                    "error": str(error),
                    "requestId": args.request_id,
                }
            ),
            file=sys.stderr,
            flush=True,
        )
        return 1
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
