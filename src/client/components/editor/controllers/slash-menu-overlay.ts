import type { Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { SlashMenuPanel, type SlashMenuPanelHandle, type SlashMenuPanelProps } from "./slash-menu-panel";
import type { SlashMenuItem } from "./slash-items";

interface SlashMenuOverlayOpts {
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
  clientRect: (() => DOMRect | null) | null;
}

export interface SlashMenuOverlayHandle {
  updateProps(opts: Partial<SlashMenuOverlayOpts>): void;
  onKeyDown(props: SuggestionKeyDownProps): boolean;
  destroy(): void;
}

export function mountSlashMenu(editor: Editor, opts: SlashMenuOverlayOpts): SlashMenuOverlayHandle {
  let destroyed = false;

  const component = new ReactRenderer<SlashMenuPanelHandle, SlashMenuPanelProps>(SlashMenuPanel, {
    props: {
      items: opts.items,
      command: (item: SlashMenuItem) => opts.command(item),
      clientRect: opts.clientRect,
    },
    editor,
  });
  document.body.appendChild(component.element);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    editor.off("destroy", destroy);
    component.destroy();
    component.element.remove();
  }

  editor.on("destroy", destroy);

  return {
    updateProps(next) {
      if (destroyed) return;
      component.updateProps({
        ...(next.items !== undefined && { items: next.items }),
        ...(next.command !== undefined && { command: (item: SlashMenuItem) => next.command!(item) }),
        ...(next.clientRect !== undefined && { clientRect: next.clientRect }),
      });
    },
    onKeyDown(props) {
      if (destroyed) return false;
      return component.ref?.onKeyDown(props) ?? false;
    },
    destroy,
  };
}
