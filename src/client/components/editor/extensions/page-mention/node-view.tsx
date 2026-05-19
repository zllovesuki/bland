import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { Loader2 } from "lucide-react";
import { PageMentionContent } from "@/shared/editor/presentation/page-mention";
import { getPageMentionViewState } from "../../lib/page-mention/view-state";
import { usePageMentionEntry, usePageMentionNavigate } from "@/client/components/page-mention/context";

export function PageMentionView({ node }: NodeViewProps) {
  const pageId = node.attrs.pageId as string | null;
  const entry = usePageMentionEntry(pageId);
  const navigate = usePageMentionNavigate();

  if (!pageId) {
    return (
      <NodeViewWrapper
        as="span"
        className="tiptap-page-mention tiptap-page-mention--restricted"
        aria-disabled="true"
        contentEditable={false}
      >
        <PageMentionContent label="Restricted" restricted />
      </NodeViewWrapper>
    );
  }

  const viewState = getPageMentionViewState(entry);
  const canNavigate = viewState.kind === "accessible";

  const handleClick = (e: React.MouseEvent) => {
    if (viewState.kind !== "accessible") return;
    e.preventDefault();
    navigate(pageId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (viewState.kind !== "accessible") return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(pageId);
    }
  };

  if (viewState.kind === "restricted") {
    return (
      <NodeViewWrapper
        as="span"
        className="tiptap-page-mention tiptap-page-mention--restricted"
        aria-disabled="true"
        data-page-id={pageId}
        contentEditable={false}
      >
        <PageMentionContent label={viewState.label} restricted />
      </NodeViewWrapper>
    );
  }

  if (viewState.kind === "pending") {
    return (
      <NodeViewWrapper
        as="span"
        className="tiptap-page-mention tiptap-page-mention--pending"
        data-page-id={pageId}
        aria-busy="true"
        aria-label={viewState.ariaLabel}
        contentEditable={false}
      >
        <PageMentionContent icon={<Loader2 size={12} className="animate-spin" />} label={viewState.label} />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      className="tiptap-page-mention"
      data-page-id={pageId}
      role={canNavigate ? "link" : undefined}
      tabIndex={canNavigate ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={viewState.ariaLabel}
      aria-disabled={canNavigate ? undefined : "true"}
      contentEditable={false}
    >
      <PageMentionContent icon={viewState.icon} label={viewState.label} />
    </NodeViewWrapper>
  );
}
