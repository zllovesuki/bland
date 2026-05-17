import { ChevronRight, FileText } from "lucide-react";
import type { MouseEvent } from "react";
import type { OutlineItem } from "./outline-model";

export type OutlinePresentationMode = "button" | "link";
export type OutlinePresentationVariant = "card" | "rail";

export interface OutlinePresentationProps {
  items: OutlineItem[];
  activeId?: string | null;
  title?: string;
  mode: OutlinePresentationMode;
  variant?: OutlinePresentationVariant;
  onItemMouseDown?: (item: OutlineItem, event: MouseEvent<HTMLButtonElement>) => void;
}

export function OutlinePresentation({
  items,
  activeId,
  title = "On this page",
  mode,
  variant = "card",
  onItemMouseDown,
}: OutlinePresentationProps) {
  if (items.length === 0) return null;

  const className = ["tiptap-outline", variant === "rail" ? "tiptap-outline--rail" : ""].filter(Boolean).join(" ");

  return (
    <nav className={className} aria-label={title} data-outline="">
      <div className="tiptap-outline__header">
        <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span>{title}</span>
      </div>
      <ul className="tiptap-outline__list">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} className="tiptap-outline__item">
              {mode === "link" ? (
                <a
                  className="tiptap-outline__button tiptap-outline__link"
                  data-outline-id={item.id}
                  data-active={active ? "true" : "false"}
                  aria-current={active ? "location" : undefined}
                  title={item.text}
                  href={item.href ?? `#${item.id}`}
                  style={outlineItemStyle(item.level)}
                >
                  <ChevronRight className="tiptap-outline__chevron h-3 w-3 shrink-0" />
                  <span className="tiptap-outline__text">{item.text}</span>
                </a>
              ) : (
                <button
                  type="button"
                  className="tiptap-outline__button"
                  data-outline-id={item.id}
                  data-active={active ? "true" : "false"}
                  aria-current={active ? "location" : undefined}
                  title={item.text}
                  onMouseDown={(event) => onItemMouseDown?.(item, event)}
                  style={outlineItemStyle(item.level)}
                >
                  <ChevronRight className="tiptap-outline__chevron h-3 w-3 shrink-0" />
                  <span className="tiptap-outline__text">{item.text}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function outlineItemStyle(level: number) {
  return {
    // Keep the CSS padding (0.5rem) as the base so the chevron always has
    // breathing room from the highlight's left edge, even for top-level headings.
    paddingInlineStart: `calc(0.5rem + ${Math.max(0, level - 1) * 0.875}rem)`,
  };
}

export type { OutlineItem } from "./outline-model";
