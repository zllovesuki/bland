import { STORAGE_KEYS } from "@/client/lib/constants";

const MAX_RECENTS = 16;

export function readRecentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EMOJI_RECENTS);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function writeRecentEmoji(emoji: string): string[] {
  if (!emoji) return readRecentEmojis();
  const previous = readRecentEmojis().filter((item) => item !== emoji);
  const next = [emoji, ...previous].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(STORAGE_KEYS.EMOJI_RECENTS, JSON.stringify(next));
  } catch {
    // ignore quota or serialization errors
  }
  return next;
}
