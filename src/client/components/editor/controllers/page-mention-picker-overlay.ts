import type { Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import {
  PageMentionPickerPanel,
  type PageMentionItem,
  type PageMentionFilterMode,
  type PageMentionPickerPanelHandle,
  type PageMentionPickerPanelProps,
} from "./page-mention-picker-panel";

interface PageMentionPickerMountOpts {
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
  let destroyed = false;

  const component = new ReactRenderer<PageMentionPickerPanelHandle, PageMentionPickerPanelProps>(
    PageMentionPickerPanel,
    {
      props: {
        items: opts.items,
        filterMode: opts.filterMode,
        command: (item: PageMentionItem) => opts.command(item),
        clientRect: opts.clientRect,
        onCancel: opts.onCancel,
      },
      editor,
    },
  );
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
        ...(next.filterMode !== undefined && { filterMode: next.filterMode }),
        ...(next.command !== undefined && { command: (item: PageMentionItem) => next.command!(item) }),
        ...(next.clientRect !== undefined && { clientRect: next.clientRect }),
        ...(next.onCancel !== undefined && { onCancel: next.onCancel }),
      });
    },
    onKeyDown(event) {
      if (destroyed) return false;
      return component.ref?.onKeyDown(event) ?? false;
    },
    destroy,
  };
}
