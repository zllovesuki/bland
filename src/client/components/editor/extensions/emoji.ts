import type { Editor, Range } from "@tiptap/core";
import Emoji, { emojiToShortcode, type EmojiItem } from "@tiptap/extension-emoji";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { mountEmojiSuggestion, type EmojiSuggestionOverlayHandle } from "../controllers/emoji/suggestion-overlay";

const MAX_EMOJI_SUGGESTIONS = 8;

function getEmojiSearchTerms(item: EmojiItem): string[] {
  return [item.name, ...item.shortcodes, ...item.tags].map((term) => term.toLowerCase());
}

export function getEmojiSuggestionItems(emojis: EmojiItem[], query: string): EmojiItem[] {
  const q = query.trim().toLowerCase();

  if (q === "") {
    return emojis.filter((item) => !!item.emoji || !!item.fallbackImage).slice(0, MAX_EMOJI_SUGGESTIONS);
  }

  const startsWithMatches: EmojiItem[] = [];
  const includesMatches: EmojiItem[] = [];

  for (const item of emojis) {
    if (!item.emoji && !item.fallbackImage) continue;

    const terms = getEmojiSearchTerms(item);
    if (terms.some((term) => term.startsWith(q))) {
      startsWithMatches.push(item);
      continue;
    }
    if (terms.some((term) => term.includes(q))) {
      includesMatches.push(item);
    }
  }

  return [...startsWithMatches, ...includesMatches].slice(0, MAX_EMOJI_SUGGESTIONS);
}

export const EditorEmoji = Emoji.configure({
  HTMLAttributes: {
    class: "tiptap-emoji",
  },
  suggestion: {
    items: ({ editor, query }) => getEmojiSuggestionItems(editor.storage.emoji?.emojis ?? [], query),
    render: () => {
      let handle: EmojiSuggestionOverlayHandle | null = null;

      return {
        onStart: (props: SuggestionProps<EmojiItem>) => {
          handle = mountEmojiSuggestion(props.editor, {
            items: props.items,
            command: (item) => props.command(item),
            clientRect: props.clientRect ?? null,
          });
        },
        onUpdate: (props: SuggestionProps<EmojiItem>) => {
          handle?.updateProps({
            items: props.items,
            command: (item) => props.command(item),
            clientRect: props.clientRect ?? null,
          });
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === "Escape") {
            handle?.destroy();
            handle = null;
            return true;
          }
          return handle?.onKeyDown(props.event) ?? false;
        },
        onExit: () => {
          handle?.destroy();
          handle = null;
        },
      };
    },
  },
});

function canInsertEmojiNode(editor: Editor, range?: Range): boolean {
  const emojiNode = editor.schema.nodes.emoji;
  if (!emojiNode) return false;

  const pos = range?.from ?? editor.state.selection.from;
  const $from = editor.state.doc.resolve(pos);
  return !!$from.parent.type.contentMatch.matchType(emojiNode);
}

export function insertEmoji(editor: Editor, emoji: string, range?: Range): boolean {
  if (!editor.isEditable || !emoji) return false;

  const shortcode = emojiToShortcode(emoji, editor.storage.emoji?.emojis ?? []);
  const chain = editor.chain().focus(null, { scrollIntoView: false });
  if (range) chain.deleteRange(range);

  if (shortcode && canInsertEmojiNode(editor, range)) {
    return chain
      .insertContent([
        { type: "emoji", attrs: { name: shortcode } },
        { type: "text", text: " " },
      ])
      .run();
  }

  return chain.insertContent(`${emoji} `).run();
}
