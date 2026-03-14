import requests
import os
import json
import tempfile
import subprocess
import shutil
import librosa
import numpy as np
import soundfile as sf


# ── Paths ────────────────────────────────────────────────────────────────────

# Repo root is two levels up from frontend/scripts/
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

FFMPEG_PATH = os.path.join(_REPO_ROOT, "ffmpeg",
    "ffmpeg-8.0.1-essentials_build", "bin", "ffmpeg.exe")

FFPROBE_PATH = os.path.join(_REPO_ROOT, "ffmpeg",
    "ffmpeg-8.0.1-essentials_build", "bin", "ffprobe.exe")


def _get_ffmpeg() -> str:
    """Return path to ffmpeg executable."""
    if os.path.exists(FFMPEG_PATH):
        return FFMPEG_PATH
    path = shutil.which("ffmpeg")
    if path:
        return path
    raise RuntimeError("ffmpeg not found")


def _get_ffprobe() -> str:
    """Return path to ffprobe executable."""
    if os.path.exists(FFPROBE_PATH):
        return FFPROBE_PATH
    path = shutil.which("ffprobe")
    if path:
        return path
    raise RuntimeError("ffprobe not found")


# ── Time Utilities ───────────────────────────────────────────────────────────

def parse_time(time_str: str) -> float:
    """
    Parse a time string into seconds.
    
    Accepted formats:
        '90'        -> 90.0
        '1:30'      -> 90.0
        '0:01:30'   -> 90.0
        '1:30.5'    -> 90.5
    """
    parts = time_str.strip().split(':')
    if len(parts) == 1:
        return float(parts[0])
    elif len(parts) == 2:
        return float(parts[0]) * 60 + float(parts[1])
    elif len(parts) == 3:
        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    raise ValueError(f"Invalid time format: {time_str}")


def format_time(seconds: float) -> str:
    """Format seconds as M:SS or H:MM:SS."""
    if seconds < 0:
        return "0:00"
    if seconds < 3600:
        m, s = divmod(int(seconds), 60)
        return f"{m}:{s:02d}"
    h, remainder = divmod(int(seconds), 3600)
    m, s = divmod(remainder, 60)
    return f"{h}:{m:02d}:{s:02d}"


# ── Audio Trimming ───────────────────────────────────────────────────────────

def get_audio_duration(file_path: str) -> float:
    """Get duration of an audio file in seconds using ffprobe."""
    ffprobe = _get_ffprobe()
    result = subprocess.run(
        [ffprobe, "-v", "quiet", "-print_format", "json",
         "-show_format", file_path],
        capture_output=True, text=True, encoding='utf-8', errors='replace'
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")
    info = json.loads(result.stdout)
    return float(info["format"]["duration"])


def trim_audio(input_path: str, output_path: str,
               start: float, end: float) -> str:
    """
    Trim an audio file using ffmpeg stream copy (no re-encode).
    
    Fast but may be off by up to ~26ms at boundaries due to MP3 frame
    alignment. Acceptable for chord detection.
    
    Returns output_path.
    """
    ffmpeg = _get_ffmpeg()
    duration = end - start
    cmd = [
        ffmpeg, "-y",
        "-ss", str(start),
        "-i", input_path,
        "-t", str(duration),
        "-c", "copy",
        output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg trim failed: {result.stderr}")
    return output_path


# ── Tuning Analysis ──────────────────────────────────────────────────────────

def estimate_tuning_offset(file_path: str, sr: int = 22050) -> dict:
    """
    Measure how far the audio's pitch is from A440 standard tuning.
    
    Uses librosa's chromagram-based tuning estimator which analyzes the
    distribution of pitch energy across frequency bins to determine the
    fractional-semitone deviation from concert pitch.
    
    Returns dict with:
        - offset: float in [-0.5, 0.5) semitones from A440
        - audio: the loaded audio array (reused to avoid double-loading)
        - sr: sample rate
        - duration: audio duration in seconds
        - needs_correction: whether the offset is large enough to matter
    """
    y, sr = librosa.load(file_path, sr=sr)
    duration = len(y) / sr

    # Don't trust tuning estimates on very short audio
    if duration < 2.0:
        return {
            "offset": 0.0,
            "audio": y,
            "sr": sr,
            "duration": duration,
            "needs_correction": False,
            "reason": "Audio too short for reliable tuning estimation"
        }

    tuning = librosa.estimate_tuning(y=y, sr=sr)

    # Threshold: if less than 0.10 semitones off, the chord model
    # won't misclassify (it can tolerate small deviations).
    # Above ~0.25 semitones, boundary chords start flipping.
    needs_correction = abs(tuning) >= 0.10

    return {
        "offset": float(tuning),
        "audio": y,
        "sr": sr,
        "duration": duration,
        "needs_correction": needs_correction,
    }


def pitch_correct_audio(y: np.ndarray, sr: int, tuning_offset: float) -> np.ndarray:
    """
    Shift the audio pitch by the inverse of the detected tuning offset
    to bring it back to A440 standard tuning.
    
    For example, if the audio is -0.37 semitones flat, this shifts it
    +0.37 semitones so the frequencies align with concert pitch.
    """
    return librosa.effects.pitch_shift(y, sr=sr, n_steps=-tuning_offset)


def per_segment_tuning(y: np.ndarray, sr: int, segment_seconds: float = 5.0) -> list:
    """
    Analyze tuning offset in segments across the audio.
    Useful for detecting if pitch drift varies over the song.
    """
    duration = len(y) / sr
    segments = []
    for start in np.arange(0, duration, segment_seconds):
        end = min(start + segment_seconds, duration)
        start_sample = int(start * sr)
        end_sample = int(end * sr)
        segment = y[start_sample:end_sample]
        if len(segment) >= sr:  # need at least 1 second
            seg_tuning = librosa.estimate_tuning(y=segment, sr=sr)
            segments.append({
                "start": round(float(start), 2),
                "end": round(float(end), 2),
                "offset": round(float(seg_tuning), 3),
            })
    return segments


# ── Chord Recognition ────────────────────────────────────────────────────────

API_URL = 'http://134.199.153.5:5001/api/recognize-chords'
API_MODEL = 'chord-cnn-lstm'
API_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                   'AppleWebKit/537.36 (KHTML, like Gecko) '
                   'Chrome/91.0.4472.124 Safari/537.36'
}


def _send_to_api(audio_path: str) -> dict:
    """
    Send a single audio file to the ChordMini API and return the raw response.
    Raises on HTTP errors.
    """
    mime_type = 'audio/wav' if audio_path.endswith('.wav') else 'audio/mpeg'
    filename = os.path.basename(audio_path)

    with open(audio_path, 'rb') as audio_file:
        files = {'file': (filename, audio_file, mime_type)}
        data = {'model': API_MODEL}
        response = requests.post(
            API_URL, headers=API_HEADERS, files=files, data=data, timeout=600
        )
        response.raise_for_status()
        return response.json()


def _write_temp_wav(y: np.ndarray, sr: int) -> str:
    """Write audio array to a temp WAV file. Caller must delete it."""
    fd, path = tempfile.mkstemp(suffix='.wav')
    os.close(fd)
    sf.write(path, y, sr)
    return path


def recognize_chords_public(file_path: str, auto_calibrate: bool = True) -> dict:
    """
    Recognize chords from an audio file using the ChordMini API.
    
    When auto_calibrate is True (default), the audio is first analyzed
    for tuning deviation from A440. If the deviation exceeds 0.10 semitones,
    the audio is pitch-corrected before being sent to the API so the chord
    recognition model receives properly-tuned input.
    """
    tuning_info = None
    temp_path = None

    try:
        # ── Step 1: Load audio & tuning analysis ─────────────────────────
        print(f"Loading: {file_path}...")
        y, sr = librosa.load(file_path, sr=22050)
        duration = len(y) / sr
        print(f"  Duration: {duration:.1f}s ({duration / 60:.1f} min)")

        if auto_calibrate:
            print(f"Analyzing tuning...")
            
            if duration < 2.0:
                print(f"  Audio too short for tuning estimation, skipping")
            else:
                tuning_offset = float(librosa.estimate_tuning(y=y, sr=sr))
                needs_correction = abs(tuning_offset) >= 0.10

                tuning_info = {
                    "offset_semitones": round(tuning_offset, 3),
                    "duration_seconds": round(duration, 2),
                    "needs_correction": needs_correction,
                }

                if needs_correction:
                    direction = "flat" if tuning_offset < 0 else "sharp"
                    print(f"  Tuning deviation: {tuning_offset:+.3f} semitones "
                          f"({direction} of A440)")
                    print(f"  Applying pitch correction of "
                          f"{-tuning_offset:+.3f} semitones...")

                    # Per-segment analysis for transparency (before correction)
                    tuning_info["segments"] = per_segment_tuning(y, sr)

                    y = pitch_correct_audio(y, sr, tuning_offset)

                    # Verify correction
                    verify = float(librosa.estimate_tuning(y=y, sr=sr))
                    tuning_info["corrected_offset"] = round(verify, 3)
                    print(f"  After correction: {verify:+.3f} semitones")
                else:
                    print(f"  Tuning deviation: {tuning_offset:+.3f} semitones "
                          f"(within tolerance, no correction needed)")

        # ── Step 2: Send to API ──────────────────────────────────────────
        print(f"\nSending to ChordMini API...")
        temp_path = _write_temp_wav(y, sr)
        print(f"  WAV size: {os.path.getsize(temp_path)} bytes")
        result = _send_to_api(temp_path)

        # ── Step 3: Attach metadata ──────────────────────────────────────
        if tuning_info:
            result['tuning_analysis'] = tuning_info

        return result

    except FileNotFoundError:
        return {"error": "File not found. Check the file path."}
    except requests.exceptions.HTTPError as http_err:
        return {"error": f"HTTP error occurred: {http_err}"}
    except Exception as err:
        return {"error": f"An unexpected error occurred: {err}"}
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass


# ── Display ──────────────────────────────────────────────────────────────────

def print_results(analysis: dict, time_offset: float = 0.0):
    """
    Print chord analysis results to stdout.
    
    time_offset: seconds to add to all timestamps so they reflect the
                 original video/audio position (e.g. the trim start time).
    """
    if "error" in analysis:
        print(f"\nFAILURE: {analysis['error']}")
        return

    print("\n" + "=" * 60)
    print("SUCCESS! Chord Progression:")
    print("=" * 60)

    # Tuning info
    if 'tuning_analysis' in analysis:
        ta = analysis['tuning_analysis']
        print(f"\nTuning Analysis:")
        print(f"  Raw offset:     {ta['offset_semitones']:+.3f} semitones from A440")
        print(f"  Correction:     {'Applied' if ta['needs_correction'] else 'Not needed'}")
        if 'corrected_offset' in ta:
            print(f"  After fix:      {ta['corrected_offset']:+.3f} semitones")
        if 'segments' in ta:
            print(f"\n  Per-segment tuning:")
            for seg in ta['segments']:
                seg_start = seg['start'] + time_offset
                seg_end = seg['end'] + time_offset
                print(f"    {format_time(seg_start):>7s} - {format_time(seg_end):>7s}: "
                      f"{seg['offset']:+.3f} semitones")

    # Chords
    chords = analysis.get('chords', [])
    print(f"\nDetected {len(chords)} chord segments:")
    print(f"  {'Start':>7s}  {'End':>7s}  {'Chord':<20s}")
    print(f"  {'-' * 7}  {'-' * 7}  {'-' * 20}")
    for c in chords:
        start = c.get('start', 0) + time_offset
        end = c.get('end', 0) + time_offset
        chord = c.get('chord', '?')
        print(f"  {format_time(start):>7s}  {format_time(end):>7s}  {chord}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    import sys
    from youtube_to_mp3 import convert_youtube_to_mp3, validate_youtube_url

    # ── Step 1: Get source (URL or file path) ────────────────────────────
    if len(sys.argv) > 1:
        source = sys.argv[1]
    else:
        source = input("Enter YouTube URL or local file path: ").strip()
        if not source:
            print("No input provided.")
            sys.exit(1)

    # ── Step 2: Download if YouTube URL ──────────────────────────────────
    if validate_youtube_url(source):
        try:
            print(f"\nDownloading from YouTube...")
            mp3_path = convert_youtube_to_mp3(source, ".")
            print(f"Downloaded: {mp3_path}")
        except (ValueError, RuntimeError) as e:
            print(f"\nDownload failed: {e}")
            sys.exit(1)
    else:
        mp3_path = source
        if not os.path.exists(mp3_path):
            print(f"File not found: {mp3_path}")
            sys.exit(1)

    # ── Step 3: Show duration and ask about trimming ─────────────────────
    try:
        duration = get_audio_duration(mp3_path)
    except RuntimeError as e:
        print(f"Could not read audio duration: {e}")
        sys.exit(1)

    print(f"\nSong duration: {format_time(duration)} ({duration:.1f}s)")

    # Check for --trim CLI args: chordtesting.py <source> --trim 0:30 2:00
    trim_start = None
    trim_end = None
    if "--trim" in sys.argv:
        trim_idx = sys.argv.index("--trim")
        try:
            trim_start = parse_time(sys.argv[trim_idx + 1])
            if trim_idx + 2 < len(sys.argv) and not sys.argv[trim_idx + 2].startswith("-"):
                trim_end = parse_time(sys.argv[trim_idx + 2])
            else:
                trim_end = duration
        except (IndexError, ValueError) as e:
            print(f"Invalid --trim argument: {e}")
            print(f"Usage: --trim START [END]  (e.g. --trim 0:30 2:00)")
            sys.exit(1)
    else:
        # Interactive prompt
        print(f"\nTrim options:")
        print(f"  Press Enter for full song")
        print(f"  Or enter: start end    (e.g. '0:30 2:00' or '30 120')")
        print(f"  Or enter: start        (trims from start to end of song)")

        trim_input = input("\nTrim [full song]: ").strip()

        if trim_input:
            try:
                parts = trim_input.split()
                trim_start = parse_time(parts[0])
                trim_end = parse_time(parts[1]) if len(parts) > 1 else duration
            except (ValueError, IndexError) as e:
                print(f"Invalid trim input: {e}")
                sys.exit(1)

    # ── Step 4: Trim if requested ────────────────────────────────────────
    audio_path = mp3_path

    if trim_start is not None and trim_end is not None:
        # Clamp to valid range
        trim_start = max(0.0, trim_start)
        trim_end = min(trim_end, duration)

        if trim_start >= trim_end:
            print(f"Invalid trim range: {format_time(trim_start)} - "
                  f"{format_time(trim_end)}")
            sys.exit(1)

        # Build trimmed filename next to the original
        base, ext = os.path.splitext(mp3_path)
        trimmed_path = f"{base}_trimmed{ext}"

        trim_len = trim_end - trim_start
        print(f"\nTrimming: {format_time(trim_start)} - {format_time(trim_end)} "
              f"({format_time(trim_len)})")
        trim_audio(mp3_path, trimmed_path, trim_start, trim_end)
        audio_path = trimmed_path
        print(f"Trimmed file saved: {audio_path}")

    # ── Step 5: Run chord analysis ───────────────────────────────────────
    # Pass trim_start as time_offset so displayed timestamps match the
    # original video/audio position, not the trimmed clip's 0:00.
    time_offset = trim_start if trim_start is not None else 0.0
    print()
    analysis = recognize_chords_public(audio_path)
    print_results(analysis, time_offset=time_offset)


if __name__ == "__main__":
    main()
