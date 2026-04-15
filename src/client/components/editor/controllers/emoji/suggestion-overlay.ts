import type { Editor } from "@tiptap/core";
import type { EmojiItem } from "@tiptap/extension-emoji";
import { mountEditorRenderer } from "../menu/renderer";
import {
  EmojiSuggestionPanel,
  type EmojiSuggestionPanelHandle,
  type EmojiSuggestionPanelProps,
} from "./suggestion-panel";

interface EmojiSuggestionOverlayOpts {
  contextElement?: HTMLElement | null;
  items: EmojiItem[];
  command: (item: EmojiItem) => void;
  clientRect: (() => DOMRect | null) | null;
  onClose?: () => void;
}

export interface EmojiSuggestionOverlayHandle {
  updateProps(next: Partial<EmojiSuggestionOverlayOpts>): void;
  onKeyDown(event: KeyboardEvent): boolean;
  destroy(): void;
}

export function mountEmojiSuggestion(editor: Editor, opts: EmojiSuggestionOverlayOpts): EmojiSuggestionOverlayHandle {
  const component = mountEditorRenderer<EmojiSuggestionPanelHandle, EmojiSuggestionPanelProps>(
    editor,
    EmojiSuggestionPanel,
    {
      items: opts.items,
      command: (item: EmojiItem) => opts.command(item),
      clientRect: opts.clientRect,
      contextElement: opts.contextElement ?? editor.view.dom,
      onClose: opts.onClose,
    },
  );

  return {
    updateProps(next) {
      component.updateProps({
        ...(next.items !== undefined && { items: next.items }),
        ...(next.command !== undefined && { command: (item: EmojiItem) => next.command!(item) }),
        ...(next.clientRect !== undefined && { clientRect: next.clientRect }),
        ...(next.contextElement !== undefined && { contextElement: next.contextElement }),
        ...(next.onClose !== undefined && { onClose: next.onClose }),
      });
    },
    onKeyDown(event) {
      return component.ref?.onKeyDown(event) ?? false;
    },
    destroy() {
      component.destroy();
    },
  };
}
