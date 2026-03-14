#!/usr/bin/env python3
from __future__ import annotations

import numpy as np
import librosa


def pitch_correct_audio(y: np.ndarray, sr: int, tuning_offset: float) -> np.ndarray:
    return librosa.effects.pitch_shift(y, sr=sr, n_steps=-tuning_offset)


def refine_audio(input_path: str, auto_calibrate: bool = True) -> tuple[np.ndarray, int]:
    y, sr = librosa.load(input_path, sr=22050)

    if not auto_calibrate:
        return y, sr

    duration = len(y) / sr
    if duration < 2.0:
        return y, sr

    tuning_offset = float(librosa.estimate_tuning(y=y, sr=sr))
    if abs(tuning_offset) >= 0.10:
        y = pitch_correct_audio(y, sr, tuning_offset)

    return y, sr


def detect_bpm(y: np.ndarray, sr: int) -> float:
    duration = float(len(y) / sr)
    if duration < 2.0:
        return 0.0

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return round(float(np.asarray(tempo).flat[0]), 2)
