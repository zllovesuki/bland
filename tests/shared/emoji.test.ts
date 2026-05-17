import { describe, expect, it } from "vitest";
import { buildEmojiAssetUrl, getEmojiAsset, getEmojiAssetUrl, normalizeEmoji } from "@/shared/emoji";

describe("shared emoji helpers", () => {
  it("strips Unicode variation selectors (FE0E / FE0F) so glyph keys match the asset map", () => {
    // Variation selector 16 normalizes to the bare base glyph.
    expect(normalizeEmoji("❤️")).toBe("❤");
    expect(normalizeEmoji("❤︎")).toBe("❤");
    expect(normalizeEmoji("❤")).toBe("❤");
  });

  it("builds the Apple CDN asset URL from a filename", () => {
    expect(buildEmojiAssetUrl("1f604.png")).toBe(
      "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f604.png",
    );
  });

  it("resolves common emoji glyphs to Apple asset filenames", () => {
    expect(getEmojiAsset("\u{1F604}")).toMatch(/^1f604\.png$/);
    expect(getEmojiAsset("\u{1F44D}")).toBeTruthy(); // thumbs up
  });

  it("resolves common emoji glyphs to absolute Apple CDN URLs", () => {
    const url = getEmojiAssetUrl("\u{1F604}");
    expect(url).toBe("https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f604.png");
  });

  it("returns null for non-emoji strings (the helper is glyph-based, not shortcode-based)", () => {
    expect(getEmojiAssetUrl("smile")).toBeNull();
    expect(getEmojiAssetUrl("")).toBeNull();
    expect(getEmojiAssetUrl("not an emoji")).toBeNull();
  });

  it("derives an asset filename for skin-tone-modified emoji from their code points", () => {
    // thumbs up + medium skin tone => combined code points hex-joined
    const url = getEmojiAssetUrl("\u{1F44D}\u{1F3FD}");
    expect(url).toMatch(/1f44d-1f3fd\.png$/);
  });
});
