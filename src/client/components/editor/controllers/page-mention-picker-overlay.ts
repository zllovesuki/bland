import type { Editor } from "@tiptap/core";
import { mountEditorRenderer } from "./menu/renderer";
import {
  PageMentionPickerPanel,
  type PageMentionItem,
  type PageMentionFilterMode,
  type PageMentionPickerPanelHandle,
  type PageMentionPickerPanelProps,
} from "./page-mention-picker-panel";

interface PageMentionPickerMountOpts {
  contextElement?: HTMLElement | null;
  items: PageMentionItem[];
  filterMode: PageMentionFilterMode;
  command: (item: PageMentionItem) => void;
  clientRect: (() => DOMRect | null) | null;
  onCancel?: () => void;
}

export interface PageMentionPickerHandle {
  updateProps(next: Partial<PageMentionPickerMountOpts>): void;
  onKeyDown(event: KeyboardEvent): boolean;
  destroy(): void;
}

export function mountPageMentionPicker(editor: Editor, opts: PageMentionPickerMountOpts): PageMentionPickerHandle {
  const component = mountEditorRenderer<PageMentionPickerPanelHandle, PageMentionPickerPanelProps>(
    editor,
    PageMentionPickerPanel,
    {
      items: opts.items,
      filterMode: opts.filterMode,
      command: (item: PageMentionItem) => opts.command(item),
      clientRect: opts.clientRect,
      contextElement: opts.contextElement ?? editor.view.dom,
      onCancel: opts.onCancel,
    },
  );

  return {
    updateProps(next) {
      component.updateProps({
        ...(next.items !== undefined && { items: next.items }),
        ...(next.filterMode !== undefined && { filterMode: next.filterMode }),
        ...(next.command !== undefined && { command: (item: PageMentionItem) => next.command!(item) }),
        ...(next.clientRect !== undefined && { clientRect: next.clientRect }),
        ...(next.contextElement !== undefined && { contextElement: next.contextElement }),
        ...(next.onCancel !== undefined && { onCancel: next.onCancel }),
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
