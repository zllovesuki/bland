import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";

export interface HeadingOutlineItem {
  id: string;
  text: string;
  level: number;
  pos: number;
  active: boolean;
}

export function getHeadingOutline(editor: Editor | null | undefined): HeadingOutlineItem[] {
  if (!editor) return [];

  const headings: Omit<HeadingOutlineItem, "active">[] = [];
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

  if (headings.length === 0) return [];

  const selectionPos = editor.state.selection.from;
  let activeIndex = -1;
  for (let i = 0; i < headings.length; i += 1) {
    if (headings[i].pos <= selectionPos) activeIndex = i;
    else break;
  }

  return headings.map((heading, index) => ({
    ...heading,
    active: index === activeIndex,
  }));
}

export function useHeadingOutline(editor: Editor | null | undefined): HeadingOutlineItem[] {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!editor) return;

    const bump = () => setRevision((value) => value + 1);

    editor.on("update", bump);
    editor.on("selectionUpdate", bump);

    return () => {
      editor.off("update", bump);
      editor.off("selectionUpdate", bump);
    };
  }, [editor]);

  return useMemo(() => getHeadingOutline(editor), [editor, revision]);
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
