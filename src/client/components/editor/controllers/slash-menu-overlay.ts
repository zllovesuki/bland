import type { Editor } from "@tiptap/core";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { mountEditorRenderer } from "./menu/renderer";
import { SlashMenuPanel, type SlashMenuPanelHandle, type SlashMenuPanelProps } from "./slash-menu-panel";
import type { SlashMenuItem } from "./slash-items";

interface SlashMenuOverlayOpts {
  contextElement?: HTMLElement | null;
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
  clientRect: (() => DOMRect | null) | null;
  onClose?: () => void;
}

export interface SlashMenuOverlayHandle {
  updateProps(opts: Partial<SlashMenuOverlayOpts>): void;
  onKeyDown(props: SuggestionKeyDownProps): boolean;
  destroy(): void;
}

export function mountSlashMenu(editor: Editor, opts: SlashMenuOverlayOpts): SlashMenuOverlayHandle {
  const component = mountEditorRenderer<SlashMenuPanelHandle, SlashMenuPanelProps>(editor, SlashMenuPanel, {
    items: opts.items,
    command: (item: SlashMenuItem) => opts.command(item),
    clientRect: opts.clientRect,
    contextElement: opts.contextElement ?? editor.view.dom,
    onClose: opts.onClose,
  });

  return {
    updateProps(next) {
      component.updateProps({
        ...(next.items !== undefined && { items: next.items }),
        ...(next.command !== undefined && { command: (item: SlashMenuItem) => next.command!(item) }),
        ...(next.clientRect !== undefined && { clientRect: next.clientRect }),
        ...(next.contextElement !== undefined && { contextElement: next.contextElement }),
        ...(next.onClose !== undefined && { onClose: next.onClose }),
      });
    },
    onKeyDown(props) {
      return component.ref?.onKeyDown(props) ?? false;
    },
    destroy() {
      component.destroy();
    },
  };
}
