import { useTiptap, useTiptapState } from "@tiptap/react";
import { ChevronRight, FileText } from "lucide-react";
import {
  collectHeadings,
  jumpToHeading,
  resolveActiveBySelection,
  resolveSelectionHeading,
  type HeadingOutlineItem,
} from "./lib/heading-outline";
import { useViewportActiveHeading } from "./lib/use-viewport-active-heading";
import "./styles/outline.css";

interface EditorOutlineProps {
  className?: string;
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

export function EditorOutline({ className, title = "On this page" }: EditorOutlineProps) {
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
    <nav className={["tiptap-outline", className].filter(Boolean).join(" ")} aria-label={title}>
      <div className="tiptap-outline__header">
        <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span>{title}</span>
      </div>
      <ul className="tiptap-outline__list">
        {headings.map((heading) => {
          const active = heading.pos === activePos;
          return (
            <li key={heading.id} className="tiptap-outline__item">
              <button
                type="button"
                className="tiptap-outline__button"
                data-active={active ? "true" : "false"}
                aria-current={active ? "location" : undefined}
                title={heading.text}
                onMouseDown={(event) => {
                  event.preventDefault();
                  jumpToHeading(editor, heading.pos);
                }}
                style={{
                  // Keep the CSS padding (0.5rem) as the base so the chevron
                  // always has breathing room from the highlight's left edge,
                  // even for top-level headings (where the indent addition
                  // would otherwise be 0).
                  paddingInlineStart: `calc(0.5rem + ${Math.max(0, heading.level - 1) * 0.875}rem)`,
                }}
              >
                <ChevronRight className="tiptap-outline__chevron h-3 w-3 shrink-0" />
                <span className="tiptap-outline__text">{heading.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
