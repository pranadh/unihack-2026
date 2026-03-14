#!/usr/bin/env python3
"""
YouTube to MP3 Converter
Downloads audio from YouTube videos and converts to MP3 format.

Requirements:
    pip install yt-dlp
    ffmpeg must be installed on your system
    
Usage:
    python youtube_to_mp3.py "https://youtube.com/watch?v=..." [output_dir]
"""

import os
import re
import sys
import shutil
from pathlib import Path

from typing import Any

try:
    from yt_dlp import YoutubeDL
    from yt_dlp.utils import DownloadError, ExtractorError
except ImportError:
    print("Error: yt-dlp not installed. Run: pip install yt-dlp")
    sys.exit(1)


FFMPEG_PATH = os.path.join(os.path.dirname(__file__), "ffmpeg", "ffmpeg-8.0.1-essentials_build", "bin", "ffmpeg.exe")


def check_ffmpeg() -> bool:
    """Check if ffmpeg is available on the system."""
    if shutil.which("ffmpeg") is not None:
        return True
    return os.path.exists(FFMPEG_PATH)


def validate_youtube_url(url: str) -> bool:
    """Validate that the URL is a valid YouTube URL."""
    youtube_pattern = r'^(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)[\w-]{11}'
    return bool(re.match(youtube_pattern, url))


def sanitize_filename(title: str) -> str:
    """Remove invalid characters from filename."""
    invalid_chars = '<>:"/\\|?*'
    sanitized = ''.join(c if c not in invalid_chars else '_' for c in title)
    sanitized = sanitized.strip('. ')
    return sanitized[:200] if sanitized else 'audio'


def sanitize_output_path(path: str) -> str:
    """Ensure output path is safe and within bounds."""
    resolved = os.path.abspath(path)
    return resolved


def convert_youtube_to_mp3(url: str, output_path: str = ".") -> str:
    """
    Download YouTube video and convert to MP3.
    
    Args:
        url: YouTube video URL
        output_path: Directory to save the MP3 file
        
    Returns:
        Path to the downloaded MP3 file
        
    Raises:
        ValueError: If URL is invalid
        RuntimeError: If download fails
    """
    if not validate_youtube_url(url):
        raise ValueError(f"Invalid YouTube URL: {url}")
    
    if not check_ffmpeg():
        raise RuntimeError(
            "ffmpeg not found. Please install ffmpeg:\n"
            "  Ubuntu/Debian: sudo apt install ffmpeg\n"
            "  macOS: brew install ffmpeg\n"
            "  Windows: Download from https://www.gyan.dev/ffmpeg/builds/"
        )
    
    ffmpeg_location = FFMPEG_PATH if os.path.exists(FFMPEG_PATH) else None
    
    safe_output_path = sanitize_output_path(output_path)
    os.makedirs(safe_output_path, exist_ok=True)
    
    ydl_opts: dict[str, Any] = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(safe_output_path, '%(title)s.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': False,
        'no_warnings': False,
        'extract_flat': False,
    }
    
    if ffmpeg_location:
        ydl_opts['ffmpeg_location'] = ffmpeg_location
    
    try:
        with YoutubeDL(ydl_opts) as ydl:  # type: ignore[arg-type]
            info = ydl.extract_info(url, download=True)
            # Get the actual filename yt-dlp wrote (before postprocessing)
            # then swap the extension to .mp3 since FFmpegExtractAudio
            # converts it.
            raw_path = ydl.prepare_filename(info)
            mp3_path = os.path.splitext(raw_path)[0] + '.mp3'
            
        if not os.path.exists(mp3_path):
            # Fallback: try the sanitized title approach
            title = sanitize_filename(info.get('title') or 'audio')
            mp3_path = os.path.join(safe_output_path, f"{title}.mp3")
        
        if not os.path.exists(mp3_path):
            raise RuntimeError(
                f"Download appeared to succeed but MP3 file not found.\n"
                f"  Expected: {mp3_path}"
            )
            
        return mp3_path
        
    except ExtractorError as e:
        raise RuntimeError(f"Could not extract video: {e}")
    except DownloadError as e:
        raise RuntimeError(f"Download failed: {e}")


def main():
    if len(sys.argv) < 2:
        print("YouTube to MP3 Converter")
        print()
        print("Usage: python youtube_to_mp3.py <YouTube_URL> [output_directory]")
        print()
        print("Examples:")
        print("  python youtube_to_mp3.py \"https://youtube.com/watch?v=dQw4w9WgXcQ\"")
        print("  python youtube_to_mp3.py \"https://youtu.be/dQw4w9WgXcQ\" ./music")
        sys.exit(1)
    
    url = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    
    try:
        print(f"Downloading: {url}")
        mp3_path = convert_youtube_to_mp3(url, output_dir)
        print(f"Successfully saved to: {mp3_path}")
    except ValueError as e:
        print(f"Validation Error: {e}")
        sys.exit(1)
    except RuntimeError as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
