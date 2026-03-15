export interface AccessedHistoryItem {
  requestId: string;
  youtubeUrl: string;
  videoId: string;
  title?: string;
  lastAccessedAt: string;
}

const HISTORY_STORAGE_KEY = "karachordy-access-history";
const MAX_HISTORY_ITEMS = 50;

function readStorage(): AccessedHistoryItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is AccessedHistoryItem => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const maybe = item as Partial<AccessedHistoryItem>;
      return (
        typeof maybe.requestId === "string" &&
        typeof maybe.youtubeUrl === "string" &&
        typeof maybe.videoId === "string" &&
        typeof maybe.lastAccessedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeStorage(items: AccessedHistoryItem[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
}

export function getAccessHistory(): AccessedHistoryItem[] {
  return readStorage().sort(
    (a, b) => Date.parse(b.lastAccessedAt) - Date.parse(a.lastAccessedAt)
  );
}

export function recordAccess(entry: {
  requestId: string;
  youtubeUrl: string;
  videoId: string;
  title?: string;
}): AccessedHistoryItem[] {
  const now = new Date().toISOString();
  const current = readStorage();

  const existingIndex = current.findIndex((item) => item.requestId === entry.requestId);
  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    current[existingIndex] = {
      ...existing,
      youtubeUrl: entry.youtubeUrl,
      videoId: entry.videoId,
      title: entry.title ?? existing.title,
      lastAccessedAt: now,
    };
  } else {
    current.push({
      requestId: entry.requestId,
      youtubeUrl: entry.youtubeUrl,
      videoId: entry.videoId,
      title: entry.title,
      lastAccessedAt: now,
    });
  }

  const next = current
    .sort((a, b) => Date.parse(b.lastAccessedAt) - Date.parse(a.lastAccessedAt))
    .slice(0, MAX_HISTORY_ITEMS);

  writeStorage(next);
  return next;
}

export function updateAccessTitle(requestId: string, title: string): AccessedHistoryItem[] {
  const current = readStorage();
  const index = current.findIndex((item) => item.requestId === requestId);
  if (index < 0) {
    return current;
  }

  current[index] = {
    ...current[index],
    title,
  };

  writeStorage(current);
  return current;
}
