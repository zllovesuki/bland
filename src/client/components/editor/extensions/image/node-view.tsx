import { useRef, useCallback, useState, useEffect } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { ImageIcon, X } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import { useEditorAffordance } from "../../editor-affordance-context";
import { useEditorRuntime } from "../../editor-runtime-context";
import { showImageInsertPanel } from "../../controllers/image/insert-panel";
import { prepareBlockDragPreview } from "../../lib/block-drag-preview";
import { createImageNodeTarget, getLocalImagePreview, resolveShareUrl } from "../../lib/media-actions";
import "../../styles/image-node.css";

const FALLBACK_ASPECT_RATIO = 16 / 9;

export function ImageNodeView({ node, selected, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const { workspaceId, pageId, shareToken } = useEditorRuntime();
  const { canInsertImages } = useEditorAffordance();
  const { src, alt = "", title, align = "left", width, naturalWidth, naturalHeight, pendingInsertId } = node.attrs;
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "loaded" | "errored">("loading");
  const editable = editor.isEditable;

  const resolvedSrc = resolveShareUrl(typeof src === "string" ? src : "", shareToken);

  useEffect(() => {
    setLoadStatus("loading");
  }, [resolvedSrc]);

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
    if (!editor.isEditable || !canInsertImages) return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    showImageInsertPanel(editor, {
      uploadContext: uploadCtx,
      target: createImageNodeTarget(editor, pos),
    });
  }, [canInsertImages, editor, getPos, pageId, shareToken, workspaceId]);

  const aspectRatio =
    typeof naturalWidth === "number" && typeof naturalHeight === "number" && naturalWidth > 0 && naturalHeight > 0
      ? naturalWidth / naturalHeight
      : FALLBACK_ASPECT_RATIO;
  const pendingPreviewUrl = typeof pendingInsertId === "string" ? getLocalImagePreview(pendingInsertId) : null;

  if (!resolvedSrc) {
    if (pendingPreviewUrl) {
      return (
        <NodeViewWrapper className={`tiptap-image-node ${alignClass}`}>
          <div
            className="tiptap-image-uploading"
            style={{ aspectRatio: String(aspectRatio), width: displayWidth ? `${displayWidth}px` : undefined }}
          >
            <img className="tiptap-image-uploading-preview" src={pendingPreviewUrl} alt="" />
            <Skeleton className="tiptap-image-uploading-skeleton" />
            <span className="tiptap-image-uploading-label">Uploading…</span>
          </div>
        </NodeViewWrapper>
      );
    }
    return (
      <NodeViewWrapper>
        <div
          className="tiptap-image-placeholder"
          onClick={editor.isEditable && canInsertImages ? openImagePanel : undefined}
          style={editor.isEditable && canInsertImages ? undefined : { cursor: "default" }}
        >
          <ImageIcon size={20} />
          <span>{editor.isEditable && canInsertImages ? "Add an image" : "Image"}</span>
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

  const isLoading = loadStatus === "loading";
  const isErrored = loadStatus === "errored";
  const containerStyle: React.CSSProperties | undefined = isLoading
    ? { aspectRatio: String(aspectRatio), width: displayWidth ? `${displayWidth}px` : "100%" }
    : displayWidth
      ? { width: `${displayWidth}px` }
      : undefined;

  const containerClass = [
    "tiptap-image-container",
    selected ? "is-selected" : "",
    isLoading ? "is-loading" : "",
    isErrored ? "is-errored" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <NodeViewWrapper className={`tiptap-image-node ${alignClass}`}>
      <div className={containerClass} style={containerStyle}>
        <img
          className="tiptap-image"
          ref={imgRef}
          src={resolvedSrc}
          alt={alt ?? undefined}
          title={title ?? undefined}
          draggable={false}
          data-drag-handle={editable && !isLoading && !isErrored ? "" : undefined}
          style={displayWidth && !isLoading ? { width: "100%" } : undefined}
          onLoad={() => setLoadStatus("loaded")}
          onError={() => setLoadStatus("errored")}
        />
        {isLoading && <Skeleton className="tiptap-image-load-skeleton" />}
        {isErrored && (
          <div className="tiptap-image-error">
            <ImageIcon size={20} />
            <span>Image failed to load</span>
          </div>
        )}
        {editable && !isLoading && !isErrored && (
          <>
            <div className="tiptap-image-resize-handle left" onPointerDown={(e) => handleResizeStart("left", e)} />
            <div className="tiptap-image-resize-handle right" onPointerDown={(e) => handleResizeStart("right", e)} />
          </>
        )}
        {alt && !isLoading && !isErrored && <figcaption className="tiptap-image-alt">{alt}</figcaption>}
      </div>
    </NodeViewWrapper>
  );
}
