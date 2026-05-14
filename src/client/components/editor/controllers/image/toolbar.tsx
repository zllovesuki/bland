import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, type CSSProperties } from "react";
import { useTiptap, useTiptapState, type Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { autoUpdate as autoUpdateDom, computePosition, offset, shift } from "@floating-ui/dom";
import { FloatingPortal } from "@floating-ui/react";
import { Replace, Trash2, TextCursorInput, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { useEditorAffordance } from "../../editor-affordance-context";
import { useEditorRuntime } from "../../editor-runtime-context";
import {
  createImageNodeTarget,
  deleteImageAtTarget,
  triggerFileUploadAtTarget,
  updateImageAttributesAtTarget,
} from "../../lib/media-actions";
import "../../styles/floating-controls.css";

interface ImageState {
  pos: number;
  src: string;
  alt: string;
  align: string;
}

interface ImageInsetState {
  key: string | null;
  value: boolean;
}

interface ImageFloatingState {
  key: string | null;
  styles: CSSProperties;
}

interface ImageAltEditState {
  key: string | null;
  editing: boolean;
  text: string;
}

const IMAGE_TOOLBAR_MIN_INSET_WIDTH = 236;
const IMAGE_TOOLBAR_MIN_INSET_HEIGHT = 88;

function canInsetImageToolbar(rect: Pick<DOMRectReadOnly, "width" | "height">, editingAlt: boolean) {
  return !editingAlt && rect.width >= IMAGE_TOOLBAR_MIN_INSET_WIDTH && rect.height >= IMAGE_TOOLBAR_MIN_INSET_HEIGHT;
}

function hiddenToolbarStyles(): CSSProperties {
  return {
    position: "fixed",
    left: 0,
    top: 0,
    visibility: "hidden",
  };
}

function sameToolbarStyles(a: CSSProperties, b: CSSProperties) {
  return a.left === b.left && a.top === b.top && a.position === b.position && a.visibility === b.visibility;
}

function sameFloatingState(a: ImageFloatingState, b: ImageFloatingState) {
  return a.key === b.key && sameToolbarStyles(a.styles, b.styles);
}

function resolveImageReference(editor: Editor, pos: number) {
  const dom = editor.view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  const container = dom.querySelector(".tiptap-image-container") ?? dom;
  return container instanceof HTMLElement ? container : null;
}

export function ImageToolbar() {
  const { editor } = useTiptap();
  const { workspaceId, pageId, shareToken } = useEditorRuntime();
  const affordance = useEditorAffordance();
  const [altEditState, setAltEditState] = useState<ImageAltEditState>({ key: null, editing: false, text: "" });
  const [insetState, setInsetState] = useState<ImageInsetState>({ key: null, value: false });
  const [floatingElement, setFloatingElement] = useState<HTMLDivElement | null>(null);
  const [floatingState, setFloatingState] = useState<ImageFloatingState>(() => ({
    key: null,
    styles: hiddenToolbarStyles(),
  }));
  const forcedPosRef = useRef<number | null>(null);
  const lastFloatingStateRef = useRef<ImageFloatingState>({ key: null, styles: hiddenToolbarStyles() });

  const imageState = useTiptapState((ctx): ImageState | null => {
    const { selection } = ctx.editor.state;

    if (forcedPosRef.current !== null) {
      const node = ctx.editor.state.doc.nodeAt(forcedPosRef.current);
      if (node?.type.name === "image" && node.attrs.src) {
        return {
          pos: forcedPosRef.current,
          src: node.attrs.src as string,
          alt: (node.attrs.alt as string) ?? "",
          align: (node.attrs.align as string) ?? "left",
        };
      }
      forcedPosRef.current = null;
    }

    if (!(selection instanceof NodeSelection)) return null;
    const node = selection.node;
    if (node.type.name !== "image" || !node.attrs.src) return null;
    return {
      pos: selection.from,
      src: node.attrs.src as string,
      alt: (node.attrs.alt as string) ?? "",
      align: (node.attrs.align as string) ?? "left",
    };
  });

  const imageKey = imageState ? `${imageState.pos}:${imageState.src}` : null;
  const imagePos = imageState?.pos ?? null;
  const floatingStyles = floatingState.key === imageKey ? floatingState.styles : hiddenToolbarStyles();
  const useInsetPosition = insetState.key === imageKey ? insetState.value : false;
  const editingAlt = imageKey !== null && altEditState.key === imageKey && altEditState.editing;
  const altText = altEditState.key === imageKey ? altEditState.text : "";
  const open = imageState !== null;

  const placement = useInsetPosition ? "top-end" : "top";
  const middleware = useMemo(
    () => [offset(useInsetPosition ? { mainAxis: -50, crossAxis: -8 } : 10), shift({ padding: 10 })],
    [useInsetPosition],
  );

  const commitFloatingState = useCallback((next: ImageFloatingState) => {
    if (sameFloatingState(lastFloatingStateRef.current, next)) return;
    lastFloatingStateRef.current = next;
    setFloatingState(next);
  }, []);

  const hideToolbar = useCallback(() => {
    commitFloatingState({ key: null, styles: hiddenToolbarStyles() });
  }, [commitFloatingState]);

  const setFloatingNode = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        hideToolbar();
      }
      setFloatingElement(node);
    },
    [hideToolbar],
  );

  useLayoutEffect(() => {
    if (!open || imagePos === null || !imageKey || !floatingElement) {
      hideToolbar();
      return;
    }

    const initialReference = resolveImageReference(editor, imagePos);
    if (!initialReference) {
      hideToolbar();
      return;
    }

    let active = true;

    // The image toolbar anchors to a selected node view owned outside this
    // component tree. Position it from the resolved DOM node directly instead
    // of useFloating's reference lifecycle; otherwise it can render at (0, 0)
    // even though the image selection is correct.
    const updatePosition = async () => {
      const referenceEl = resolveImageReference(editor, imagePos);
      if (!referenceEl) {
        if (active) hideToolbar();
        return;
      }

      const next = await computePosition(referenceEl, floatingElement, {
        placement,
        strategy: "fixed",
        middleware,
      });

      if (!active) return;

      commitFloatingState({
        key: imageKey,
        styles: {
          position: "fixed",
          left: next.x,
          top: next.y,
        },
      });
    };

    const cleanup = autoUpdateDom(initialReference, floatingElement, updatePosition);
    void updatePosition();

    return () => {
      active = false;
      cleanup();
    };
  }, [commitFloatingState, editor, floatingElement, hideToolbar, imageKey, imagePos, middleware, open, placement]);

  useEffect(() => {
    if (!imageKey || imagePos === null) return;

    const referenceEl = resolveImageReference(editor, imagePos);
    if (!referenceEl) return;

    let rafId: number | null = null;
    const updatePlacement = () => {
      const currentReference = resolveImageReference(editor, imagePos);
      if (!currentReference) return;
      const nextInsetPosition = canInsetImageToolbar(currentReference.getBoundingClientRect(), editingAlt);
      setInsetState((current) =>
        current.key === imageKey && current.value === nextInsetPosition
          ? current
          : { key: imageKey, value: nextInsetPosition },
      );
    };
    const schedule = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updatePlacement();
      });
    };
    updatePlacement();

    const observer = new ResizeObserver(schedule);
    observer.observe(referenceEl);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [editor, editingAlt, imageKey, imagePos]);

  const updateImageAttr = useCallback(
    (attrs: Record<string, unknown>) => {
      if (!imageState) return;
      updateImageAttributesAtTarget(editor, createImageNodeTarget(editor, imageState.pos), attrs);
    },
    [editor, imageState],
  );

  const deleteImage = useCallback(() => {
    if (!imageState) return;
    deleteImageAtTarget(editor, createImageNodeTarget(editor, imageState.pos));
  }, [editor, imageState]);

  const handleAltEdit = () => {
    if (!imageState || !imageKey) return;
    forcedPosRef.current = imageState.pos;
    setAltEditState({ key: imageKey, editing: true, text: imageState.alt });
  };

  const handleAltSave = () => {
    updateImageAttr({ alt: altText || null });
    forcedPosRef.current = null;
    setAltEditState((current) => (current.key === imageKey ? { ...current, editing: false } : current));
  };

  const handleAltCancel = () => {
    forcedPosRef.current = null;
    setAltEditState((current) => (current.key === imageKey ? { ...current, editing: false } : current));
  };

  const handleAltInput = (text: string) => {
    if (!imageKey) return;
    setAltEditState((current) =>
      current.key === imageKey ? { ...current, text } : { key: imageKey, editing: true, text },
    );
  };

  const uploadCtx = useMemo(() => ({ workspaceId, pageId, shareToken }), [pageId, shareToken, workspaceId]);

  if (!editor || !affordance.documentEditable || !open) return null;
  const isEditingAlt = editingAlt && imageState !== null;

  return (
    <FloatingPortal>
      <div
        ref={setFloatingNode}
        style={{ ...floatingStyles, zIndex: 50 }}
        className="tiptap-toolbar tiptap-image-toolbar"
        onMouseDownCapture={(e) => {
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        {isEditingAlt ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={altText}
              onChange={(e) => handleAltInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAltSave();
                if (e.key === "Escape") handleAltCancel();
              }}
              placeholder="Alt text..."
              className="tiptap-link-input"
              autoFocus
            />
            <button
              type="button"
              title="Save"
              aria-label="Save"
              onMouseDown={(e) => {
                e.preventDefault();
                handleAltSave();
              }}
            >
              <TextCursorInput size={16} />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              title="Replace image"
              aria-label="Replace image"
              disabled={!affordance.canInsertImages}
              onMouseDown={(e) => {
                e.preventDefault();
                if (!imageState) return;
                if (!affordance.canInsertImages) return;
                triggerFileUploadAtTarget(editor, uploadCtx, createImageNodeTarget(editor, imageState.pos));
              }}
            >
              <Replace size={16} />
            </button>
            <button
              type="button"
              title="Alt text"
              aria-label="Alt text"
              onMouseDown={(e) => {
                e.preventDefault();
                handleAltEdit();
              }}
            >
              <TextCursorInput size={16} />
            </button>
            <button
              type="button"
              title="Delete image"
              aria-label="Delete image"
              className="text-red-400"
              onMouseDown={(e) => {
                e.preventDefault();
                deleteImage();
              }}
            >
              <Trash2 size={16} />
            </button>
            <div className="tiptap-toolbar-sep" />
            {(["left", "center", "right"] as const).map((a) => {
              const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              return (
                <button
                  key={a}
                  type="button"
                  title={`Align ${a}`}
                  aria-label={`Align ${a}`}
                  className={imageState.align === a ? "is-active" : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    updateImageAttr({ align: a });
                  }}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </>
        )}
      </div>
    </FloatingPortal>
  );
}
