import type { Editor } from "@tiptap/react";
import { ChevronRight, FileText } from "lucide-react";
import { jumpToHeading, useHeadingOutline } from "./lib/heading-outline";
import "./styles/outline.css";

interface EditorOutlineProps {
  editor: Editor | null | undefined;
  className?: string;
  title?: string;
}

export function EditorOutline({ editor, className, title = "On this page" }: EditorOutlineProps) {
  const headings = useHeadingOutline(editor);

  if (headings.length === 0) return null;

  return (
    <nav className={["tiptap-outline", className].filter(Boolean).join(" ")} aria-label={title}>
      <div className="tiptap-outline__header">
        <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span>{title}</span>
      </div>
      <ul className="tiptap-outline__list">
        {headings.map((heading) => (
          <li key={heading.id} className="tiptap-outline__item">
            <button
              type="button"
              className="tiptap-outline__button"
              data-active={heading.active ? "true" : "false"}
              aria-current={heading.active ? "location" : undefined}
              title={heading.text}
              onMouseDown={(event) => {
                event.preventDefault();
                if (!editor) return;
                jumpToHeading(editor, heading.pos);
              }}
              style={{ paddingInlineStart: `${Math.max(0, heading.level - 1) * 0.875}rem` }}
            >
              <ChevronRight className="tiptap-outline__chevron h-3 w-3 shrink-0" />
              <span className="tiptap-outline__text">{heading.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
