import { beforeEach, describe, expect, it } from "vitest";
import { emojis as tiptapEmojis } from "@tiptap/extension-emoji";
import { normalizeEmoji } from "@/client/lib/emoji";
import { getEmojiAssetUrl } from "@/client/lib/emoji/asset-lookup";
import { PICKER_EMOJI_ITEMS } from "@/client/lib/emoji/picker-data";
import { getEmojiSuggestionItems } from "@/client/components/editor/extensions/emoji";
import { readRecentEmojis, writeRecentEmoji } from "@/client/lib/emoji/recents";
import { STORAGE_KEYS } from "@/client/lib/constants";

describe("emoji helpers", () => {
  it("normalizes variation selectors while keeping the correct Apple asset mapping", () => {
    expect(normalizeEmoji("☺️")).toBe("☺");
    expect(getEmojiAssetUrl("☺️")).toBe(
      "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/263a-fe0f.png",
    );
  });

  it("resolves Apple assets for skin-tone variants", () => {
    expect(getEmojiAssetUrl("👍🏽")).toBe(
      "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f44d-1f3fd.png",
    );
    expect(getEmojiAssetUrl("🧔🏻‍♂️")).toBe(
      "https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f9d4-1f3fb-200d-2642-fe0f.png",
    );
  });

  it("keeps grouped native-fallback emojis eligible for the picker", () => {
    expect(PICKER_EMOJI_ITEMS.some((item) => item.emoji === "🧑‍🩰")).toBe(true);
    expect(PICKER_EMOJI_ITEMS.some((item) => item.emoji === "♀")).toBe(true);
  });

  it("keeps component glyphs out of the picker dataset", () => {
    expect(PICKER_EMOJI_ITEMS.some((item) => item.group === "components")).toBe(false);
  });
});

describe("emoji recents", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty when storage is unset", () => {
    expect(readRecentEmojis()).toEqual([]);
  });

  it("returns empty when storage holds malformed JSON", () => {
    localStorage.setItem(STORAGE_KEYS.EMOJI_RECENTS, "{not-json");
    expect(readRecentEmojis()).toEqual([]);
  });

  it("returns empty when storage holds a non-array", () => {
    localStorage.setItem(STORAGE_KEYS.EMOJI_RECENTS, JSON.stringify({ emoji: "👍" }));
    expect(readRecentEmojis()).toEqual([]);
  });

  it("filters out non-string entries", () => {
    localStorage.setItem(STORAGE_KEYS.EMOJI_RECENTS, JSON.stringify(["👍", 42, null, "🎉", ""]));
    expect(readRecentEmojis()).toEqual(["👍", "🎉"]);
  });

  it("prepends new picks and deduplicates earlier entries", () => {
    writeRecentEmoji("👍");
    writeRecentEmoji("🎉");
    writeRecentEmoji("👍");
    expect(readRecentEmojis()).toEqual(["👍", "🎉"]);
  });

  it("caps the stored list at 16 entries", () => {
    for (let i = 0; i < 20; i++) {
      writeRecentEmoji(`e${i}`);
    }
    const stored = readRecentEmojis();
    expect(stored).toHaveLength(16);
    expect(stored[0]).toBe("e19");
    expect(stored[15]).toBe("e4");
  });

  it("ignores empty-string writes", () => {
    writeRecentEmoji("👍");
    writeRecentEmoji("");
    expect(readRecentEmojis()).toEqual(["👍"]);
  });
});

describe("emoji suggestions", () => {
  it("returns the first eight base suggestions for an empty query", () => {
    const results = getEmojiSuggestionItems(tiptapEmojis, "");

    expect(results).toHaveLength(8);
    expect(results.every((item) => !!item.emoji || !!item.fallbackImage)).toBe(true);
  });

  it("finds base emoji matches by shortcode search", () => {
    const results = getEmojiSuggestionItems(tiptapEmojis, "thumb");

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((item) => item.shortcodes.includes("thumbsup"))).toBe(true);
  });
});
