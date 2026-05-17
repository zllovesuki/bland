import { FileText, Lock } from "lucide-react";
import type { KeyboardEventHandler, MouseEventHandler, ReactNode } from "react";

export type PageMentionPresentationKind = "accessible" | "pending" | "restricted";

export interface PageMentionPresentationProps {
  pageId?: string | null;
  label?: string | null;
  icon?: ReactNode;
  href?: string | null;
  kind?: PageMentionPresentationKind;
  ariaLabel?: string;
  onClick?: MouseEventHandler;
  onKeyDown?: KeyboardEventHandler;
  tabIndex?: number;
}

export function PageMentionContent({
  icon,
  label,
  restricted,
}: {
  icon?: ReactNode;
  label: string;
  restricted?: boolean;
}) {
  return (
    <>
      <span className="tiptap-page-mention-icon" aria-hidden="true">
        {icon ?? (restricted ? <Lock size={12} className="shrink-0" /> : <FileText size={12} />)}
      </span>
      <span className="tiptap-page-mention-label">{label}</span>
    </>
  );
}

export function PageMentionPresentation({
  pageId,
  label,
  icon,
  href,
  kind = "accessible",
  ariaLabel,
  onClick,
  onKeyDown,
  tabIndex,
}: PageMentionPresentationProps) {
  const resolvedKind = pageId ? kind : "restricted";
  const resolvedLabel = label?.trim() || (resolvedKind === "restricted" ? "Restricted" : "Untitled");
  const className = [
    "tiptap-page-mention",
    resolvedKind === "pending" ? "tiptap-page-mention--pending" : "",
    resolvedKind === "restricted" ? "tiptap-page-mention--restricted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const commonProps = {
    className,
    "data-page-id": pageId || undefined,
    "data-page-mention": "",
    "aria-label": ariaLabel,
    "aria-disabled": resolvedKind === "accessible" ? undefined : true,
    onClick,
    onKeyDown,
    tabIndex,
  };

  const content = <PageMentionContent icon={icon} label={resolvedLabel} restricted={resolvedKind === "restricted"} />;

  if (href && resolvedKind === "accessible") {
    return (
      <a {...commonProps} href={href}>
        {content}
      </a>
    );
  }

  return (
    <span {...commonProps} role={resolvedKind === "accessible" ? "link" : undefined}>
      {content}
    </span>
  );
}
