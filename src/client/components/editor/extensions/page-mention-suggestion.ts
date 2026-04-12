import { Extension, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { isChangeOrigin } from "@tiptap/extension-collaboration";
import { useWorkspaceStore, selectActivePages } from "@/client/stores/workspace-store";
import { filterPageMentionItems } from "../lib/open-page-mention-picker";
import { canInsertPageMentionAtRange } from "../lib/can-insert-page-mentions";
import { mountPageMentionPicker, type PageMentionPickerHandle } from "../controllers/page-mention-picker-overlay";
import type { PageMentionItem } from "../controllers/page-mention-picker-panel";

const pageMentionSuggestionKey = new PluginKey("pageMentionSuggestion");

interface PageMentionSuggestionOptions {
  currentPageId: string;
}

export const PageMentionSuggestion = Extension.create<PageMentionSuggestionOptions>({
  name: "pageMentionSuggestion",

  addOptions() {
    return { currentPageId: "" };
  },

  addProseMirrorPlugins() {
    const currentPageId = this.options.currentPageId;

    return [
      Suggestion<PageMentionItem, PageMentionItem>({
        pluginKey: pageMentionSuggestionKey,
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        allow: ({ editor, range }) => canInsertPageMentionAtRange(editor, range),
        shouldShow: ({ transaction }) => !isChangeOrigin(transaction),
        items: ({ query }) => {
          const state = useWorkspaceStore.getState();
          const pages = selectActivePages(state);
          return filterPageMentionItems(pages, query, currentPageId);
        },
        command: ({ editor, range, props: item }) => {
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
