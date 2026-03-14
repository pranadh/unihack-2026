#!/usr/bin/env python3
from __future__ import annotations

import os
import requests


def recognize_chords(audio_path: str, timeout_seconds: int = 600) -> dict:
    base = os.getenv("CHORDMINI_API_BASE_URL", "http://127.0.0.1:5001").rstrip("/")
    endpoint = f"{base}/api/recognize-chords"

    model = os.getenv("CHORDMINI_MODEL", "chord-cnn-lstm")
    mime_type = "audio/wav" if audio_path.endswith(".wav") else "audio/mpeg"
    filename = os.path.basename(audio_path)

    with open(audio_path, "rb") as audio_file:
        files = {"file": (filename, audio_file, mime_type)}
        data = {"model": model}
        response = requests.post(endpoint, files=files, data=data, timeout=timeout_seconds)
        response.raise_for_status()
        return response.json()
