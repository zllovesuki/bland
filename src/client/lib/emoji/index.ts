import type * as AssetLookup from "./asset-lookup";

export { buildEmojiAssetUrl, normalizeEmoji } from "./shared";

let assetLookup: typeof AssetLookup | null = null;
let assetLookupPromise: Promise<typeof AssetLookup> | null = null;

// Synchronous fast-path: returns null until the asset map has been loaded at least once.
// Callers should treat null as "not resolved yet" and fall back to a unicode glyph.
export function getEmojiAssetUrlSync(emoji: string): string | null {
  return assetLookup ? assetLookup.getEmojiAssetUrl(emoji) : null;
}

// Lazy loader: dynamically imports the ~54KB emoji → asset-path map on first call,
// then resolves synchronously from the cached module on subsequent calls.
export async function loadEmojiAssetUrl(emoji: string): Promise<string | null> {
  if (assetLookup) return assetLookup.getEmojiAssetUrl(emoji);
  if (!assetLookupPromise) {
    assetLookupPromise = import("./asset-lookup").then((mod) => {
      assetLookup = mod;
      return mod;
    });
  }
  const mod = await assetLookupPromise;
  return mod.getEmojiAssetUrl(emoji);
}
