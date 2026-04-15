import { emojis as tiptapEmojis, type EmojiItem } from "@tiptap/extension-emoji";
import { EMOJI_GROUP_OVERRIDES } from "./generated/emoji-group-overrides";
import { normalizeEmoji } from "./shared";

export interface PickerEmojiItem extends EmojiItem {
  rawEmoji?: string;
}

export const PICKER_GROUP_ORDER = [
  "smileys & emotion",
  "people & body",
  "animals & nature",
  "food & drink",
  "travel & places",
  "activities",
  "objects",
  "symbols",
  "flags",
] as const;

const emojiGroupOverrides = EMOJI_GROUP_OVERRIDES as Record<string, string>;

function createPickerEmojiItem(item: EmojiItem): PickerEmojiItem {
  if (!item.emoji) {
    return item;
  }

  const normalizedEmoji = normalizeEmoji(item.emoji);
  return {
    ...item,
    emoji: normalizedEmoji,
    rawEmoji: item.emoji,
    group: item.group || emojiGroupOverrides[normalizedEmoji] || "",
  };
}

function isPickerEmojiItem(item: PickerEmojiItem): item is PickerEmojiItem & { emoji: string; group: string } {
  return Boolean(item.emoji && item.group && item.group !== "components");
}

export const PICKER_EMOJI_ITEMS = tiptapEmojis.map(createPickerEmojiItem).filter(isPickerEmojiItem);
