import type { Editor, Range } from "@tiptap/core";
import type { PageMentionCandidate } from "@/client/components/page-mention/types";
import { mountPageMentionPicker, type PageMentionPickerHandle } from "../../controllers/page-mention/picker-overlay";
import type { PageMentionItem } from "../../controllers/page-mention/picker-panel";
import "../../extensions/page-mention/commands";

const MAX_SUGGESTIONS = 20;

/** Filter pages by query for the [[ suggestion path. Also caps to MAX_SUGGESTIONS. */
export function filterPageMentionItems(candidates: PageMentionCandidate[], query: string): PageMentionItem[] {
  const q = query.trim().toLowerCase();
  const filtered: PageMentionItem[] = [];
  for (const candidate of candidates) {
    const title = candidate.title || "Untitled";
    if (q.length > 0 && !title.toLowerCase().includes(q)) continue;
    filtered.push({ pageId: candidate.pageId, title, icon: candidate.icon });
    if (filtered.length >= MAX_SUGGESTIONS) break;
  }
  return filtered;
}

/** Build the full unfiltered item list for the slash-launched picker. */
function collectAllVisibleItems(candidates: PageMentionCandidate[]): PageMentionItem[] {
  return candidates.map((candidate) => ({
    pageId: candidate.pageId,
    title: candidate.title || "Untitled",
    icon: candidate.icon,
  }));
}

interface OpenPickerOpts {
  range: Range;
  clientRect: (() => DOMRect | null) | null;
  candidates: PageMentionCandidate[];
}

function openPageMentionPicker(editor: Editor, opts: OpenPickerOpts): PageMentionPickerHandle {
  const items = collectAllVisibleItems(opts.candidates);

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
  candidates: PageMentionCandidate[];
}

export function launchPageMentionPicker(editor: Editor, opts: LaunchPickerOpts): PageMentionPickerHandle {
  editor.chain().focus(null, { scrollIntoView: false }).deleteRange(opts.range).run();
  const from = editor.state.selection.from;

  return openPageMentionPicker(editor, {
    range: { from, to: from },
    candidates: opts.candidates,
    clientRect: () => {
      const coords = editor.view.coordsAtPos(from);
      return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
    },
  });
}
