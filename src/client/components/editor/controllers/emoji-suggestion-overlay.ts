import type { Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import type { EmojiItem } from "@tiptap/extension-emoji";
import {
  EmojiSuggestionPanel,
  type EmojiSuggestionPanelHandle,
  type EmojiSuggestionPanelProps,
} from "./emoji-suggestion-panel";

interface EmojiSuggestionOverlayOpts {
  items: EmojiItem[];
  command: (item: EmojiItem) => void;
  clientRect: (() => DOMRect | null) | null;
}

export interface EmojiSuggestionOverlayHandle {
  updateProps(next: Partial<EmojiSuggestionOverlayOpts>): void;
  onKeyDown(event: KeyboardEvent): boolean;
  destroy(): void;
}

export function mountEmojiSuggestion(editor: Editor, opts: EmojiSuggestionOverlayOpts): EmojiSuggestionOverlayHandle {
  let destroyed = false;

  const component = new ReactRenderer<EmojiSuggestionPanelHandle, EmojiSuggestionPanelProps>(EmojiSuggestionPanel, {
    props: {
      items: opts.items,
      command: (item: EmojiItem) => opts.command(item),
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
        ...(next.command !== undefined && { command: (item: EmojiItem) => next.command!(item) }),
        ...(next.clientRect !== undefined && { clientRect: next.clientRect }),
      });
    },
    onKeyDown(event) {
      if (destroyed) return false;
      return component.ref?.onKeyDown(event) ?? false;
    },
    destroy,
  };
}
