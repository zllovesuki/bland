import { FloatingPortal } from "@floating-ui/react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";
import { CalloutKindContent, getCalloutKindMeta } from "@/shared/editor/components/callout";
import { preserveEditorSelectionOnMouseDown, useEditorPopover } from "../../controllers/menu/popover";
import { useEditorAffordance } from "../../editor-affordance-context";
import { CALLOUT_KINDS, normalizeCalloutKind, type CalloutKind } from "./kinds";

export function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const { documentEditable } = useEditorAffordance();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const kind = normalizeCalloutKind(node.attrs.kind);
  const { label } = getCalloutKindMeta(kind);

  const { floatingStyles, getFloatingProps, refs } = useEditorPopover({
    open,
    onClose: () => setOpen(false),
    anchorRef: btnRef,
    // Open above the pill so the callout body stays readable while the user
    // changes kind; flip middleware falls back to bottom-start near viewport top.
    placement: "top-start",
    offset: 6,
    padding: 8,
  });

  const selectKind = useCallback(
    (next: CalloutKind) => {
      updateAttributes({ kind: next });
      setOpen(false);
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper className="tiptap-callout" data-callout="" data-callout-kind={kind}>
      <button
        ref={btnRef}
        type="button"
        className="tiptap-callout-kind-btn"
        onClick={() => documentEditable && setOpen((prev) => !prev)}
        onMouseDown={(e) => e.preventDefault()}
        contentEditable={false}
        aria-haspopup={documentEditable ? "menu" : undefined}
        aria-expanded={documentEditable ? open : undefined}
        aria-label={documentEditable ? `Callout kind: ${label}. Click to change.` : `Callout: ${label}`}
        disabled={!documentEditable}
      >
        <CalloutKindContent kind={kind} />
      </button>

      {documentEditable && open && (
        <FloatingPortal>
          <div
            ref={(el) => {
              refs.setFloating(el);
            }}
            role="menu"
            aria-label="Callout kind"
            className="animate-fade-in tiptap-menu-surface tiptap-callout-kind-menu"
            style={{ ...floatingStyles, zIndex: 50 }}
            {...getFloatingProps({
              onMouseDownCapture: (e) => preserveEditorSelectionOnMouseDown(e),
            })}
          >
            {CALLOUT_KINDS.map((candidate) => {
              const meta = getCalloutKindMeta(candidate);
              const active = candidate === kind;
              return (
                <button
                  key={candidate}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`tiptap-menu-item tiptap-callout-kind-item${active ? " is-active" : ""}`}
                  data-callout-kind={candidate}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectKind(candidate)}
                >
                  <meta.Icon size={14} aria-hidden />
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}

      <NodeViewContent className="tiptap-callout-body" />
    </NodeViewWrapper>
  );
}
