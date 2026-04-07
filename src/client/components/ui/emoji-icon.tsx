import { Emoji, EmojiStyle } from "emoji-picker-react";

/** Convert a native emoji string to its unified hex code (e.g. "🚀" → "1f680"). */
function toUnified(emoji: string): string {
  const codePoints: string[] = [];
  for (const char of emoji) {
    const cp = char.codePointAt(0);
    if (cp !== undefined) codePoints.push(cp.toString(16));
  }
  return codePoints.join("-");
}

interface EmojiIconProps {
  emoji: string;
  size?: number;
}

export function EmojiIcon({ emoji, size = 20 }: EmojiIconProps) {
  return <Emoji unified={toUnified(emoji)} size={size} emojiStyle={EmojiStyle.APPLE} />;
}
