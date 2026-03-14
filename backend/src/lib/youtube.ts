/**
 * YouTube URL validation and video-ID extraction.
 *
 * Accepts the common URL shapes:
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://youtu.be/VIDEO_ID
 *   - https://www.youtube.com/shorts/VIDEO_ID
 *   - https://youtube.com/embed/VIDEO_ID
 *   - https://m.youtube.com/watch?v=VIDEO_ID
 */

const YOUTUBE_REGEX =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})(?:[&?#].*)?$/;

export function extractYouTubeVideoId(url: string): string | null {
  const match = url.trim().match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}
