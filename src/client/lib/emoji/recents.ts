import { STORAGE_KEYS } from "@/client/lib/constants";
import { readVersionedStorageJson, writeVersionedStorageJson } from "@/client/lib/storage";

const MAX_RECENTS = 16;
const EMOJI_RECENTS_VERSION = 1;

function parseEmojiList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, MAX_RECENTS);
}

export function readRecentEmojis(): string[] {
  return readVersionedStorageJson(STORAGE_KEYS.EMOJI_RECENTS, EMOJI_RECENTS_VERSION, parseEmojiList) ?? [];
}

export function writeRecentEmoji(emoji: string): string[] {
  if (!emoji) return readRecentEmojis();
  const previous = readRecentEmojis().filter((item) => item !== emoji);
  const next = [emoji, ...previous].slice(0, MAX_RECENTS);
  writeVersionedStorageJson(STORAGE_KEYS.EMOJI_RECENTS, EMOJI_RECENTS_VERSION, next);
  return next;
}
