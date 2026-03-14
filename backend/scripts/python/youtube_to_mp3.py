#!/usr/bin/env python3
import os
import re
import shutil

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError, ExtractorError


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

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(output_path, "%(title)s.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:  # type: ignore[arg-type]
            info = ydl.extract_info(url, download=True)
            raw_path = ydl.prepare_filename(info)
            mp3_path = os.path.splitext(raw_path)[0] + ".mp3"

        if not os.path.exists(mp3_path):
            raise RuntimeError(f"MP3 file not found after download: {mp3_path}")

        return mp3_path

    except ExtractorError as error:
        raise RuntimeError(f"Could not extract video: {error}") from error
    except DownloadError as error:
        raise RuntimeError(f"Download failed: {error}") from error
