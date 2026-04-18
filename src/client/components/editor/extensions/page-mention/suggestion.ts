import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { isChangeOrigin } from "@tiptap/extension-collaboration";
import type { PageMentionCandidate } from "@/client/components/page-mention/types";
import { filterPageMentionItems } from "../../lib/page-mention/open-picker";
import { canInsertPageMentionAtRange } from "../../lib/page-mention/can-insert";
import { mountPageMentionPicker, type PageMentionPickerHandle } from "../../controllers/page-mention/picker-overlay";
import type { PageMentionItem } from "../../controllers/page-mention/picker-panel";

const pageMentionSuggestionKey = new PluginKey("pageMentionSuggestion");

interface PageMentionSuggestionOptions {
  getCurrentPageId: () => string;
  isAvailable: (editor: Editor) => boolean;
  getCandidates: () => PageMentionCandidate[];
}

export const PageMentionSuggestion = Extension.create<PageMentionSuggestionOptions>({
  name: "pageMentionSuggestion",

  addOptions() {
    return {
      getCurrentPageId: () => "",
      isAvailable: () => false,
      getCandidates: () => [],
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<PageMentionItem, PageMentionItem>({
        pluginKey: pageMentionSuggestionKey,
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        allow: ({ editor, range }) => this.options.isAvailable(editor) && canInsertPageMentionAtRange(editor, range),
        shouldShow: ({ editor, transaction }) => this.options.isAvailable(editor) && !isChangeOrigin(transaction),
        items: ({ query }) => {
          if (!this.options.isAvailable(this.editor)) return [];
          return filterPageMentionItems(this.options.getCandidates(), query);
        },
        command: ({ editor, range, props: item }) => {
          if (!this.options.isAvailable(editor)) return;
          editor.commands.insertPageMention({ pageId: item.pageId, range: range as Range });
        },
        render: () => {
          let handle: PageMentionPickerHandle | null = null;

          return {
            onStart: (props: SuggestionProps<PageMentionItem>) => {
              handle = mountPageMentionPicker(props.editor, {
                items: props.items,
                filterMode: "external",
                command: (item) => props.command(item),
                clientRect: props.clientRect ?? null,
              });
            },

            onUpdate: (props: SuggestionProps<PageMentionItem>) => {
              handle?.updateProps({
                items: props.items,
                filterMode: "external",
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
      }),
    ];
  },
});
