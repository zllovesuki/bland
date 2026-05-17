import { useTiptap, useTiptapState } from "@tiptap/react";
import { OutlinePresentation, type OutlinePresentationVariant } from "@/shared/editor/components/outline";
import {
  collectHeadings,
  jumpToHeading,
  resolveActiveBySelection,
  resolveSelectionHeading,
  type HeadingOutlineItem,
} from "./lib/heading-outline";
import { useViewportActiveHeading } from "./lib/use-viewport-active-heading";
import "@/styles/editor/outline.css";

interface EditorOutlineProps {
  variant?: OutlinePresentationVariant;
  title?: string;
}

function headingsEqual(a: HeadingOutlineItem[], b: HeadingOutlineItem[] | null) {
  if (!b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].pos !== b[i].pos || a[i].level !== b[i].level || a[i].text !== b[i].text) {
      return false;
    }
  }
  return true;
}

export function EditorOutline({ variant = "card", title = "On this page" }: EditorOutlineProps) {
  const { editor } = useTiptap();
  const headings = useTiptapState(({ editor: currentEditor }) => collectHeadings(currentEditor), headingsEqual);
  const selectionPos = useTiptapState(({ editor: currentEditor }) => currentEditor?.state.selection.from ?? 0);
  const cursorHeading = useTiptapState(({ editor: currentEditor }) => resolveSelectionHeading(currentEditor));
  const isFocused = useTiptapState(({ editor: currentEditor }) => currentEditor?.isFocused ?? false);
  const viewportActive = useViewportActiveHeading(editor, headings);

  if (!editor || headings.length === 0) return null;

  // Cursor-based signals apply only while the editor owns focus; otherwise
  // ProseMirror selection is stale and viewport alone determines the active heading.
  // While focused, selection wins over viewport visibility because it reflects
  // the user's current editing intent even when another section is on screen.
  const selectionFallback = resolveActiveBySelection(headings, selectionPos);
  const activePos = isFocused ? (cursorHeading ?? selectionFallback ?? viewportActive) : viewportActive;

  return (
    <OutlinePresentation
      items={headings}
      activeId={activePos === null ? null : `${activePos}`}
      mode="button"
      variant={variant}
      title={title}
      onItemMouseDown={(item, event) => {
        event.preventDefault();
        const pos = Number.parseInt(item.id, 10);
        if (Number.isFinite(pos)) jumpToHeading(editor, pos);
      }}
    />
  );
}
