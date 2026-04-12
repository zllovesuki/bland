import { describe, expect, it } from "vitest";
import type { EmojiItem } from "@tiptap/extension-emoji";
import { getEmojiSuggestionItems } from "@/client/components/editor/extensions/emoji";

const EMOJIS: EmojiItem[] = [
  { name: "smile", emoji: "😄", shortcodes: ["smile"], tags: ["happy"] },
  { name: "smiley_cat", emoji: "😺", shortcodes: ["smiley_cat"], tags: ["cat", "happy"] },
  { name: "fire", emoji: "🔥", shortcodes: ["fire"], tags: ["lit", "hot"] },
  { name: "rocket", emoji: "🚀", shortcodes: ["rocket"], tags: ["ship", "launch"] },
];

describe("emoji suggestions", () => {
  it("prefers shortcode prefix matches", () => {
    expect(getEmojiSuggestionItems(EMOJIS, "sm").map((item) => item.name)).toEqual(["smile", "smiley_cat"]);
  });

  it("matches emoji tags when shortcodes do not match", () => {
    expect(getEmojiSuggestionItems(EMOJIS, "launch").map((item) => item.name)).toEqual(["rocket"]);
  });

  it("returns a bounded default list for an empty query", () => {
    expect(getEmojiSuggestionItems(EMOJIS, "").map((item) => item.name)).toEqual([
      "smile",
      "smiley_cat",
      "fire",
      "rocket",
    ]);
  });
});
