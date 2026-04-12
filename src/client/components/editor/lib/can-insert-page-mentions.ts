import type { Editor, Range } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";

interface CanInsertPageMentionsOpts {
  editable: boolean;
  workspaceId: string | undefined;
  shareToken: string | undefined;
}

export function canInsertPageMentions(opts: CanInsertPageMentionsOpts): boolean {
  return opts.editable && !!opts.workspaceId && !opts.shareToken;
}

export function canInsertPageMentionAtRange(editor: Editor, range?: Range): boolean {
  if (!editor.isEditable) return false;

  const pageMention = editor.schema.nodes.pageMention;
  if (!pageMention) return false;

  const from = range ? Math.min(range.from, range.to) : editor.state.selection.from;
  const to = range ? Math.max(range.from, range.to) : editor.state.selection.to;
  const tr = editor.state.tr;

  if (from !== to) {
    tr.deleteRange(from, to);
  }

  const insertPos = tr.mapping.map(from, -1);
  const $pos = tr.doc.resolve(insertPos);
  const mentionNode = pageMention.create({ pageId: "__page-mention-probe__" });
  const probe = Fragment.fromArray([mentionNode, editor.schema.text(" ")]);

  return $pos.parent.canReplace($pos.index(), $pos.index(), probe);
}
