import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { FileText, Loader2, Lock } from "lucide-react";
import { usePageMentionEntry, usePageMentionNavigate, usePageMentionResolver } from "../../page-mention/context";
import { getPageMentionViewState } from "../../lib/page-mention/view-state";

export function PageMentionView({ node }: NodeViewProps) {
  const pageId = node.attrs.pageId as string | null;
  const entry = usePageMentionEntry(pageId);
  const navigate = usePageMentionNavigate();
  const resolver = usePageMentionResolver();

  if (!pageId) {
    return (
      <NodeViewWrapper
        as="span"
        className="tiptap-page-mention tiptap-page-mention--restricted"
        aria-disabled="true"
        contentEditable={false}
      >
        <Lock size={12} className="shrink-0" />
        <span className="tiptap-page-mention-label">Restricted</span>
      </NodeViewWrapper>
    );
  }

  const viewState = getPageMentionViewState(entry);
  const routeContext = resolver?.routeContext() ?? null;
  const canNavigate = viewState.kind === "accessible" && routeContext !== null;

  const handleClick = (e: React.MouseEvent) => {
    if (!routeContext || viewState.kind !== "accessible") return;
    e.preventDefault();
    navigate({ pageId, ...routeContext });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!routeContext || viewState.kind !== "accessible") return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate({ pageId, ...routeContext });
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
        <Lock size={12} className="shrink-0" />
        <span className="tiptap-page-mention-label">{viewState.label}</span>
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
        <span className="tiptap-page-mention-icon" aria-hidden="true">
          <Loader2 size={12} className="animate-spin" />
        </span>
        <span className="tiptap-page-mention-label">{viewState.label}</span>
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
      <span className="tiptap-page-mention-icon" aria-hidden="true">
        {viewState.icon ? viewState.icon : <FileText size={12} />}
      </span>
      <span className="tiptap-page-mention-label">{viewState.label}</span>
    </NodeViewWrapper>
  );
}
