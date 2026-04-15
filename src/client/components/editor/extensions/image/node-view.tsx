import { useRef, useCallback, useState, useEffect } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { ImageIcon, X } from "lucide-react";
import { useEditorRuntime } from "../../editor-runtime-context";
import { showImageInsertPanel } from "../../controllers/image/insert-panel";
import { prepareBlockDragPreview } from "../../lib/block-drag-preview";
import { createImageNodeTarget, resolveShareUrl } from "../../lib/media-actions";
import "../../styles/image-node.css";

export function ImageNodeView({ node, selected, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const { workspaceId, pageId, shareToken } = useEditorRuntime();
  const { src, alt = "", title, align = "left", width } = node.attrs;
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const editable = editor.isEditable;

  const resolvedSrc = resolveShareUrl(typeof src === "string" ? src : "", shareToken);

  const finishDrag = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dragRef.current = null;
    setLiveWidth(null);
  }, []);

  useEffect(() => () => finishDrag(), [finishDrag]);
  useEffect(() => {
    if (!editable) return;

    const handleDocumentDragStart = (event: DragEvent) => {
      if (!event.dataTransfer || liveWidth !== null) return;

      const imageDom = imgRef.current;
      const dragSource = imageDom?.closest(".react-renderer.node-image");
      const target = event.target;
      if (!(dragSource instanceof HTMLElement) || !(target instanceof Node) || !dragSource.contains(target)) return;

      const pos = getPos();
      if (typeof pos !== "number") return;

      prepareBlockDragPreview(editor, pos, event.dataTransfer);
    };

    document.addEventListener("dragstart", handleDocumentDragStart, true);
    return () => document.removeEventListener("dragstart", handleDocumentDragStart, true);
  }, [editable, editor, getPos, liveWidth]);

  const handleResizeStart = useCallback(
    (side: "left" | "right", e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const img = imgRef.current;
      if (!img || img.offsetWidth <= 0) return;

      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      finishDrag();
      const ac = new AbortController();
      abortRef.current = ac;

      const startX = e.clientX;
      const startWidth = img.offsetWidth;
      const minWidth = Math.min(40, startWidth);
      const dir = side === "right" ? 1 : -1;

      document.addEventListener(
        "pointermove",
        (ev: PointerEvent) => {
          const newWidth = Math.max(minWidth, startWidth + dir * (ev.clientX - startX));
          dragRef.current = newWidth;
          setLiveWidth(newWidth);
        },
        { signal: ac.signal },
      );

      document.addEventListener(
        "pointerup",
        () => {
          if (dragRef.current !== null) {
            updateAttributes({ width: Math.round(dragRef.current) });
          }
          finishDrag();
        },
        { signal: ac.signal },
      );
    },
    [updateAttributes, finishDrag],
  );
  const displayWidth = liveWidth ?? (typeof width === "number" ? width : undefined);
  const alignClass =
    align === "center"
      ? "tiptap-image-node--align-center"
      : align === "right"
        ? "tiptap-image-node--align-right"
        : "tiptap-image-node--align-left";

  const uploadCtx = { workspaceId, pageId, shareToken };
  const openImagePanel = useCallback(() => {
    if (!editor.isEditable) return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    showImageInsertPanel(editor, {
      uploadContext: uploadCtx,
      target: createImageNodeTarget(editor, pos),
    });
  }, [editor, getPos, pageId, shareToken, workspaceId]);

  if (!resolvedSrc) {
    return (
      <NodeViewWrapper>
        <div
          className="tiptap-image-placeholder"
          onClick={editor.isEditable ? openImagePanel : undefined}
          style={editor.isEditable ? undefined : { cursor: "default" }}
        >
          <ImageIcon size={20} />
          <span>{editor.isEditable ? "Add an image" : "Image"}</span>
          {editor.isEditable && (
            <button
              type="button"
              title="Remove"
              className="tiptap-image-placeholder-close"
              onClick={(e) => {
                e.stopPropagation();
                deleteNode();
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className={`tiptap-image-node ${alignClass}`}>
      <div
        className={`tiptap-image-container${selected ? " is-selected" : ""}`}
        style={displayWidth ? { width: `${displayWidth}px` } : undefined}
      >
        <img
          className="tiptap-image"
          ref={imgRef}
          src={resolvedSrc}
          alt={alt ?? undefined}
          title={title ?? undefined}
          draggable={false}
          data-drag-handle={editable ? "" : undefined}
          style={displayWidth ? { width: "100%" } : undefined}
        />
        {editable && (
          <>
            <div className="tiptap-image-resize-handle left" onPointerDown={(e) => handleResizeStart("left", e)} />
            <div className="tiptap-image-resize-handle right" onPointerDown={(e) => handleResizeStart("right", e)} />
          </>
        )}
        {alt && <figcaption className="tiptap-image-alt">{alt}</figcaption>}
      </div>
    </NodeViewWrapper>
  );
}
