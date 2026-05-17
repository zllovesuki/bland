import { EMOJI_ICON_DATA } from "./generated/emoji-icon-data";
import { buildEmojiAssetUrl, normalizeEmoji } from "./shared";

const emojiIconData = EMOJI_ICON_DATA as Record<string, string>;
const SKIN_TONE_MODIFIER_RE = /[\u{1F3FB}-\u{1F3FF}]/u;

function deriveToneAsset(emoji: string): string | null {
  if (!SKIN_TONE_MODIFIER_RE.test(emoji)) {
    return null;
  }

  const codePoints: string[] = [];
  for (const glyph of emoji) {
    const codePoint = glyph.codePointAt(0);
    if (codePoint === undefined || codePoint === 0xfe0e) {
      continue;
    }
    codePoints.push(codePoint.toString(16));
  }
  return codePoints.length > 0 ? `${codePoints.join("-")}.png` : null;
}

export function getEmojiAsset(emoji: string): string | null {
  const normalizedEmoji = normalizeEmoji(emoji);
  if (normalizedEmoji === "") {
    return null;
  }
  return emojiIconData[normalizedEmoji] ?? deriveToneAsset(emoji);
}

export function getEmojiAssetUrl(emoji: string): string | null {
  const asset = getEmojiAsset(emoji);
  return asset ? buildEmojiAssetUrl(asset) : null;
}
