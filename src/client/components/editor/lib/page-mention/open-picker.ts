import type { Editor, Range } from "@tiptap/core";
import { useWorkspaceStore, selectActivePages } from "@/client/stores/workspace-store";
import type { Page } from "@/shared/types";
import { mountPageMentionPicker, type PageMentionPickerHandle } from "../../controllers/page-mention/picker-overlay";
import type { PageMentionItem } from "../../controllers/page-mention/picker-panel";

const MAX_SUGGESTIONS = 20;

/** Filter pages by query for the [[ suggestion path. Also caps to MAX_SUGGESTIONS. */
export function filterPageMentionItems(
  pages: Page[],
  query: string,
  excludePageId: string | undefined,
): PageMentionItem[] {
  const q = query.trim().toLowerCase();
  const filtered: PageMentionItem[] = [];
  for (const page of pages) {
    if (page.id === excludePageId) continue;
    if (page.archived_at) continue;
    const title = page.title || "Untitled";
    if (q.length > 0 && !title.toLowerCase().includes(q)) continue;
    filtered.push({ pageId: page.id, title, icon: page.icon });
    if (filtered.length >= MAX_SUGGESTIONS) break;
  }
  return filtered;
}

/** Build the full unfiltered item list for the slash-launched picker. */
function collectAllVisibleItems(pages: Page[], excludePageId: string | undefined): PageMentionItem[] {
  const items: PageMentionItem[] = [];
  for (const page of pages) {
    if (page.id === excludePageId) continue;
    if (page.archived_at) continue;
    items.push({ pageId: page.id, title: page.title || "Untitled", icon: page.icon });
  }
  return items;
}

interface OpenPickerOpts {
  range: Range;
  clientRect: (() => DOMRect | null) | null;
  currentPageId: string;
}

export function openPageMentionPicker(editor: Editor, opts: OpenPickerOpts): PageMentionPickerHandle {
  const state = useWorkspaceStore.getState();
  const pages = selectActivePages(state);
  const items = collectAllVisibleItems(pages, opts.currentPageId);

  let handle: PageMentionPickerHandle | null = null;

  function cleanup() {
    editor.off("destroy", cleanup);
    handle?.destroy();
    handle = null;
  }

  const command = (item: PageMentionItem) => {
    editor.commands.insertPageMention({ pageId: item.pageId, range: opts.range });
    cleanup();
  };

  handle = mountPageMentionPicker(editor, {
    items,
    filterMode: "internal",
    command,
    clientRect: opts.clientRect,
    contextElement: editor.view.dom,
    onCancel: cleanup,
  });

  editor.on("destroy", cleanup);

  return {
    updateProps: (next) => handle?.updateProps(next),
    onKeyDown: (e) => handle?.onKeyDown(e) ?? false,
    destroy: cleanup,
  };
}

interface LaunchPickerOpts {
  range: Range;
  currentPageId: string;
}

export function launchPageMentionPicker(editor: Editor, opts: LaunchPickerOpts): PageMentionPickerHandle {
  editor.chain().focus(null, { scrollIntoView: false }).deleteRange(opts.range).run();
  const from = editor.state.selection.from;

  return openPageMentionPicker(editor, {
    range: { from, to: from },
    currentPageId: opts.currentPageId,
    clientRect: () => {
      const coords = editor.view.coordsAtPos(from);
      return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
    },
  });
}
