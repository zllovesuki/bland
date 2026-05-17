const APPLE_EMOJI_ASSET_BASE_URL = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64";
const VARIATION_SELECTOR_RE = /[\uFE0E\uFE0F]/gu;

export function normalizeEmoji(emoji: string): string {
  return emoji.replace(VARIATION_SELECTOR_RE, "");
}

export function buildEmojiAssetUrl(asset: string): string {
  return `${APPLE_EMOJI_ASSET_BASE_URL}/${asset}`;
}
