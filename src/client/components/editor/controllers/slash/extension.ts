import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { isChangeOrigin } from "@tiptap/extension-collaboration";
import { filterItems, type SlashMenuItem } from "./items";
import { mountSlashMenu, type SlashMenuOverlayHandle } from "./overlay";

interface SlashCommandsOptions {
  getItems: () => SlashMenuItem[];
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return {
      getItems: () => [],
    };
  },

  addProseMirrorPlugins() {
    const getItems = this.options.getItems;

    return [
      Suggestion<SlashMenuItem, SlashMenuItem>({
        editor: this.editor,
        char: "/",
        shouldShow: ({ transaction }) => !isChangeOrigin(transaction),
        items: ({ query, editor }) => filterItems(getItems(), query, { editor }),
        command: ({ editor, range, props: item }) => {
          item.command({ editor, range });
        },
        render: () => {
          let handle: SlashMenuOverlayHandle | null = null;

          return {
            onStart: (props: SuggestionProps<SlashMenuItem>) => {
              handle = mountSlashMenu(props.editor, {
                items: props.items,
                command: (item) => props.command(item),
                clientRect: props.clientRect ?? null,
              });
            },

            onUpdate: (props: SuggestionProps<SlashMenuItem>) => {
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
              return handle?.onKeyDown(props) ?? false;
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
