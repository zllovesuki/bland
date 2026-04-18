import type { Editor } from "@tiptap/react";

export interface HeadingOutlineItem {
  id: string;
  text: string;
  level: number;
  pos: number;
}

export function collectHeadings(editor: Editor | null | undefined): HeadingOutlineItem[] {
  if (!editor) return [];

  const headings: HeadingOutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;

    const text = node.textContent.replace(/\s+/g, " ").trim();
    if (!text) return;

    headings.push({
      id: `${pos}`,
      text,
      level: Number(node.attrs.level) || 1,
      pos,
    });
  });

  return headings;
}

export function resolveActiveBySelection(headings: HeadingOutlineItem[], selectionPos: number): number | null {
  let active: number | null = null;
  for (const heading of headings) {
    if (heading.pos <= selectionPos) active = heading.pos;
    else break;
  }
  return active;
}

export function resolveSelectionHeading(editor: Editor | null | undefined): number | null {
  if (!editor) return null;
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === "heading") {
      return $from.before(depth);
    }
  }
  return null;
}

export function jumpToHeading(editor: Editor, pos: number) {
  const targetPos = pos + 1;

  if (editor.isEditable) {
    editor.chain().focus(null, { scrollIntoView: false }).setTextSelection(targetPos).run();
  } else {
    editor.commands.setTextSelection(targetPos);
  }

  const node = editor.view.nodeDOM(pos);
  if (node instanceof Element) {
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }

  editor.commands.scrollIntoView();
}
