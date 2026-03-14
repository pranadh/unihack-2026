#!/usr/bin/env python3
import os
import re
import shutil
import subprocess
import sys


def _has_command(command: str) -> bool:
    return shutil.which(command) is not None


def resolve_js_runtime(configured: str) -> str:
    runtime = configured.strip().lower()
    if runtime and runtime != "auto":
        return configured.strip()

    candidates = [
        ("node", "node"),
        ("deno", "deno"),
        ("bun", "bun"),
        ("quickjs", "qjs"),
    ]
    for runtime_name, binary in candidates:
        if _has_command(binary):
            return runtime_name

    return ""

def check_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def validate_youtube_url(url: str) -> bool:
    youtube_pattern = (
        r"^(https?://)?(www\.|m\.)?"
        r"(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)"
        r"[\w-]{11}"
    )
    return bool(re.match(youtube_pattern, url))


def convert_youtube_to_mp3(url: str, output_path: str) -> str:
    if not validate_youtube_url(url):
        raise ValueError(f"Invalid YouTube URL: {url}")

    if not check_ffmpeg():
        raise RuntimeError(
            "ffmpeg not found. Install ffmpeg on the VPS, for example: sudo apt install ffmpeg"
        )

    os.makedirs(output_path, exist_ok=True)
    output_template = os.path.join(output_path, "audio.%(ext)s")
    mp3_path = os.path.join(output_path, "audio.mp3")

    js_runtime_config = os.environ.get("YTDLP_JS_RUNTIMES", "auto")
    js_runtimes = resolve_js_runtime(js_runtime_config)
    remote_components = os.environ.get("YTDLP_REMOTE_COMPONENTS", "ejs:github").strip()
    cookies_file = (
        os.environ.get("YTDLP_COOKIES_FILE", "").strip()
        or os.environ.get("YOUTUBE_COOKIES_PATH", "").strip()
    )
    cookies_from_browser = os.environ.get("YTDLP_COOKIES_FROM_BROWSER", "").strip()

    if cookies_file and not os.path.isfile(cookies_file):
        raise RuntimeError(
            f"YTDLP_COOKIES_FILE points to a missing file: {cookies_file}"
        )

    if not js_runtimes:
        raise RuntimeError(
            "No supported JS runtime found on PATH for yt-dlp EJS (looked for "
            "node, deno, bun, qjs). Install Node.js on the VPS or set "
            "YTDLP_JS_RUNTIMES to an available runtime."
        )

    command = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "192K",
        "--no-playlist",
        "--no-overwrites",
        "--print-json",
        "-o",
        output_template,
    ]

    if js_runtimes:
        command.extend(["--js-runtimes", js_runtimes])

    if remote_components:
        command.extend(["--remote-components", remote_components])

    # Prefer explicit cookie file for server/headless execution.
    if cookies_file:
        command.extend(["--cookies", cookies_file])
    elif cookies_from_browser:
        command.extend(["--cookies-from-browser", cookies_from_browser])

    command.append(url)

    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=600,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError("yt-dlp timed out while downloading audio") from error
    except subprocess.CalledProcessError as error:
        stderr = (error.stderr or "").strip()
        if "Sign in to confirm you're not a bot" in stderr:
            raise RuntimeError(
                "YouTube blocked anonymous extraction. Configure YTDLP_COOKIES_FILE "
                "or YTDLP_COOKIES_FROM_BROWSER so yt-dlp can authenticate."
            ) from error
        if "No supported JavaScript runtime could be found" in stderr:
            raise RuntimeError(
                "yt-dlp could not find a supported JavaScript runtime. Install Node.js, "
                "Deno, Bun, or QuickJS, or set YTDLP_JS_RUNTIMES to a runtime available "
                "on PATH."
            ) from error

        raise RuntimeError(f"Download failed: {stderr or str(error)}") from error

    if not os.path.exists(mp3_path):
        stderr = (result.stderr or "").strip()
        raise RuntimeError(
            f"MP3 file not found after download: {mp3_path}. "
            f"Ensure ffmpeg is installed and available on PATH. stderr: {stderr}"
        )

    return mp3_path
